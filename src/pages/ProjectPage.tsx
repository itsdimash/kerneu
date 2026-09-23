import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import type { Role, Page, ProjectState, Receipt } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import { Chip } from "../app/components/common/Chip";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { fmt } from "../lib/format";
import { INVOICES_INIT } from "../data/invoices";
import { STOCK_INIT } from "../data/stock";
import { AlertTriangle, Calculator, CheckCircle2, Loader2, Send, Truck, Check, XCircle, Download, FileText, ChevronDown, Plus, Pencil, Search, Trash2 } from "lucide-react";
import {
  fetchProjectDetails,
  fetchProjectItems,
  getMlImport,
  createEmptyMlImport,
  updateMlImportItem,
  createMlImportItem,
  deleteMlImportItem,
  createProductForMlImportItem,
  createProduct,
  resolveKitProduct,
  confirmMlImport,
  getKitComponents,
  saveMlImportKitComponents,
  fetchProductsAvailability,
  startProjectEditing,
  sendProjectToDirector,
  approveProjectDirector,
  rejectProjectDirector,
  approveProjectClient,
  rejectProjectClient,
  downloadProjectExcel,
  downloadKpDocument,
} from "../api/api";

import type {
  ProjectItem,
  ProjectResponse,
  ProjectItemResponse,
  MlImportDetailResponse,
  MlImportItemResponse,
  MlImportItemCreate,
  MlImportItemCreateProduct,
  MlImportItemUpdate,
  KitComponentResponse,
  ConfirmMlImportKitSelection,
} from "../api/api";
import { MultiSelectCombobox } from "../app/components/ui/multi-select";
import { ProductSearchCombobox } from "../app/components/ui/product-search-combobox";
import { Checkbox } from "../app/components/ui/checkbox";
import { StockStatusBadge } from "../app/components/common/StockStatusBadge";
import { KitGroupHeaderRow } from "../app/components/common/KitGroupHeaderRow";
import { ML_STATUS_STYLES, UNKNOWN_ML_STATUS_STYLE, normalizeMlStatus } from "../lib/stockStatus";
import { groupEntriesByKit } from "../lib/kitGroups";

// Достаёт читаемые текстовые подсказки из similar_variants — ML отдаёт
// их из внешнего Excel-файла в произвольном виде (иногда структурированные
// объекты, иногда просто нераспарсенный текст в raw_value), без id из
// нашей таблицы products. Эти строки используются только как текст для
// сопоставления с реальным каталогом, а не как источник id напрямую.
const getSimilarVariantLabels = (item: MlImportItemResponse): string[] =>
  item.similar_variants
    .map((variant) => {
      const label =
        variant.product_name ??
        variant.name ??
        variant.raw_value ??
        variant.value;
      return typeof label === "string" ? label.trim() : null;
    })
    .filter((label): label is string => Boolean(label));

// Позиция и допустимая высота выпадашки «Совпавший товар» — top при
// открытии вниз, bottom при открытии вверх (см. computePickerPosition).
type PickerPosition = { left: number; width: number; maxHeight: number } & (
  | { top: number; bottom?: undefined }
  | { bottom: number; top?: undefined }
);

// Раньше высота выпадашки была фиксированной константой (28rem/448px)
// независимо от того, где на экране открыт триггер — из-за этого при
// открытии в нижней половине окна весь блок (включая sticky-футер с
// кнопкой «Применить») мог целиком уезжать за нижний край видимого
// вьюпорта: sticky корректно прилипал к низу СВОЕГО скролл-контейнера,
// но сам контейнер был ниже видимой области, и футер был не виден без
// скролла страницы. Теперь высота считается по фактически доступному
// пространству в выбранную сторону, а при недостатке места снизу список
// открывается вверх от триггера.
const PICKER_PREFERRED_MAX_HEIGHT = 448; // px, было max-h-[28rem]
const PICKER_VIEWPORT_MARGIN = 8;
const PICKER_MIN_HEIGHT = 160;

const computePickerPosition = (rect: DOMRect): PickerPosition => {
  const left = rect.left;
  const width = Math.max(rect.width, 416);

  const spaceBelow = window.innerHeight - rect.bottom - 4 - PICKER_VIEWPORT_MARGIN;
  const spaceAbove = rect.top - 4 - PICKER_VIEWPORT_MARGIN;
  const openUpward = spaceBelow < PICKER_MIN_HEIGHT && spaceAbove > spaceBelow;

  const maxHeight = Math.max(
    PICKER_MIN_HEIGHT,
    Math.min(PICKER_PREFERRED_MAX_HEIGHT, openUpward ? spaceAbove : spaceBelow),
  );

  return openUpward
    ? { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight }
    : { top: rect.bottom + 4, left, width, maxHeight };
};

type CatalogProduct = {
  id: number;
  name: string;
  unit?: string | null;
  price?: number | string | null;
  // Товар-комплект: при выборе такой строки ПМ дополнительно подбирает
  // состав (см. kitPickerItem / openKitPicker ниже) вместо того, чтобы сразу
  // закрыть попап выбора товара.
  is_kit?: boolean;
};

type MlRowState = {
  // Строке требуется привязка к реальному товару из products.
  // ВАЖНО: это единственный критерий — не ml_status. ML проставляет
  // matched_product (текстом) даже там, где selected_product_id остался
  // NULL, а backend при confirm требует именно selected_product_id.
  needsProduct: boolean;
  // Человекочитаемые причины, по которым строка не готова к импорту.
  // Тот же набор правил, что и на backend в confirm_ml_import.
  reasons: string[];
  isReady: boolean;
};

// is_kit строки может отсутствовать (старый backend/строка ещё не
// пересчитана) — тогда падаем на is_kit привязанного товара из каталога,
// ровно как buildKitSelectionsPayload ниже. hasEmptyComponents — отдельно:
// blocking только когда kit_components ПРИШЁЛ массивом и он пуст; если
// backend это поле вообще не отдаёт (undefined), считать строку пустым
// комплектом нельзя — это не то же самое, что "состав не выбран".
const getItemKitStatus = (
  item: MlImportItemResponse,
  productCatalog: CatalogProduct[],
): { isKit: boolean; hasEmptyComponents: boolean } => {
  const selectedProduct =
    item.selected_product_id != null
      ? productCatalog.find((p) => p.id === item.selected_product_id)
      : undefined;
  return {
    isKit: item.is_kit ?? selectedProduct?.is_kit ?? false,
    hasEmptyComponents: Array.isArray(item.kit_components) && item.kit_components.length === 0,
  };
};

// Единый источник правды о готовности строки ML-импорта.
//
// РАНЬШЕ правил было два и они противоречили друг другу:
//   * needsProductResolution включал "Возможное совпадение (требует
//     проверки)", а RESOLVABLE_ML_STATUSES — нет. Кнопка "Добавить товар"
//     рисовалась, но openProductModal молча делал return, и модалка не
//     открывалась.
//   * canConfirmMlImport требовал selected_product_id только для двух
//     статусов "Нет в системе*", а backend требует его для всех строк.
//     Фронт разрешал нажать "Подтвердить импорт", backend отвечал 400.
//
// Теперь и кнопка в строке, и блокировка confirm, и текст подсказки
// считаются здесь — рассинхрон между ними стал невозможен.
const getMlRowState = (
  item: MlImportItemResponse,
  productCatalog: CatalogProduct[],
): MlRowState => {
  if (item.is_confirmed) {
    return { needsProduct: false, reasons: [], isReady: true };
  }

  const quantity = Number(item.final_quantity ?? item.input_quantity ?? 0);
  const price = Number(item.price ?? 0);
  const needsProduct = item.selected_product_id == null;

  const reasons: string[] = [];

  if (needsProduct) {
    reasons.push("не выбран товар из каталога");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    reasons.push("количество должно быть больше нуля");
  }
  if (!Number.isFinite(price) || price <= 0) {
    reasons.push("цена продажи должна быть больше нуля");
  }
  // Себестоимость и поставщик больше не вводятся на ProjectPage — их
  // заполняет Закупка на ProcurementPage (см. cost_price/supplier перенос).
  const kitStatus = getItemKitStatus(item, productCatalog);
  if (kitStatus.isKit && kitStatus.hasEmptyComponents) {
    reasons.push("Комплект: выберите состав");
  }

  return { needsProduct, reasons, isReady: reasons.length === 0 };
};

const namesLooselyMatch = (catalogName: string, label: string): boolean => {
  const left = catalogName.trim().toLowerCase();
  const right = label.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
};

type EstimateRow = {
  id: number;
  name: string;
  code: string | null;
  quantity: number;
  estimatedPrice: number | null;
};

function EstimateTable({ rows }: { rows: EstimateRow[] }) {
  const formatEstimateMoney = (value: number) =>
    new Intl.NumberFormat("ru-KZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value) + " ₸";

  const estimatedTotal = rows.reduce(
    (sum, row) => sum + (row.estimatedPrice ?? 0) * row.quantity,
    0,
  );

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border bg-background/60 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Смета проекта</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Справочные цены КазНИИСА. Они не участвуют в расчёте себестоимости и маржи.
          </p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-blue-50 dark:bg-blue-400/15 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-blue-200">
          План
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-card">
              {["Товар", "Код", "Количество", "Сметная цена", "Сметная сумма"].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  В смете пока нет позиций
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const rowTotal = (row.estimatedPrice ?? 0) * row.quantity;

                return (
                  <tr key={row.id} className="hover:bg-background/50">
                    <td className="px-4 py-3 text-sm text-foreground">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.code ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-sm text-foreground">
                      {row.quantity.toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-foreground">
                      {row.estimatedPrice == null ? "Не найдена" : formatEstimateMoney(row.estimatedPrice)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-foreground">
                      {row.estimatedPrice == null ? "—" : formatEstimateMoney(rowTotal)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-background/80">
              <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                Итого по смете
              </td>
              <td className="px-4 py-3 font-mono text-base font-bold text-primary">
                {formatEstimateMoney(estimatedTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function ProjectPagePM({
  onNavigate,
  projectState,
  onKpSent,
  projectId,
}: {
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  onKpSent: () => void;
  receipts: Receipt[];
  projectItems: ProjectItem[];
  projectId: number;
})  {
  const [sending, setSending] = useState(false);

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [mlImport, setMlImport] = useState<MlImportDetailResponse | null>(null);
  const [mlImportLoading, setMlImportLoading] = useState(false);
  const [mlImportError, setMlImportError] = useState<string | null>(null);
  const mlImportErrorRef = useRef<HTMLDivElement | null>(null);

  // После confirm_ml_import черновик ml-импорта больше не отражает
  // реальность — Комдир может поправить поставщика/себестоимость/цену
  // прямо в ProjectItem, а строки ml-импорта останутся со старыми
  // значениями. liveItems — это то же самое, что видит Комдир, читаем
  // напрямую из /project-items, чтобы ПМ видел актуальные цифры.
  const [liveItems, setLiveItems] = useState<ProjectItemResponse[]>([]);
  const [liveItemsLoading, setLiveItemsLoading] = useState(false);
  const [liveItemsError, setLiveItemsError] = useState<string | null>(null);
  // Развёрнутость групп-комплектов в финальной таблице позиций — по
  // kit_group_key, а не по индексу строки, чтобы переживать перезапросы
  // liveItems (id группы не меняется, порядок массива — может). Раскрыта
  // по умолчанию: отсутствие ключа в записи трактуется как true.
  const [expandedLiveKitGroups, setExpandedLiveKitGroups] = useState<Record<string, boolean>>({});
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  // Ручное добавление позиции в черновик: форма живёт последней строкой
  // таблицы, дальше строка дозаполняется теми же инлайн-полями, что и
  // распарсенные — отдельная модалка дублировала бы их без пользы.
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [savingNewRow, setSavingNewRow] = useState(false);
  // Проект, созданный вручную («Пустой проект» на дашборде), приходит без
  // ML-импорта — файла не было, парсить нечего. Черновик импорта создаётся
  // лениво, по первому клику «Добавить позицию».
  const [creatingEmptyImport, setCreatingEmptyImport] = useState(false);
  const [newRowForm, setNewRowForm] = useState({
    input_product: "",
    input_quantity: "1",
    selected_product_id: null as number | null,
    unit: null as string | null,
  });
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingKP, setIsGeneratingKP] = useState(false);
  const [kpGenerated, setKpGenerated] = useState(false);
  const [approvingClient, setApprovingClient] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [productModalItem, setProductModalItem] =
    useState<MlImportItemResponse | null>(null);
  const [productModalForm, setProductModalForm] = useState({
    product_name: "",
    unit: "шт",
    price: "",
    is_kit: false,
  });
  const [productModalError, setProductModalError] = useState<string | null>(null);
  // Строка уже привязана к товару, но пользователь хочет создать вместо него
  // новый (ML мог сопоставить уверенно, но неверно). Backend запрещает
  // create-product для привязанной строки, поэтому привязку снимаем сами,
  // непосредственно перед созданием.
  const [unlinkBeforeCreate, setUnlinkBeforeCreate] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);

  // Каталог товаров нужен для любой строки ML-импорта, у которой
  // selected_product_id остался NULL. ML кладёт в similar_variants данные
  // из внешнего Excel-файла БЕЗ id из нашей таблицы products (а для
  // статусов "Возможное совпадение" и "Есть в системе (недостаточно)"
  // similar_variants чаще всего вообще пустой) — поэтому PM обязан выбрать
  // реальный товар из каталога либо создать новый.
  const [productCatalog, setProductCatalog] = useState<CatalogProduct[]>([]);
  const [productCatalogLoading, setProductCatalogLoading] = useState(false);
  const [openVariantPickerId, setOpenVariantPickerId] = useState<number | null>(null);
  // Выпадашка выбора товара рендерится порталом в <body> (см. ниже), а не
  // внутри таблицы — контейнер таблицы имеет overflow-x-auto, а CSS в этом
  // случае автоматически делает overflow-y тоже обрезающим, из-за чего
  // список обрезался снизу и требовал скролла внутри крошечной области.
  // Позиция считается от кнопки-триггера в момент открытия.
  // top задан при открытии вниз (обычный случай), bottom — при открытии
  // вверх, когда снизу триггера не хватает места. maxHeight считается по
  // фактически доступному пространству вьюпорта в выбранную сторону, а не
  // фиксированной константой — иначе при открытии в нижней половине экрана
  // сам блок (включая sticky-футер с «Применить») мог целиком уезжать за
  // нижний край окна, и его было не видно без скролла СТРАНИЦЫ (см. баг:
  // «Применить» рендерился в DOM и sticky работал корректно относительно
  // своего скролл-контейнера, но сам контейнер помещался ниже видимой
  // области viewport).
  const [pickerPosition, setPickerPosition] = useState<PickerPosition | null>(null);
  const [productSearch, setProductSearch] = useState("");
  // Отметки чекбоксами в открытом дропдауне «Совпавший товар» — общие для
  // всего компонента, а не per-row, потому что дропдаун в любой момент
  // открыт максимум для одной строки (openVariantPickerId). Сбрасываются
  // при каждом открытии/закрытии дропдауна конкретной строки (см. onClick
  // кнопки-триггера ниже) — иначе отметки одной строки утекли бы в другую.
  const [selectedProductIdsInDropdown, setSelectedProductIdsInDropdown] = useState<string[]>([]);

  // Кит-пикер: открывается вместо немедленного закрытия попапа выбора
  // товара, когда выбранный товар — комплект (is_kit). kitPickerItem/
  // kitPickerProduct — строка ML-импорта и сам товар-комплект, для которых
  // сейчас подбирается состав.
  const [kitPickerItem, setKitPickerItem] = useState<MlImportItemResponse | null>(null);
  const [kitPickerProduct, setKitPickerProduct] = useState<CatalogProduct | null>(null);
  const [kitSelectedIds, setKitSelectedIds] = useState<string[]>([]);
  const [kitQuantities, setKitQuantities] = useState<Record<string, number>>({});
  const [kitLoading, setKitLoading] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  // Короткая инлайн-подсказка на случай, когда /products/resolve-kit
  // уникализировал имя комплекта из-за коллизии (см.
  // handleResolveKitFromChecked) — чтобы ПМ не удивлялся молча, почему
  // итоговое имя товара отличается от текста строки.
  const [kitResolveNotice, setKitResolveNotice] = useState<string | null>(null);
  // Состав комплекта по каждой строке ML-импорта, подтверждённый ПМ через
  // кит-пикер. Хранится на фронте до подтверждения импорта — уходит на
  // backend целиком вместе с confirmMlImport (см. handleConfirmMlImport).
  const [kitComponentsByItemId, setKitComponentsByItemId] = useState<
    Record<number, { component_product_id: number; quantity: number; price_cost?: number | null }[]>
  >({});
  // Введённая ПМ себестоимость за единицу компонента в открытом кит-пикере
  // (component_product_id -> сырой текст поля). Ключ присутствует, только
  // если ПМ реально ввёл значение в этой сессии (включая typed 0) —
  // отсутствие ключа означает "не введено", а не 0. Только для коммерческих
  // импортов (см. isWarehouseRequest) — у "Заявка на склад" цен нет вовсе.
  //
  // Хранится строкой, а не числом: контролируемый <input type="number">,
  // немедленно приводящий введённый текст к числу и кладущий это число
  // обратно в value, съедает недописанную десятичную часть — ввод "12."
  // после следующей цифры превращался в "125" вместо "12.5", потому что
  // React на каждый рендер откатывал value к уже распарсенному "12".
  // Парсинг в число происходит только в точках потребления (см.
  // parseKitComponentCost).
  const [kitComponentCosts, setKitComponentCosts] = useState<Record<string, string>>({});

  // Приводит сырой текст поля себестоимости к валидному неотрицательному
  // числу, либо null для пустой/недописанной/некорректной строки (например
  // одиночная точка "."). Используется везде, где kitComponentCosts
  // реально считывается — сам инпут хранит и показывает сырой текст.
  const parseKitComponentCost = (raw: string | undefined): number | null => {
    if (raw == null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  // Сохранение состава на backend (saveMlImportKitComponents) — отдельно от
  // kitLoading (загрузка дефолтного состава при открытии), чтобы кнопка
  // "Сохранить состав" не путалась со спиннером открытия пикера.
  const [kitSaving, setKitSaving] = useState(false);
  // Живые остатки по товарам-компонентам текущего комплекта (product_id ->
  // available_quantity), подтягиваются с /products/availability при
  // открытии пикера и каждом изменении набора выбранных компонентов —
  // заменяют собой несуществующий ml_status у CatalogProduct.
  const [kitAvailability, setKitAvailability] = useState<Record<string, number>>({});
  const [kitAvailabilityLoading, setKitAvailabilityLoading] = useState(false);
  const [kitAvailabilityError, setKitAvailabilityError] = useState<string | null>(null);
  // Счётчик запросов остатков — увеличивается на каждый новый запрос,
  // ответ применяется только если счётчик не успел уйти вперёд (пикер не
  // переоткрыли для другого товара, набор компонентов не сменился ещё раз
  // за время в полёте предыдущего запроса).
  const kitAvailabilityRequestRef = useRef(0);

  const resolvedProjectId = projectId; // Let it be a string or a number!
  const hasValidProjectId = Boolean(resolvedProjectId); // Just check that it's not empty
  useEffect(() => {
    if (!hasValidProjectId) {
      setProject(null);
      setProjectError(`Некорректный ID проекта: ${String(projectId)}`);
      return;
    }
    let cancelled = false;
    setProjectError(null);
    setKpGenerated(false);
    fetchProjectDetails(resolvedProjectId)
      .then((data) => { if (!cancelled) { setProject(data); setProjectError(null); } })
      .catch((error) => { if (!cancelled) { setProject(null); setProjectError(error instanceof Error ? error.message : "Не удалось загрузить проект"); } });
    return () => { cancelled = true; };
  }, [resolvedProjectId, hasValidProjectId]);

  useEffect(() => {
    if (!hasValidProjectId) {
      setMlImport(null);
      setMlImportLoading(false);
      return;
    }
    const storageKey = `project:${resolvedProjectId}:mlImportId`;
    const savedImportId = localStorage.getItem(storageKey);
    if (!savedImportId) {
      setMlImport(null);
      setMlImportError(null);
      setMlImportLoading(false);
      return;
    }
    const importId = Number(savedImportId);
    if (!Number.isInteger(importId) || importId <= 0) {
      setMlImport(null);
      setMlImportLoading(false);
      setMlImportError(`Некорректный ID ML-импорта: ${savedImportId}`);
      return;
    }
    let cancelled = false;
    setMlImportLoading(true);
    setMlImportError(null);
    getMlImport(importId)
      .then((data) => {
        if (cancelled) return;
        if (data.project_id !== resolvedProjectId) {
          throw new Error(`ML-импорт ${importId} относится к проекту ${data.project_id}, а открыт проект ${resolvedProjectId}`);
        }
        setMlImport(data);
      })
      .catch((error) => {
        if (cancelled) return;

        // ИЗМЕНЕНО: связка project_id → mlImportId в localStorage может
        // протухнуть — импорт удалили на бэкенде (сброс тестовой БД, ручная
        // чистка) или проект переиспользовал чужой id. Раньше это навсегда
        // блокировало страницу ошибкой "не найден". Забываем протухшую
        // запись и ведём себя так, будто у проекта ещё нет импорта — как
        // и для настоящего нового проекта: черновик заведётся лениво по
        // первому клику «Добавить позицию» через ensureMlImport.
        const isStaleReference =
          (axios.isAxiosError(error) && error.response?.status === 404) ||
          (error instanceof Error && error.message.includes("относится к проекту"));

        localStorage.removeItem(storageKey);
        setMlImport(null);
        setMlImportError(isStaleReference ? null : (error instanceof Error ? error.message : "Не удалось загрузить ML-импорт"));
      })
      .finally(() => { if (!cancelled) setMlImportLoading(false); });
    return () => { cancelled = true; };
  }, [resolvedProjectId, hasValidProjectId]);

  useEffect(() => {
    let cancelled = false;
    setProductCatalogLoading(true);
    fetch("/api/v1/products/", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Ошибка загрузки каталога товаров: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // Защита от смены контракта эндпоинта: если /products/ когда-нибудь
        // начнёт отдавать пагинированный объект вместо массива, старый код
        // падал бы на .filter внутри рендера таблицы.
        const list: CatalogProduct[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.results)
          ? data.results
          : [];
        setProductCatalog(list);
      })
      .catch((error) => { console.error("Не удалось загрузить каталог товаров:", error); })
      .finally(() => { if (!cancelled) setProductCatalogLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Живые остатки компонентов открытого кит-пикера — перезапрашиваются при
  // каждом изменении набора выбранных товаров (добавили/убрали компонент),
  // с debounce 300мс, чтобы не долбить backend на каждый чих чекбокса.
  // Количество на единицу (kitQuantities) в зависимости эффекта нет: оно не
  // меняет НАБОР id, только требуемое количество, которое считается на
  // фронте от уже загруженных остатков — пересчитывать доступность заново
  // не нужно.
  useEffect(() => {
    if (!kitPickerItem || kitSelectedIds.length === 0) {
      setKitAvailability({});
      setKitAvailabilityError(null);
      setKitAvailabilityLoading(false);
      return;
    }

    const requestId = ++kitAvailabilityRequestRef.current;
    setKitAvailabilityLoading(true);

    const timer = setTimeout(() => {
      const productIds = kitSelectedIds.map((id) => Number(id));
      fetchProductsAvailability(productIds)
        .then((items) => {
          if (requestId !== kitAvailabilityRequestRef.current) return;
          const next: Record<string, number> = {};
          // Товары, отсутствующие в ответе, трактуются как остаток 0 — см.
          // контракт /products/availability.
          kitSelectedIds.forEach((id) => { next[id] = 0; });
          items.forEach((entry) => { next[String(entry.product_id)] = entry.available_quantity; });
          setKitAvailability(next);
          setKitAvailabilityError(null);
        })
        .catch((error) => {
          if (requestId !== kitAvailabilityRequestRef.current) return;
          setKitAvailabilityError(
            error instanceof Error ? error.message : "Не удалось получить остатки",
          );
        })
        .finally(() => {
          if (requestId === kitAvailabilityRequestRef.current) setKitAvailabilityLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitPickerItem?.id, kitSelectedIds.join("|")]);

  const currentStatus = project?.status?.status_name || "Новый";

  // Отметки чекбоксами принадлежат конкретному открытому дропдауну — сброс
  // при любой смене (открытие другой строки, закрытие) не даёт им утечь
  // в следующую строку.
  useEffect(() => {
    setSelectedProductIdsInDropdown([]);
  }, [openVariantPickerId]);

  useEffect(() => {
    if (openVariantPickerId === null) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`[data-variant-picker="${openVariantPickerId}"]`)) {
        setOpenVariantPickerId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openVariantPickerId]);

  // Баннер с ошибкой ML-импорта висит НАД таблицей, а таблица широкая
  // (min-w-[1950px]) и длинная. Без этого скролла отказ выглядел как
  // "кнопка не работает": текст ошибки менялся вне видимой области.
  useEffect(() => {
    if (!mlImportError) return;
    mlImportErrorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [mlImportError]);

  const refreshProject = async (): Promise<ProjectResponse> => {
    const updatedProject = await fetchProjectDetails(resolvedProjectId);
    setProject(updatedProject);
    setProjectError(null);
    return updatedProject;
  };

  useEffect(() => {
    if (!mlImport) return;
    let cancelled = false;
    getMlImport(mlImport.id)
      .then((data) => { if (!cancelled) setMlImport(data); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus]);

  useEffect(() => {
    if (!hasValidProjectId || mlImport?.status !== "confirmed") {
      setLiveItems([]);
      return;
    }
    let cancelled = false;
    setLiveItemsLoading(true);
    setLiveItemsError(null);
    fetchProjectItems(resolvedProjectId)
      .then((data) => { if (!cancelled) setLiveItems(data); })
      .catch((error) => {
        if (!cancelled) {
          setLiveItemsError(error instanceof Error ? error.message : "Не удалось загрузить позиции проекта");
        }
      })
      .finally(() => { if (!cancelled) setLiveItemsLoading(false); });
    return () => { cancelled = true; };
    // Перечитываем при каждой смене статуса проекта — например, когда
    // Комдир сохранил правки и/или принял решение, а ПМ уже открыл
    // страницу и просто ждёт.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedProjectId, hasValidProjectId, mlImport?.status, mlImport?.id, currentStatus]);

  const statusToIndex: Record<string, number> = {
    "Новый": 0,
    "Новый проект": 0,
    "В редактировании": 1,
    "На согласовании у Комдира": 2,
    "Отклонено Комдиром": 2,
    "Одобрено Комдиром": 3,
    "Ожидание клиента": 3,
    "Ожидание подписания": 4,
    "Активный закуп": 5,
    "На приходе": 6,
    "На отгрузке": 7,
    "Ожидание документов": 8,
    "Завершен": 9,
  };

  // NEW: экспресс-проект («Загрузить договор» на дашборде). Договор уже
  // подписан, согласовывать не с кем: этапы КП, Комдира, клиента и
  // подписания к нему не относятся и в степпере не показываются, а
  // подтверждение импорта уводит проект сразу в «Активный закуп».
  const isExpress = project?.is_express === true;

  // NEW: «Заявка на склад» (кнопка на дашборде создаёт проект вручную, без
  // файла). Единственный надёжный признак с бэкенда — source_file_name
  // ml_import'а: /ml-imports/empty всегда проставляет туда константу
  // MANUAL_IMPORT_SOURCE_NAME (см. ml_import_service.py). modalMode на
  // дашборде для этого не годится — он не переживает переход на страницу
  // проекта и тем более перезагрузку.
  const isWarehouseRequest = mlImport?.source_file_name === "Добавлено вручную";

  const currentIndex = statusToIndex[currentStatus] ?? 0;
  const isKpApproved = project ? currentIndex >= 3 : projectState.kpApproved;
  const isPendingDirector = currentStatus === "На согласовании у Комдира";
  const isRejected = currentStatus === "Отклонено Комдиром";
  const isApproved = isKpApproved;
  const sent = isPendingDirector;
  // Генерация КП доступна, пока проект ожидает решения клиента.
  // После «Одобрено клиентом» проект переходит в отдельный статус
  // «Ожидание подписания» (index 4), поэтому кнопка больше не нужна.
  const isPastApprovalWindow = project ? currentIndex >= 4 : false;

  const FULL_STAGES = [
    { label: "Новый", done: currentIndex > 0, active: currentIndex === 0 },
    { label: "В редактировании", done: currentIndex > 1, active: currentIndex === 1 },
    { label: "На согласовании", done: currentIndex > 2, active: currentIndex === 2 },
    { label: "Ожидание клиента", done: currentIndex > 3, active: currentIndex === 3 },
    { label: "Ожидание подписания", done: currentIndex > 4, active: currentIndex === 4 },
    { label: "Активный закуп", done: currentIndex > 5, active: currentIndex === 5 },
    { label: "На приходе", done: currentIndex > 6, active: currentIndex === 6 },
    { label: "На отгрузке", done: currentIndex > 7, active: currentIndex === 7 },
    { label: "Ожидание документов", done: currentIndex > 8, active: currentIndex === 8 },
    { label: "Завершен", done: currentIndex === 9, active: currentIndex === 9 },
  ];

  // Экспресс-проект физически не может оказаться в статусах 2-4
  // (согласование/клиент/подписание): из «В редактировании» переход
  // EXPRESS_ACTIVATE ведёт сразу в «Активный закуп». Поэтому эти три этапа
  // из степпера убираются целиком, а не показываются вечно пустыми.
  const EXPRESS_STAGES = [
    { label: "Договор загружен", done: currentIndex > 1, active: currentIndex <= 1 },
    { label: "Активный закуп", done: currentIndex > 5, active: currentIndex === 5 },
    { label: "На приходе", done: currentIndex > 6, active: currentIndex === 6 },
    { label: "На отгрузке", done: currentIndex > 7, active: currentIndex === 7 },
    { label: "Ожидание документов", done: currentIndex > 8, active: currentIndex === 8 },
    { label: "Завершен", done: currentIndex === 9, active: currentIndex === 9 },
  ];

  // «Заявка на склад»: клиент и подписание договора ей не нужны — после
  // одобрения Комдиром (WAREHOUSE_APPROVE) проект уходит сразу в «Активный
  // закуп», минуя эти два этапа. Но, в отличие от экспресс-проекта, этап
  // «На согласовании» у неё есть — Комдира по-прежнему нужно пройти.
  const WAREHOUSE_STAGES = [
    { label: "Новый", done: currentIndex > 0, active: currentIndex === 0 },
    { label: "В редактировании", done: currentIndex > 1, active: currentIndex === 1 },
    { label: "На согласовании", done: currentIndex > 2, active: currentIndex === 2 },
    { label: "Активный закуп", done: currentIndex > 5, active: currentIndex === 5 },
    { label: "На приходе", done: currentIndex > 6, active: currentIndex === 6 },
    { label: "На отгрузке", done: currentIndex > 7, active: currentIndex === 7 },
    { label: "Ожидание документов", done: currentIndex > 8, active: currentIndex === 8 },
    { label: "Завершен", done: currentIndex === 9, active: currentIndex === 9 },
  ];

  const STAGES = isExpress ? EXPRESS_STAGES : isWarehouseRequest ? WAREHOUSE_STAGES : FULL_STAGES;

  const title = project?.name ?? "Офисный комплекс «Башня»";
  const subtitle = project
      ? `${project.client?.client_name ?? "—"} · ${project.pm?.name ?? "—"} · ${project.deadline ? new Date(project.deadline).toLocaleDateString("ru-RU") : "—"}`
      : "ООО «СтройТех» · А. Петров · 15.08.2024";

  const sidebarDetails: [string, string][] = project
      ? [
          ["Создан", project.created_at ? new Date(project.created_at).toLocaleDateString("ru-RU") : "—"],
          ["Дедлайн", project.deadline ? new Date(project.deadline).toLocaleDateString("ru-RU") : "—"],
          ["Менеджер", project.pm?.name ?? "—"],
          ["Клиент", project.client?.client_name ?? "—"],
        ]
      : [
          ["Создан", "01.06.2024"], ["Дедлайн", "15.08.2024"],
          ["Менеджер", "А. Петров"], ["Клиент", "ООО «СтройТех»"],
        ];

  const handleMlItemUpdate = async (itemId: number, payload: MlImportItemUpdate) => {
    if (!mlImport) return;
    try {
      setUpdatingItemId(itemId);
      setMlImportError(null);
      const updatedItem = await updateMlImportItem(mlImport.id, itemId, payload);
      setMlImport((current) => {
        if (!current) return current;
        return { ...current, items: current.items.map((item) => item.id === updatedItem.id ? updatedItem : item) };
      });
      // Строка-комплект: смена КОЛ-ВО меняет required_quantity каждого
      // компонента на backend (kit_components в ответе) — обновляем и
      // локальный kitComponentsByItemId, иначе buildKitSelectionsPayload на
      // confirm может уйти со старым составом, если ПМ не переоткрывал
      // кит-пикер после правки количества.
      if (updatedItem.kit_components) {
        setKitComponentsByItemId((current) => ({
          ...current,
          [updatedItem.id]: updatedItem.kit_components!.map((c) => ({
            component_product_id: c.component_product_id,
            quantity: c.quantity_per_kit,
            price_cost: c.price_cost != null ? Number(c.price_cost) : null,
          })),
        }));
      }
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось изменить строку");
    } finally {
      setUpdatingItemId(null);
    }
  };

  // Переключает чекбокс товара в открытом дропдауне «Совпавший товар» —
  // список остаётся открытым, привязка происходит только по «Применить»
  // (handleApplyProductSelection).
  const toggleProductIdInDropdown = (productId: number) => {
    const id = String(productId);
    setSelectedProductIdsInDropdown((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  };

  // Привязка строки ML-импорта к товару из каталога. Если товар — комплект,
  // вместо простого закрытия попапа открываем кит-пикер для подбора состава;
  // если ПМ ранее привязал строку к комплекту, а теперь переключился на
  // обычный товар — забываем сохранённый для строки состав, чтобы он не
  // улетел на confirm вместе с уже неактуальным selected_product_id.
  const handlePickProduct = (item: MlImportItemResponse, product: CatalogProduct) => {
    handleMlItemUpdate(item.id, { selected_product_id: product.id });
    setOpenVariantPickerId(null);

    if (product.is_kit) {
      void openKitPicker(item, product);
    } else {
      setKitComponentsByItemId((current) => {
        if (!(item.id in current)) return current;
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  };

  // Открывает кит-пикер для строки item, привязанной к товару-комплекту
  // product. Приоритет источников состава:
  // 1) item.kit_components — уже сохранённый на backend черновик состава
  //    именно для ЭТОЙ строки (saveMlImportKitComponents), самый свежий и
  //    авторитетный источник, в т.ч. после перезагрузки страницы;
  // 2) kitComponentsByItemId — то, что подбиралось в текущей сессии, но
  //    ещё не было сохранено (например, ПМ отменил пикер до "Сохранить");
  // 3) getKitComponents(product.id) — "рецепт по умолчанию" для товара-
  //    комплекта, когда для этой строки состав ещё не подбирался вовсе.
  const openKitPicker = async (item: MlImportItemResponse, product: CatalogProduct) => {
    setKitPickerItem(item);
    setKitPickerProduct(product);
    setKitError(null);

    if (item.kit_components && item.kit_components.length > 0) {
      const resolved = item.kit_components.map((c) => ({
        component_product_id: c.component_product_id,
        quantity: c.quantity_per_kit,
        price_cost: c.price_cost != null ? Number(c.price_cost) : null,
      }));
      setKitSelectedIds(resolved.map((c) => String(c.component_product_id)));
      setKitQuantities(
        Object.fromEntries(resolved.map((c) => [String(c.component_product_id), c.quantity])),
      );
      setKitComponentCosts(
        Object.fromEntries(
          resolved
            .filter((c) => c.price_cost != null)
            .map((c) => [String(c.component_product_id), String(c.price_cost)]),
        ),
      );
      setKitComponentsByItemId((current) => ({ ...current, [item.id]: resolved }));
      return;
    }

    const remembered = kitComponentsByItemId[item.id];
    if (remembered) {
      setKitSelectedIds(remembered.map((c) => String(c.component_product_id)));
      setKitQuantities(
        Object.fromEntries(remembered.map((c) => [String(c.component_product_id), c.quantity])),
      );
      setKitComponentCosts(
        Object.fromEntries(
          remembered
            .filter((c) => c.price_cost != null)
            .map((c) => [String(c.component_product_id), String(c.price_cost)]),
        ),
      );
      return;
    }

    try {
      setKitLoading(true);
      const components: KitComponentResponse[] = await getKitComponents(product.id);
      const resolved = components.map((c) => ({
        component_product_id: c.component_product_id,
        quantity: c.default_quantity > 0 ? Math.trunc(c.default_quantity) : 1,
      }));
      setKitSelectedIds(resolved.map((c) => String(c.component_product_id)));
      setKitQuantities(
        Object.fromEntries(resolved.map((c) => [String(c.component_product_id), c.quantity])),
      );
      // Себестоимости у дефолтного "рецепта" нет — ПМ ещё ничего не вводил.
      setKitComponentCosts({});
      // Коммитим предзаполненный по умолчанию состав сразу после загрузки —
      // не только по явному клику «Сохранить состав». backend отклоняет
      // (400) строку-комплект, для которой в kit_selections вообще нет
      // записи, поэтому у ПМ, который просто закрыл кит-пикер, согласившись
      // с дефолтом, обязано остаться что отправить на confirm.
      setKitComponentsByItemId((current) => ({
        ...current,
        [item.id]: resolved,
      }));
    } catch (error) {
      setKitError(
        error instanceof Error ? error.message : "Не удалось загрузить состав комплекта",
      );
      setKitSelectedIds([]);
      setKitQuantities({});
    } finally {
      setKitLoading(false);
    }
  };

  // Отмечены >1 товаров чекбоксами в дропдауне «Совпавший товар» — ПМ
  // фактически собирает комплект прямо там, без похода в Каталог товаров
  // за галочкой is_kit (заменяет прежний однократный флоу через отдельную
  // кнопку «Это комплект»). /products/resolve-kit по названию строки сам
  // решает, переиспользовать существующий товар-комплект или создать
  // новый — затем сразу открываем кит-пикер, предзаполненный тем, что ПМ
  // только что отметил (без похода за remembered/kit_components на
  // backend — это то, что openKitPicker делает для уже существующих
  // комплектов, но здесь состав только что выбран вручную).
  const handleResolveKitFromChecked = async (
    item: MlImportItemResponse,
    checkedProductIds: string[],
  ) => {
    setOpenVariantPickerId(null);
    try {
      const resolved = await resolveKitProduct({ name: item.input_product });
      setProductCatalog((current) =>
        current.some((p) => p.id === resolved.id)
          ? current.map((p) =>
              p.id === resolved.id ? { ...p, name: resolved.name, is_kit: resolved.is_kit } : p,
            )
          : [...current, { id: resolved.id, name: resolved.name, is_kit: resolved.is_kit }],
      );

      handleMlItemUpdate(item.id, { selected_product_id: resolved.id });

      if (!resolved.reused && resolved.name !== item.input_product) {
        setKitResolveNotice(`Комплект сохранён под именем «${resolved.name}»`);
      } else {
        setKitResolveNotice(null);
      }

      const prefilledComponents = checkedProductIds
        .filter((id) => id !== String(resolved.id))
        .map((id) => ({ component_product_id: Number(id), quantity: 1 }));

      setKitComponentsByItemId((current) => ({
        ...current,
        [item.id]: prefilledComponents,
      }));
      setKitSelectedIds(prefilledComponents.map((c) => String(c.component_product_id)));
      setKitQuantities(
        Object.fromEntries(prefilledComponents.map((c) => [String(c.component_product_id), c.quantity])),
      );
      setKitComponentCosts({});
      setKitError(null);
      setKitPickerItem(item);
      setKitPickerProduct({ id: resolved.id, name: resolved.name, is_kit: resolved.is_kit });
    } catch (error) {
      setMlImportError(
        error instanceof Error ? error.message : "Не удалось создать комплект",
      );
    }
  };

  // Применяет отметки чекбоксами из дропдауна «Совпавший товар»: ровно 1
  // товар — обычная привязка строки к нему (как раньше), больше одного —
  // сборка комплекта через handleResolveKitFromChecked.
  const handleApplyProductSelection = (item: MlImportItemResponse) => {
    if (selectedProductIdsInDropdown.length === 0) return;

    if (selectedProductIdsInDropdown.length === 1) {
      const product = productCatalog.find(
        (p) => String(p.id) === selectedProductIdsInDropdown[0],
      );
      if (!product) return;
      handlePickProduct(item, product);
      return;
    }

    void handleResolveKitFromChecked(item, selectedProductIdsInDropdown);
  };

  const closeKitPicker = () => {
    setKitResolveNotice(null);
    setKitPickerItem(null);
    setKitPickerProduct(null);
    setKitSelectedIds([]);
    setKitQuantities({});
    setKitComponentCosts({});
    setKitError(null);
  };

  // Кит-пикер: создаёт новый товар-компонент "на лету", когда введённое
  // ПМ название не совпадает ни с одним товаром каталога. POST /products/
  // не привязан к ml_import_item и не трогает kitPickerItem — в отличие от
  // createProductForMlImportItem, которым пользуется основная модалка
  // «Создать товар» (та требует поставщика/цену и переписывает
  // selected_product_id конкретной строки импорта).
  const handleCreateKitComponentProduct = async (name: string) => {
    const created = await createProduct({ product_name: name });
    setProductCatalog((current) =>
      current.some((product) => product.id === created.id)
        ? current
        : [...current, { id: created.id, name: created.name, is_kit: created.is_kit }],
    );
    return { value: String(created.id), label: created.name };
  };

  // Сохраняет текущий подбор состава комплекта на backend (черновик
  // конкретной строки ML-импорта) через PUT .../kit-components. Ответ
  // содержит пересчитанные available_quantity/ml_status/kit_components
  // строки — заменяем ею запись в mlImport.items и переинициализируем
  // локальный kitComponentsByItemId её же данными, чтобы buildKitSelectionsPayload
  // на confirm отправил ровно то, что реально сохранено на backend.
  const handleSaveKitComponents = async () => {
    if (!kitPickerItem || !mlImport) return;

    // price_cost отправляется только для коммерческих импортов и только для
    // компонентов, которые ПМ реально ввёл в этой сессии (typed 0 включая) —
    // у "Заявка на склад" цен нет вовсе (см. isWarehouseRequest). Недописанный
    // текст ("." в одиночку и т.п.) parseKitComponentCost вернёт как null —
    // считаем это "не введено", а не шлём NaN на backend.
    const components = kitSelectedIds.map((id) => {
      const quantity = kitQuantities[id] && kitQuantities[id] > 0 ? Math.trunc(kitQuantities[id]) : 1;
      const cost = isWarehouseRequest ? null : parseKitComponentCost(kitComponentCosts[id]);
      return cost != null
        ? { component_product_id: Number(id), quantity, price_cost: cost }
        : { component_product_id: Number(id), quantity };
    });

    try {
      setKitSaving(true);
      setKitError(null);
      const updatedItem = await saveMlImportKitComponents(mlImport.id, kitPickerItem.id, components);

      setMlImport((current) => {
        if (!current) return current;
        return { ...current, items: current.items.map((item) => item.id === updatedItem.id ? updatedItem : item) };
      });
      setKitComponentsByItemId((current) => ({
        ...current,
        [updatedItem.id]: (updatedItem.kit_components ?? []).map((c) => ({
          component_product_id: c.component_product_id,
          quantity: c.quantity_per_kit,
          price_cost: c.price_cost != null ? Number(c.price_cost) : null,
        })),
      }));

      closeKitPicker();
    } catch (error) {
      // Модалка остаётся открытой — ПМ должен видеть ошибку и иметь
      // возможность поправить состав, не начиная подбор заново.
      setKitError(
        error instanceof Error ? error.message : "Не удалось сохранить состав комплекта",
      );
    } finally {
      setKitSaving(false);
    }
  };

  // Удаление строки черновика. ProjectItem при этом не затрагиваются:
  // позиции проекта создаются только при подтверждении импорта.
  const handleMlItemDelete = async (item: MlImportItemResponse) => {
    if (!mlImport || mlImport.status !== "draft" || item.is_confirmed) return;

    const confirmed = window.confirm(
      `Удалить строку «${item.input_product}»? Действие нельзя отменить.`,
    );
    if (!confirmed) return;

    try {
      setDeletingItemId(item.id);
      setMlImportError(null);
      await deleteMlImportItem(mlImport.id, item.id);
      setMlImport((current) => {
        if (!current) return current;
        return { ...current, items: current.items.filter((row) => row.id !== item.id) };
      });
      setOpenVariantPickerId((current) => (current === item.id ? null : current));
      setKitComponentsByItemId((current) => {
        if (!(item.id in current)) return current;
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось удалить строку");
    } finally {
      setDeletingItemId(null);
    }
  };

  // Гарантирует, что у проекта есть черновик ML-импорта: возвращает
  // существующий либо создаёт пустой. Нужен для проектов, созданных
  // вручную — у них импорта нет вообще, а вся таблица позиций (включая
  // подтверждение и перенос в project_items) работает только через него.
  //
  // Эндпоинт /ml-imports/empty идемпотентный: повторный вызов вернёт тот
  // же черновик, поэтому пустой localStorage в другом браузере не приведёт
  // к появлению второго импорта.
  const ensureMlImport = async (): Promise<MlImportDetailResponse | null> => {
    if (mlImport) return mlImport;
    if (!hasValidProjectId) return null;

    try {
      setCreatingEmptyImport(true);
      setMlImportError(null);

      const created = await createEmptyMlImport(Number(resolvedProjectId));
      const detail = await getMlImport(created.id);

      localStorage.setItem(
        `project:${resolvedProjectId}:mlImportId`,
        String(created.id),
      );
      setMlImport(detail);

      return detail;
    } catch (error) {
      setMlImportError(
        error instanceof Error
          ? error.message
          : "Не удалось создать черновик импорта",
      );
      return null;
    } finally {
      setCreatingEmptyImport(false);
    }
  };

  // Единая точка входа для кнопки «Добавить позицию» — и под таблицей, и в
  // пустом состоянии. Если импорта ещё нет, он создаётся здесь же.
  const handleStartAddingRow = async () => {
    const target = mlImport ?? (await ensureMlImport());
    if (!target || target.status !== "draft") return;

    setMlImportError(null);
    setNewRowForm({ input_product: "", input_quantity: "1", selected_product_id: null, unit: null });
    setIsAddingRow(true);
  };

  // Ручное добавление позиции: backend требует только наименование и
  // количество; товар из каталога теперь можно сразу привязать через
  // комбобокс поиска (selected_product_id), либо оставить как кастомную
  // позицию без привязки — остальное (поставщик, цены) заполняется
  // в таблице теми же контролами, что и у распарсенных строк.
  const handleCreateMlItem = async () => {
    if (!mlImport || mlImport.status !== "draft") return;

    const inputProduct = newRowForm.input_product.trim();
    const inputQuantity = Number(newRowForm.input_quantity);

    if (!inputProduct) {
      setMlImportError("Укажите наименование новой позиции");
      return;
    }

    if (!Number.isFinite(inputQuantity) || inputQuantity <= 0) {
      setMlImportError("Количество новой позиции должно быть больше нуля");
      return;
    }

    const payload: MlImportItemCreate = {
      input_product: inputProduct,
      input_quantity: Math.trunc(inputQuantity),
      selected_product_id: newRowForm.selected_product_id,
      unit: newRowForm.unit,
    };

    try {
      setSavingNewRow(true);
      setMlImportError(null);
      const createdItem = await createMlImportItem(mlImport.id, payload);
      setMlImport((current) => {
        if (!current) return current;
        return { ...current, items: [...current.items, createdItem] };
      });
      // Форму оставляем открытой: позиции обычно добавляют пачкой.
      setNewRowForm({ input_product: "", input_quantity: "1", selected_product_id: null, unit: null });
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось добавить позицию");
    } finally {
      setSavingNewRow(false);
    }
  };

  // УБРАНО: RESOLVABLE_ML_STATUSES — белый список статусов, который
  // блокировал создание товара для "Возможное совпадение (требует
  // проверки)" и "Есть в системе (недостаточно)". Кнопка "Добавить товар"
  // при этом рисовалась (needsProductResolution включал эти статусы), но
  // openProductModal делал молчаливый return — модалка не открывалась, а
  // текст ошибки уходил в баннер за пределами экрана.
  //
  // Право создать товар определяется теперь одним фактом: строка не
  // подтверждена и не привязана к товару (getMlRowState().needsProduct).
  // Именно этого требует backend при confirm.
  const openProductModal = (item: MlImportItemResponse) => {
    if (!mlImport || mlImport.status !== "draft") {
      setMlImportError(
        "Импорт уже подтверждён — создание товара из его строк недоступно.",
      );
      return;
    }

    if (item.is_confirmed) {
      setMlImportError(
        `Строка «${item.input_product}» уже добавлена в проект — товар создавать не нужно.`,
      );
      return;
    }

    // Привязанную строку тоже можно перевести на новый товар: ML иногда
    // сопоставляет уверенно, но неверно. Привязку снимем при сохранении.
    setUnlinkBeforeCreate(item.selected_product_id != null);
    setProductModalItem(item);
    setProductModalForm({
      // Для привязанной строки в matched_product лежит название товара,
      // который пользователь как раз считает неподходящим — подставляем
      // исходное наименование из файла.
      product_name:
        item.selected_product_id != null
          ? item.input_product
          : item.matched_product?.trim() || item.input_product,
      unit: item.unit?.trim() || "шт",
      price: Number(item.price ?? 0) > 0 ? String(item.price) : "",
      is_kit: false,
    });
    setProductModalError(null);
  };

  const closeProductModal = () => {
    if (savingProduct) return;
    setProductModalItem(null);
    setProductModalError(null);
    setUnlinkBeforeCreate(false);
  };

  const handleCreateProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mlImport || !productModalItem) return;

    const productName = productModalForm.product_name.trim();
    const unit = productModalForm.unit.trim();
    const price = Number(productModalForm.price);

    if (!productName || !unit) {
      setProductModalError(
        "Заполните название товара и единицу измерения.",
      );
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setProductModalError("Цена продажи должна быть больше нуля.");
      return;
    }

    const payload: MlImportItemCreateProduct = {
      product_name: productName,
      unit,
      price,
      is_kit: productModalForm.is_kit,
    };

    try {
      setSavingProduct(true);
      setProductModalError(null);
      setMlImportError(null);

      // Backend отклоняет create-product для строки с selected_product_id.
      // Снимаем привязку первым запросом — форма уже заполнена значениями,
      // снятыми до сброса, поэтому данные не потеряются.
      if (unlinkBeforeCreate) {
        await updateMlImportItem(mlImport.id, productModalItem.id, {
          selected_product_id: null,
        });
      }

      const updatedItem = await createProductForMlImportItem(
        mlImport.id,
        productModalItem.id,
        payload,
      );

      setMlImport((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
        };
      });

      // Локально дописываем созданный товар в каталог: иначе селект
      // "Совпавший товар" не сможет показать его название (каталог
      // грузится один раз при монтировании) и строка будет выглядеть
      // непривязанной, хотя selected_product_id уже проставлен.
      const newProductId = updatedItem.selected_product_id;
      if (newProductId != null) {
        setProductCatalog((current) =>
          current.some((product) => product.id === newProductId)
            ? current
            : [...current, { id: newProductId, name: productName, unit, is_kit: productModalForm.is_kit }],
        );
      } else {
        // Диагностика вместо тихого провала: backend создал товар, но не
        // привязал строку — confirm всё равно отклонит её.
        setMlImportError(
          `Товар «${productName}» создан, но строка не была привязана к нему ` +
            "(backend не вернул selected_product_id). Выберите созданный " +
            "товар вручную в колонке «Совпавший товар».",
        );
      }

      setProductModalItem(null);
      setUnlinkBeforeCreate(false);
    } catch (error) {
      setProductModalError(
        error instanceof Error
          ? error.message
          : "Не удалось создать товар",
      );
    } finally {
      setSavingProduct(false);
    }
  };

  // Пакует состав комплекта в тело confirmMlImport. backend отклоняет (400)
  // ЛЮБУЮ строку, привязанную к товару-комплекту, у которой в
  // kit_selections нет записи, поэтому здесь включаем запись для КАЖДОЙ
  // строки, чей selected_product_id указывает на товар с is_kit=true.
  //
  // Источник состава на строку — kitComponentsByItemId (то, что подбиралось
  // в текущей сессии), а если её там нет (страницу перезагрузили и
  // кит-пикер для этой строки в этой сессии ни разу не открывали) —
  // item.kit_components, уже сохранённый на backend черновик. Раньше при
  // отсутствии в kitComponentsByItemId сюда уходил пустой массив ([]) даже
  // для строки с реально сохранённым составом — confirm тихо затирал бы его
  // пустым.
  const buildKitSelectionsPayload = (): ConfirmMlImportKitSelection[] => {
    if (!mlImport) return [];
    return mlImport.items
      .filter((item) => {
        if (item.selected_product_id == null) return false;
        const product = productCatalog.find((p) => p.id === item.selected_product_id);
        return product?.is_kit === true;
      })
      .map((item) => ({
        item_id: item.id,
        components: (
          kitComponentsByItemId[item.id] ??
          (item.kit_components ?? []).map((c) => ({
            component_product_id: c.component_product_id,
            quantity: c.quantity_per_kit,
            price_cost: c.price_cost != null ? Number(c.price_cost) : null,
          }))
        ).map((c) => ({
          component_product_id: c.component_product_id,
          quantity: c.quantity,
          // Только реально введённая себестоимость (>= 0, включая 0) — иначе
          // confirm затёр бы сохранённое значение нулём для нетронутых
          // компонентов (у "Заявка на склад" price_cost всегда null, см.
          // isWarehouseRequest — там цены не вводятся).
          ...(c.price_cost != null ? { price_cost: c.price_cost } : {}),
        })),
      }));
  };

  const handleConfirmMlImport = async () => {
    if (!mlImport || mlImport.status !== "draft") return;
    try {
      setConfirmingImport(true);
      setMlImportError(null);
      const kitSelections = buildKitSelectionsPayload();
      await confirmMlImport(
        mlImport.id,
        kitSelections.length ? { kit_selections: kitSelections } : undefined,
      );

      // Подтверждение импорта должно переводить проект:
      // «Новый» / «Новый проект» → «В редактировании».
      // Повторно читаем проект с backend, чтобы не оставлять старый статус
      // в локальном состоянии после git merge/pull.
      let updatedProject = await refreshProject();
      const statusName = updatedProject.status?.status_name?.trim();

      // Совместимость с backend-версиями, где confirm ML-импорта ещё
      // не вызывает переход START_EDITING самостоятельно.
      if (statusName === "Новый" || statusName === "Новый проект") {
        await startProjectEditing(updatedProject.id);
        updatedProject = await refreshProject();
      }

      // Экспресс-проект уходит дальше обычного: confirm на бэкенде помимо
      // создания позиций выполняет переход EXPRESS_ACTIVATE и оставляет
      // проект в «Активный закуп». Для него «В редактировании» —
      // наоборот, признак того, что переход НЕ сработал.
      const expectedStatus = isExpress ? "Активный закуп" : "В редактировании";

      if (updatedProject.status?.status_name !== expectedStatus) {
        throw new Error(
          `Импорт подтверждён, но проект остался в статусе «${
            updatedProject.status?.status_name || "не задан"
          }» вместо «${expectedStatus}»`,
        );
      }

      setMlImport(await getMlImport(mlImport.id));
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось подтвердить ML-импорт");
      // Если backend отклонил confirm, локальное состояние строк могло
      // разойтись с БД — перечитываем импорт, чтобы подсветка строк
      // соответствовала тому, что реально сохранено.
      try {
        setMlImport(await getMlImport(mlImport.id));
      } catch {
        /* сообщение об исходной ошибке важнее */
      }
    } finally {
      setConfirmingImport(false);
    }
  };

  // «Заявка на склад»: confirmMlImport создаёт project_items (бэкенд для
  // ручных импортов больше не требует цену/поставщика — см.
  // ml_import_service.py), но, в отличие от обычного проекта, дальше сама
  // никуда не переводит: is_express у такого проекта всегда false, значит
  // EXPRESS_ACTIVATE не сработает, и проект останется в «В редактировании».
  // Поэтому сразу следом отправляем его Комдиру тем же вызовом, что и
  // обычная кнопка «Отправить Комдиру».
  const handleConfirmWarehouseRequest = async () => {
    if (!mlImport || mlImport.status !== "draft" || !project) return;
    try {
      setConfirmingImport(true);
      setSending(true);
      setMlImportError(null);
      const kitSelections = buildKitSelectionsPayload();
      await confirmMlImport(
        mlImport.id,
        kitSelections.length ? { kit_selections: kitSelections } : undefined,
      );
      await sendProjectToDirector(project.id);
      onKpSent();
      await refreshProject();
      setMlImport(await getMlImport(mlImport.id));
    } catch (error) {
      setMlImportError(
        error instanceof Error
          ? error.message
          : "Не удалось подтвердить и отправить заявку Комдиру",
      );
      // Если что-то из двух шагов упало на середине, локальное состояние
      // строк могло разойтись с БД — перечитываем импорт, чтобы подсветка
      // строк соответствовала тому, что реально сохранено.
      try {
        setMlImport(await getMlImport(mlImport.id));
      } catch {
        /* сообщение об исходной ошибке важнее */
      }
    } finally {
      setConfirmingImport(false);
      setSending(false);
    }
  };

  const handleSendToDirector = async () => {
    if (!project) return;
    setSending(true);
    try {
      await sendProjectToDirector(project.id);
      onKpSent();
      await refreshProject();
    } catch (error) {
      console.error("Не удалось отправить Комдиру:", error);
      alert("Ошибка при отправке Комдиру.");
    } finally {
      setSending(false);
    }
  };

  const handleClientApprove = async () => {
    if (!project) return;
    setApprovingClient(true);
    try {
      await approveProjectClient(project.id);
      await refreshProject();
      onNavigate("documents");
    } catch (error) {
      console.error("Не удалось зафиксировать одобрение клиента:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Ошибка при одобрении КП клиентом.",
      );
    } finally {
      setApprovingClient(false);
    }
  };

  const handleClientReject = async () => {
    if (!project) return;
    setRejecting(true);
    try {
      await rejectProjectClient(project.id);
      await refreshProject();
      if (mlImport) {
        try {
          const refreshedImport = await getMlImport(mlImport.id);
          setMlImport(refreshedImport);
        } catch (refreshError) {
          console.error("Не удалось обновить ML-импорт после отказа клиента:", refreshError);
        }
      }
      // УБРАНО: alert("Проект возвращён в редактирование. Отредактируйте
      // позиции и подтвердите импорт заново.") — состояние и так сразу
      // видно на степпере статуса проекта (переключается на "В
      // редактировании"), отдельное системное окно избыточно.
    } catch (error) {
      console.error("Не удалось отправить проект на доработку:", error);
      alert("Ошибка при отправке на доработку.");
    } finally {
      setRejecting(false);
    }
  };

  // Строки, которые backend отвергнет при confirm. Считаются тем же
  // getMlRowState, что рисует кнопки в таблице.
  const unresolvedRows = (mlImport?.items ?? [])
    .map((item, index) => ({ item, index, state: getMlRowState(item, productCatalog) }))
    .filter((row) => !row.state.isReady);

  // Комплекты без подобранного состава — общие для обоих флоу подтверждения
  // (обычный импорт и «Заявка на склад»): backend отклоняет confirm с одним
  // и тем же товаром-комплектом независимо от флоу, а kit-пикер доступен в
  // обеих таблицах через одну и ту же колонку «Совпавший товар».
  const kitCompositionMissingItems = (mlImport?.items ?? []).filter((item) => {
    if (item.is_confirmed) return false;
    const kitStatus = getItemKitStatus(item, productCatalog);
    return kitStatus.isKit && kitStatus.hasEmptyComponents;
  });
  const kitCompositionMissingNames = kitCompositionMissingItems.map((item) => {
    const selectedProduct =
      item.selected_product_id != null
        ? productCatalog.find((p) => p.id === item.selected_product_id)
        : undefined;
    return selectedProduct?.name || item.matched_product?.trim() || item.input_product;
  });
  const invalidKitsHint =
    kitCompositionMissingNames.length === 0
      ? ""
      : `Не выбран состав комплекта: ${kitCompositionMissingNames.slice(0, 3).join(", ")}` +
        (kitCompositionMissingNames.length > 3
          ? ` и ещё ${kitCompositionMissingNames.length - 3}`
          : "");

  const canConfirmMlImport =
    mlImport !== null &&
    mlImport.status === "draft" &&
    mlImport.items.length > 0 &&
    unresolvedRows.length === 0;

  const confirmBlockedHint =
    mlImport === null || mlImport.status !== "draft" || unresolvedRows.length === 0
      ? ""
      : `Не готово строк: ${unresolvedRows.length}. ` +
        unresolvedRows
          .slice(0, 5)
          .map((row) => `№${row.index + 1} — ${row.state.reasons.join(", ")}`)
          .join("; ") +
        (unresolvedRows.length > 5 ? "; …" : "");

  // Для «Заявки на склад» цена/себестоимость/поставщик не нужны — это
  // внутренний запрос по наличию, а не коммерческая позиция. Готовность
  // строки проверяем только по товару из каталога и количеству.
  const unresolvedWarehouseRows = (mlImport?.items ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (item.is_confirmed) return false;
      const quantity = Number(item.final_quantity ?? item.input_quantity ?? 0);
      const kitStatus = getItemKitStatus(item, productCatalog);
      return (
        item.selected_product_id == null ||
        !Number.isFinite(quantity) || quantity <= 0 ||
        (kitStatus.isKit && kitStatus.hasEmptyComponents)
      );
    });

  const canConfirmWarehouseRequest =
    mlImport !== null &&
    mlImport.status === "draft" &&
    mlImport.items.length > 0 &&
    unresolvedWarehouseRows.length === 0;

  const warehouseConfirmBlockedHint =
    mlImport === null || mlImport.status !== "draft" || unresolvedWarehouseRows.length === 0
      ? ""
      : `Не готово строк: ${unresolvedWarehouseRows.length}. Выберите товар из каталога и укажите количество больше нуля.`;

  const handleExportExcel = async () => {
    if (!project) return;
    try {
      setIsExporting(true);
      await downloadProjectExcel(project.id);
    } catch (error) {
      console.error("Ошибка при скачивании Excel:", error);
      alert("Не удалось скачать файл");
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateKP = async () => {
    if (!project) return;
    try {
      setIsGeneratingKP(true);
      await downloadKpDocument(project.id);
      setKpGenerated(true);
    } catch (error) {
      console.error("Ошибка генерации КП:", error);
      alert(error instanceof Error ? error.message : "Не удалось сгенерировать КП");
    } finally {
      setIsGeneratingKP(false);
    }
  };

  if (!hasValidProjectId) {
    return (
      <PageWrap title="Проект не выбран" subtitle="Не удалось определить ID проекта">
        <div className="bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Некорректный ID проекта</p>
              <p className="text-sm text-destructive mt-1">Получено значение: {String(projectId)}</p>
            </div>
          </div>
        </div>
      </PageWrap>
    );
  }

  const formatMoney = (value: number | string | null | undefined) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) return "0 ₸";
    return new Intl.NumberFormat("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + " ₸";
  };

  const estimateRows: EstimateRow[] = (mlImport?.items ?? []).map((item) => {
    const parsedPrice = item.estimated_price == null
      ? null
      : Number(item.estimated_price);

    return {
      id: item.id,
      name: item.matched_product ?? item.input_product,
      code: item.matched_external_id,
      quantity: Number(item.final_quantity ?? item.input_quantity ?? 0),
      estimatedPrice: parsedPrice != null && Number.isFinite(parsedPrice)
        ? parsedPrice
        : null,
    };
  });

  return (
    <PageWrap
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Chip status={currentStatus}/>
            <Chip status="kp"/>
            <button
              type="button"
              onClick={() => setShowEstimate((current) => !current)}
              disabled={!mlImport}
              aria-expanded={showEstimate}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                showEstimate
                  ? "border-primary bg-blue-50 dark:bg-blue-400/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-background"
              }`}
            >
              <Calculator size={14}/>
              Смета
            </button>
            <AppTooltip text={(!mlImport || mlImport.status !== "confirmed") ? "Сначала подтвердите импорт товаров" : ""}>
              <button
                onClick={handleExportExcel}
                disabled={isExporting || !project || !mlImport || mlImport.status !== "confirmed"}
                className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-card border border-border text-muted-foreground text-xs font-medium rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
                {isExporting ? "Скачивание..." : "Скачать Excel"}
              </button>
            </AppTooltip>
          </div>
        }
    >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-card rounded-lg border border-border p-5 overflow-x-auto flex items-center">
            <div className="flex items-start min-w-max">
              {STAGES.map((step, i) => (
                  <div key={step.label} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                          step.done ? "bg-primary border-primary text-white" : 
                          step.active ? "bg-card border-primary text-primary" : 
                          "bg-card border-border text-muted-foreground"
                      }`}>
                        {step.done ? <Check size={12}/> : i + 1}
                      </div>
                      <span className={`text-xs mt-1.5 transition-colors ${step.done || step.active ? "text-primary" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className={`h-0.5 w-8 mx-2 mb-4 transition-colors ${step.done ? "bg-primary" : "bg-border"}`}/>
                    )}
                  </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Детали проекта</h3>
            {projectError ? (
              <div className="flex items-start gap-2.5 text-destructive">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0"/>
                <div>
                  <p className="text-sm font-medium">Не удалось загрузить детали проекта</p>
                  <p className="text-xs text-destructive mt-1">{projectError}</p>
                </div>
              </div>
            ) : (
              <dl className="space-y-2.5">
                {sidebarDetails.map(([l, v]) => (
                    <div key={l} className="flex items-start justify-between gap-3">
                      <dt className="text-xs text-muted-foreground">{l}</dt>
                      <dd className="text-xs font-medium text-foreground text-right">{v}</dd>
                    </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        {showEstimate && <EstimateTable rows={estimateRows}/>}

        {sent && !isApproved && (
            <div className="mb-6 rounded-lg border p-5 bg-background border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin text-muted-foreground"/>
                  Ожидаем подтверждения Комдира…
                </div>
            </div>
        )}

        {isRejected && (
            <div className="mb-6 rounded-lg border p-5 bg-red-50 dark:bg-red-400/15 border-red-200 dark:border-red-400/25">
                <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                  <XCircle size={14}/>
                  КП отклонено Комдиром. Отредактируйте товары ниже и отправьте повторно.
                </div>
            </div>
        )}

        {(currentStatus === "Ожидание клиента" || currentStatus === "Одобрено Комдиром") && (
            <div className="mb-6 rounded-xl border border-blue-200 dark:border-blue-400/25 bg-blue-50/70 dark:bg-blue-400/35 shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-400/20 flex items-center justify-center">
                    <FileText size={18} className="text-blue-600 dark:text-blue-400"/>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Ожидание решения клиента</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      КП отправлено клиенту на подпись. Отметьте результат, когда получите ответ.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                  <AppTooltip text={!kpGenerated ? "Сначала сгенерируйте КП" : ""}>
                    <button
                        onClick={handleClientReject}
                        disabled={approvingClient || rejecting || !kpGenerated}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-card border border-red-300 dark:border-red-400/30 text-destructive text-sm font-semibold rounded-lg hover:bg-red-50 dark:bg-red-400/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {rejecting ? <Loader2 size={14} className="animate-spin"/> : <XCircle size={14}/>}
                      Клиент просит правки
                    </button>
                  </AppTooltip>
                  <AppTooltip text={!kpGenerated ? "Сначала сгенерируйте КП" : ""}>
                    <button
                        onClick={handleClientApprove}
                        disabled={approvingClient || rejecting || !kpGenerated}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {approvingClient ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                      Одобрено клиентом
                    </button>
                  </AppTooltip>
                </div>
              </div>
            </div>
        )}

        <div className="mt-2">
            <div className="flex items-center justify-end gap-4 mb-3">
                <div className="flex items-center gap-3">
                  {/* Экспресс-проект: КП генерировать не нужно и согласовывать
                      не с кем — договор подписан до создания проекта. Вместо
                      двух кнопок показываем пояснение, чтобы ПМ не искал
                      привычную «Отправить Комдиру». */}
                  {isExpress && (
                    <span className="text-xs text-muted-foreground">
                      Договор подписан — согласование не требуется
                    </span>
                  )}

                  {mlImport && !isApproved && !isRejected && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${mlImport.status === "confirmed" ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200"}`}>
                      {mlImport.status === "confirmed" ? "Подтверждено" : "Черновик"}
                    </span>
                  )}

                  {!isPastApprovalWindow && !isExpress && !isWarehouseRequest && (
                    <AppTooltip text={
                      !mlImport || mlImport.status !== "confirmed"
                        ? "Сначала подтвердите импорт товаров"
                        : !isApproved
                        ? "Генерация КП доступна только после одобрения Комдиром"
                        : ""
                    }>
                      <button
                        onClick={handleGenerateKP}
                        disabled={!mlImport || mlImport.status !== "confirmed" || !isApproved || isGeneratingKP}
                        className={`flex items-center gap-2 px-5 py-2.5 border text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          mlImport?.status === "confirmed" && isApproved
                            ? "bg-card border-border text-foreground hover:bg-background cursor-pointer"
                            : "bg-background border-border text-muted-foreground cursor-not-allowed"
                        }`}
                      >
                        {isGeneratingKP ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        {isGeneratingKP ? "Генерация..." : "Сгенерировать КП"}
                      </button>
                    </AppTooltip>
                  )}

                  {!isExpress && (
                  <AppTooltip text={
                    !mlImport ? "Сначала подтвердите импорт товаров" :
                    mlImport.status !== "confirmed" ? (isRejected ? "Сначала подтвердите изменённый импорт товаров" : "Сначала подтвердите импорт товаров") :
                    ""
                  }>
                    <button
                      onClick={handleSendToDirector}
                      disabled={!mlImport || mlImport.status !== "confirmed" || sending || sent || isApproved}
                      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
                          sent ? "bg-success text-success-foreground cursor-default" :
                          isApproved ? "bg-success/90 text-success-foreground cursor-default" :
                          mlImport?.status !== "confirmed" ? "bg-muted text-muted-foreground cursor-not-allowed" :
                          isRejected ? "bg-destructive hover:bg-destructive/90 text-white" :
                          !sending ? "bg-primary hover:bg-primary/90 text-white" :
                          "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}>
                      {sending ? <><Loader2 size={14} className="animate-spin"/>Отправка…</> :
                          sent ? <><CheckCircle2 size={14}/>КП на согласовании</> :
                          isPastApprovalWindow ? <><CheckCircle2 size={14}/>Клиент принял КП</> :
                          isApproved ? <><CheckCircle2 size={14}/>КП одобрено</> :
                          isRejected ? <><XCircle size={14}/>Отправить повторно</> :
                              <><Send size={14}/>Отправить Комдиру</>}
                    </button>
                  </AppTooltip>
                  )}
                </div>
            </div>

            {mlImportError && (
              <div
                  ref={mlImportErrorRef}
                  className="flex items-start gap-2.5 mb-3 px-4 py-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg"
              >
                <AlertTriangle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Ошибка ML-импорта</p>
                  <p className="text-xs text-destructive mt-1 break-words">{mlImportError}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setMlImportError(null)}
                    className="flex-shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive"
                    aria-label="Скрыть ошибку"
                >
                  <XCircle size={16}/>
                </button>
              </div>
            )}

            {mlImportLoading ? (
              <div className="bg-card rounded-lg border border-border p-10 flex flex-col items-center">
                <Loader2 size={26} className="animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Загружаем результаты ML…</p>
              </div>
            ) : !mlImport ? (
              // Проект создан вручную либо импорт ещё не заводился —
              // вместо тупика даём сразу добавить позицию: черновик
              // импорта создастся по клику.
              <div className="bg-card rounded-lg border border-border px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  В проекте пока нет позиций — добавьте их вручную.
                </p>
                <button
                    type="button"
                    onClick={handleStartAddingRow}
                    disabled={creatingEmptyImport}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-dashed border-input rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingEmptyImport ? (
                    <Loader2 size={15} className="animate-spin"/>
                  ) : (
                    <Plus size={15}/>
                  )}
                  {creatingEmptyImport ? "Подготовка…" : "Добавить позицию"}
                </button>
              </div>
            ) : (
              <>
                {isApproved ? (() => {
                  // Себестоимость/поставщик/маржа больше не показываются на
                  // ProjectPage ни одной роли — заполняются и видны только
                  // на ProcurementPage (см. перенос cost_price/supplier).
                  const liveItemsHeaders = isWarehouseRequest
                    ? ["№", "Наименование", "Кол-во", "Ед.", "Статус"]
                    : ["№", "Наименование", "Кол-во", "Ед.", "Цена", "Сумма", "Статус"];
                  const liveItemsColSpan = liveItemsHeaders.length;

                  const renderLiveItemRow = (item: ProjectItemResponse, index: number) => {
                    const qty = Number(item.required_quantity ?? 0);
                    const price = Number(item.sale_price ?? 0);
                    const total = item.total_sum != null ? Number(item.total_sum) : qty * price;
                    const isEditedByDirector = Boolean((item as { edited_by_director?: boolean }).edited_by_director);
                    const stockStatusName = item.status?.status_name ?? "—";
                    const isInStock = stockStatusName === "На складе";
                    // Компонент комплекта: визуально с отступом, с подписью
                    // количества "в комплекте" под наименованием — те же
                    // данные, что и у обычной позиции, просто сгруппированы
                    // под заголовком комплекта (см. groupEntriesByKit ниже).
                    const isKitComponent = Boolean(item.kit_group_key);
                    const quantityPerKit = Number(item.quantity_per_kit ?? 0);

                    return (
                        <tr key={item.id} className="hover:bg-background/50">
                          <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index + 1}</td>
                          <td className={`px-4 py-3 text-sm text-foreground ${isKitComponent ? "pl-8 border-l-2 border-border/60" : ""}`}>
                            {item.product?.name ?? "—"}
                            {isKitComponent && quantityPerKit > 0 && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                × {quantityPerKit.toLocaleString("ru-RU")} в комплекте
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{qty.toLocaleString("ru-RU")}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{item.product?.unit ?? "шт"}</td>
                          {!isWarehouseRequest && (
                            <>
                              <td className={`px-4 py-3 text-sm font-mono ${isKitComponent ? "text-muted-foreground" : ""}`}>{price.toLocaleString("ru-RU")}</td>
                              <td className={`px-4 py-3 text-sm font-mono font-semibold ${isKitComponent ? "text-muted-foreground font-normal" : ""}`}>{total.toLocaleString("ru-RU")}</td>
                            </>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                  className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${isInStock ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200"}`}>
                                {stockStatusName}
                              </span>
                              {isEditedByDirector && (
                                <span title="Изменено Комдиром">
                                  <Pencil size={13} className="text-muted-foreground flex-shrink-0" />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                    );
                  };

                  return (
                  <div className="bg-card rounded-lg border border-border overflow-x-auto">
                    <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border bg-background/60">
                      Финальные значения по проекту, с учётом правок Комдира (если он их вносил).
                    </div>
                    <table className={`w-full border-collapse ${isWarehouseRequest ? "min-w-[600px]" : "min-w-[950px]"}`}>
                      <thead>
                        <tr className="border-b border-border bg-background/60">
                          {liveItemsHeaders.map(h => (
                              <th key={h}
                                  className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {liveItemsLoading ? (
                          <tr>
                            <td colSpan={liveItemsColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              <Loader2 size={16} className="inline-block animate-spin text-primary mr-2" />
                              Загружаем позиции проекта…
                            </td>
                          </tr>
                        ) : liveItemsError ? (
                          <tr>
                            <td colSpan={liveItemsColSpan} className="px-4 py-10 text-center text-sm text-destructive">
                              {liveItemsError}
                            </td>
                          </tr>
                        ) : liveItems.length === 0 ? (
                          <tr>
                            <td colSpan={liveItemsColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              В проекте нет позиций
                            </td>
                          </tr>
                        ) : (
                          groupEntriesByKit(
                            liveItems.map((item, index) => ({ item, index })),
                            (entry) => entry.item.kit_group_key,
                          ).map((row) => {
                            if (row.type === "single") {
                              return renderLiveItemRow(row.entry.item, row.entry.index);
                            }

                            const first = row.entries[0].item;
                            const expanded = expandedLiveKitGroups[row.key] ?? true;
                            const itemsTotalSum = row.entries.reduce(
                              (sum, entry) => sum + Number(entry.item.total_sum ?? 0),
                              0,
                            );

                            return (
                              <React.Fragment key={row.key}>
                                <KitGroupHeaderRow
                                    projectId={Number(projectId)}
                                    groupKey={row.key}
                                    kitName={first.kit_name ?? "Комплект"}
                                    kitQuantity={Number(first.kit_quantity ?? 0)}
                                    itemCount={row.entries.length}
                                    colSpan={liveItemsColSpan}
                                    expanded={expanded}
                                    onToggleExpand={() =>
                                      setExpandedLiveKitGroups((current) => ({
                                        ...current,
                                        [row.key]: !expanded,
                                      }))
                                    }
                                    showPrices={!isWarehouseRequest}
                                    kitUnitSalePrice={Number(first.kit_unit_sale_price ?? 0)}
                                    itemsTotalSum={itemsTotalSum}
                                    canEdit={false}
                                    onPricesSaved={() => {}}
                                />
                                {expanded && row.entries.map((entry) => renderLiveItemRow(entry.item, entry.index))}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  );
                })() : (
                <>
                <div className="bg-card rounded-lg border border-border overflow-x-auto">
                  <table className={`w-full border-collapse ${isWarehouseRequest ? "min-w-[900px]" : "min-w-[1550px]"}`}>
                    <thead>
                      <tr className="border-b border-border bg-background/60">
                        {(isWarehouseRequest
                          ? ["№", "Наименование", "Кол-во", "Совпавший товар", "Ед.", "Доступно", "Комментарий", "Статус", ""]
                          : ["№", "Исходный товар", "Кол-во", "Статус ML", "Совпавший товар", "Цена", "Сумма", "Доступно", "Комментарий", "Статус", ""]
                        ).map((heading, headingIndex) => (
                          <th key={heading || `actions-${headingIndex}`} className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mlImport.items.length === 0 && !isAddingRow && (
                        <tr><td colSpan={isWarehouseRequest ? 9 : 11} className="px-4 py-10 text-center text-sm text-muted-foreground">В ML-импорте нет товаров</td></tr>
                      )}
                      {mlImport.items.map((item, index) => {
                          const isUpdating = updatingItemId === item.id;
                          const isDeleting = deletingItemId === item.id;
                          const canDeleteRow =
                            mlImport.status === "draft" && !item.is_confirmed;
                          const price = Number(item.price ?? 0);
                          const totalAmount = Number(item.total_amount ?? 0);
                          const normalizedStatus = normalizeMlStatus(item.ml_status);
                          const rowState = getMlRowState(item, productCatalog);
                          const kitStatus = getItemKitStatus(item, productCatalog);
                          // Выбор товара доступен для ЛЮБОЙ неподтверждённой
                          // строки черновика — включая "Возможное совпадение"
                          // и "Есть в системе (недостаточно)", где ML заполнил
                          // только текстовый matched_product, но оставил
                          // selected_product_id пустым. Раньше такие строки
                          // рендерились простым текстом без селекта, и
                          // привязать их было физически нечем.
                          const canPickProduct =
                            mlImport.status === "draft" && !item.is_confirmed;

                          // «Заявка на склад»: готовность строки не зависит от
                          // цены/себестоимости/поставщика (см. rowState выше,
                          // который проверяет их для обычного импорта) — только
                          // товар из каталога и количество больше нуля, ровно
                          // как в unresolvedWarehouseRows, которым управляется
                          // кнопка «Подтверждаю».
                          const warehouseQuantity = Number(item.final_quantity ?? item.input_quantity ?? 0);
                          const effectiveNeedsProduct = isWarehouseRequest
                            ? item.selected_product_id == null
                            : rowState.needsProduct;
                          const isKitCompositionMissing = kitStatus.isKit && kitStatus.hasEmptyComponents;
                          const effectiveIsReady = isWarehouseRequest
                            ? item.selected_product_id != null && Number.isFinite(warehouseQuantity) && warehouseQuantity > 0 && !isKitCompositionMissing
                            : rowState.isReady;
                          const effectiveReasons = isWarehouseRequest
                            ? [
                                ...(Number.isFinite(warehouseQuantity) && warehouseQuantity > 0 ? [] : ["количество должно быть больше нуля"]),
                                ...(isKitCompositionMissing ? ["Комплект: выберите состав"] : []),
                              ]
                            : rowState.reasons;
                          const statusStyle = normalizedStatus
                            ? ML_STATUS_STYLES[normalizedStatus]
                            : UNKNOWN_ML_STATUS_STYLE;
                          // Для строки-комплекта — короткая расшифровка под
                          // статусом/ДОСТУПНО: сколько позиций состава не
                          // хватает, либо что состав вообще не подобран.
                          // kit_components — опциональное поле (см. api.ts),
                          // поэтому на старом backend просто ничего не покажем.
                          const kitComponentsCount = item.kit_components?.length ?? 0;
                          const kitShortfallCount =
                            item.kit_components?.filter((c) => c.shortfall_quantity > 0).length ?? 0;

                          return (
                              <tr key={item.id} className={`transition-colors ${statusStyle.row} ${isDeleting ? "opacity-50" : ""}`}>
                                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index + 1}</td>
                                <td className="px-4 py-3"><p
                                    className="text-sm font-medium text-foreground">{item.input_product}</p></td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-quantity-${item.final_quantity ?? item.input_quantity}`}
                                      type="number" min={1} step="1"
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={item.final_quantity ?? item.input_quantity}
                                      onBlur={(event) => {
                                        const newQuantity = Number(event.target.value);
                                        if (!Number.isFinite(newQuantity) || newQuantity <= 0) {
                                          setMlImportError("Количество должно быть числом больше нуля");
                                          return;
                                        }
                                        const currentQuantity = item.final_quantity ?? item.input_quantity;
                                        if (newQuantity !== currentQuantity) {
                                          handleMlItemUpdate(item.id, {final_quantity: Math.trunc(newQuantity)});
                                        }
                                      }}
                                      className="w-24 px-2 py-1.5 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
                                  />
                                </td>
                                {!isWarehouseRequest && (
                                  <td className="px-4 py-3">
                                    <StockStatusBadge status={item.ml_status} />
                                  </td>
                                )}
                                <td className="px-4 py-3">
                                  {canPickProduct ? (() => {
                                      const isPickerOpen = openVariantPickerId === item.id;
                                      const query = productSearch.trim().toLowerCase();

                                      // Подсказки ML: similar_variants + текстовый
                                      // matched_product. Раньше каталог жёстко
                                      // фильтровался ТОЛЬКО по similar_variants —
                                      // а он пуст у "Возможное совпадение", отчего
                                      // список всегда был пустым.
                                      //
                                      // ДОБАВЛЕНО: item.input_product. Для строк,
                                      // добавленных вручную кнопкой «Добавить
                                      // позицию», ML не запускался — matched_product
                                      // и similar_variants всегда пустые
                                      // (add_ml_import_item на бэкенде не делает
                                      // сопоставление, если selected_product_id не
                                      // передан). Введённое пользователем название —
                                      // единственный доступный текст для сравнения
                                      // с каталогом, а раньше он в suggestionLabels
                                      // не попадал вовсе, поэтому список подсказок
                                      // для новых строк был всегда пуст.
                                      const suggestionLabels = [
                                        ...getSimilarVariantLabels(item),
                                        item.matched_product?.trim() ?? "",
                                        item.input_product?.trim() ?? "",
                                      ].filter(Boolean);

                                      const suggested = productCatalog.filter((product) =>
                                        suggestionLabels.some((label) =>
                                          namesLooselyMatch(product.name, label),
                                        ),
                                      );
                                      const suggestedIds = new Set(suggested.map((p) => p.id));

                                      const matchesQuery = (product: CatalogProduct) =>
                                        !query || product.name.toLowerCase().includes(query);

                                      const shownSuggested = suggested.filter(matchesQuery);
                                      const shownRest = productCatalog
                                        .filter((product) => !suggestedIds.has(product.id))
                                        .filter(matchesQuery)
                                        .slice(0, 50);

                                      const selectedCatalogProduct =
                                        item.selected_product_id != null
                                          ? productCatalog.find((p) => p.id === item.selected_product_id)
                                          : undefined;

                                      const selectedProductName =
                                        item.selected_product_id != null
                                          ? selectedCatalogProduct?.name
                                            ?? item.matched_product
                                            ?? "Товар выбран"
                                          : null;

                                      // item.kit_components — сохранённый на backend
                                      // состав (авторитетный после saveMlImportKitComponents);
                                      // kitComponentsByItemId — то, что подбирается в
                                      // текущей сессии до сохранения (или на старом
                                      // backend, где kit_components ещё не отдаётся).
                                      const selectedKitComponentsCount =
                                        item.kit_components?.length ??
                                        kitComponentsByItemId[item.id]?.length ??
                                        0;

                                      return (
                                        <div className="relative" data-variant-picker={item.id}>
                                          <button
                                              type="button"
                                              disabled={isUpdating}
                                              onClick={(event) => {
                                                const willOpen = openVariantPickerId !== item.id;
                                                const rect = event.currentTarget.getBoundingClientRect();
                                                setProductSearch("");
                                                if (willOpen) {
                                                  setPickerPosition(computePickerPosition(rect));
                                                }
                                                setOpenVariantPickerId(willOpen ? item.id : null);
                                              }}
                                              className={`w-72 flex items-center justify-between gap-2 px-2 py-1.5 text-sm border rounded-md bg-card text-left disabled:bg-muted disabled:cursor-not-allowed ${
                                                item.selected_product_id != null ? "border-border" : "border-orange-300 dark:border-orange-400/30"
                                              }`}
                                          >
                                            <span className={`truncate ${selectedProductName ? "text-foreground" : "text-muted-foreground"}`}>
                                              {selectedProductName ??
                                                (productCatalogLoading
                                                  ? "Загрузка каталога…"
                                                  : item.matched_product?.trim()
                                                  ? `Подтвердите: ${item.matched_product.trim()}`
                                                  : "Выберите товар")}
                                            </span>
                                            <ChevronDown
                                                size={14}
                                                className={`flex-shrink-0 text-muted-foreground transition-transform ${isPickerOpen ? "rotate-180" : ""}`}
                                            />
                                          </button>

                                          {selectedCatalogProduct?.is_kit && (
                                            <button
                                                type="button"
                                                onClick={() => void openKitPicker(item, selectedCatalogProduct)}
                                                className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                            >
                                              <Pencil size={11} />
                                              {selectedKitComponentsCount > 0
                                                ? `Состав комплекта: ${selectedKitComponentsCount}`
                                                : "Выбрать состав комплекта"}
                                            </button>
                                          )}

                                          {isPickerOpen && pickerPosition && createPortal(
                                            <div
                                                data-variant-picker={item.id}
                                                style={{
                                                  position: "fixed",
                                                  left: pickerPosition.left,
                                                  width: pickerPosition.width,
                                                  maxHeight: pickerPosition.maxHeight,
                                                  ...(pickerPosition.top !== undefined
                                                    ? { top: pickerPosition.top }
                                                    : { bottom: pickerPosition.bottom }),
                                                }}
                                                className="z-50 overflow-y-auto bg-card border border-border rounded-lg shadow-lg py-1">
                                              <div className="sticky top-0 bg-card px-2 pb-1.5 pt-1">
                                                <div className="relative">
                                                  <Search
                                                      size={14}
                                                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                                                  />
                                                  <input
                                                      type="text"
                                                      autoFocus
                                                      value={productSearch}
                                                      onChange={(event) => setProductSearch(event.target.value)}
                                                      placeholder="Поиск по каталогу…"
                                                      className="w-full rounded-md border border-border bg-card py-2 pl-8 pr-2 text-sm outline-none focus:border-primary"
                                                  />
                                                </div>
                                              </div>

                                              {shownSuggested.length > 0 && (
                                                <>
                                                  <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                    Похожие по данным ML
                                                  </p>
                                                  {shownSuggested.map((product) => {
                                                    const isChecked = selectedProductIdsInDropdown.includes(String(product.id));
                                                    return (
                                                      <div
                                                          key={`suggested-${product.id}`}
                                                          role="button"
                                                          tabIndex={0}
                                                          onClick={() => toggleProductIdInDropdown(product.id)}
                                                          onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                              event.preventDefault();
                                                              toggleProductIdInDropdown(product.id);
                                                            }
                                                          }}
                                                          className={`w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm hover:bg-background transition-colors cursor-pointer ${
                                                            isChecked
                                                              ? "bg-blue-50 dark:bg-blue-400/15 text-primary font-medium"
                                                              : "text-foreground"
                                                          }`}
                                                      >
                                                        <Checkbox checked={isChecked} className="pointer-events-none shrink-0" />
                                                        <span className="truncate">{product.name}</span>
                                                        {product.is_kit && (
                                                          <span className="shrink-0 rounded-md bg-blue-50 dark:bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                                            Комплект
                                                          </span>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </>
                                              )}

                                              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {query ? "Найдено в каталоге" : "Весь каталог"}
                                              </p>
                                              {shownRest.length === 0 ? (
                                                <p className="px-3 py-2 text-xs text-muted-foreground">
                                                  {productCatalogLoading
                                                    ? "Загрузка каталога…"
                                                    : query
                                                    ? "Ничего не найдено — уточните запрос"
                                                    : "Каталог пуст"}
                                                </p>
                                              ) : (
                                                shownRest.map((product) => {
                                                  const isChecked = selectedProductIdsInDropdown.includes(String(product.id));
                                                  return (
                                                    <div
                                                        key={`catalog-${product.id}`}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => toggleProductIdInDropdown(product.id)}
                                                        onKeyDown={(event) => {
                                                          if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            toggleProductIdInDropdown(product.id);
                                                          }
                                                        }}
                                                        className={`w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm hover:bg-background transition-colors cursor-pointer ${
                                                          isChecked
                                                            ? "bg-blue-50 dark:bg-blue-400/15 text-primary font-medium"
                                                            : "text-foreground"
                                                        }`}
                                                    >
                                                      <Checkbox checked={isChecked} className="pointer-events-none shrink-0" />
                                                      <span className="truncate">{product.name}</span>
                                                      {product.is_kit && (
                                                        <span className="shrink-0 rounded-md bg-blue-50 dark:bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                                          Комплект
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })
                                              )}

                                              <div className="sticky bottom-0 border-t border-border bg-card mt-1 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                      setOpenVariantPickerId(null);
                                                      openProductModal(item);
                                                    }}
                                                    className="w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm font-medium text-primary hover:bg-accent transition-colors"
                                                >
                                                  <Plus size={14} /> Это новый товар
                                                </button>
                                                {item.selected_product_id != null && (
                                                  <button
                                                      type="button"
                                                      onClick={() => {
                                                        handleMlItemUpdate(item.id, {
                                                          selected_product_id: null,
                                                        });
                                                        setOpenVariantPickerId(null);
                                                        setKitComponentsByItemId((current) => {
                                                          if (!(item.id in current)) return current;
                                                          const next = { ...current };
                                                          delete next[item.id];
                                                          return next;
                                                        });
                                                      }}
                                                      className="w-full flex items-center gap-1.5 text-left px-3 py-2.5 text-sm font-medium text-destructive hover:bg-accent transition-colors"
                                                  >
                                                    <XCircle size={14} /> Снять привязку
                                                  </button>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={selectedProductIdsInDropdown.length === 0}
                                                    onClick={() => handleApplyProductSelection(item)}
                                                    className="w-full flex items-center justify-center gap-1.5 mt-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground transition-colors"
                                                >
                                                  <Check size={14} />
                                                  {selectedProductIdsInDropdown.length > 1
                                                    ? `Применить (комплект из ${selectedProductIdsInDropdown.length})`
                                                    : "Применить"}
                                                </button>
                                              </div>
                                            </div>,
                                            document.body,
                                          )}
                                        </div>
                                      );
                                    })() : (
                                    <>
                                      <p className="text-sm text-foreground">{item.matched_product ?? "—"}</p>
                                      {item.matched_external_id &&
                                          <p className="text-xs text-muted-foreground mt-1">ML ID: {item.matched_external_id}</p>}
                                    </>
                                  )}
                                </td>
                                {isWarehouseRequest && (
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.unit ?? "—"}</td>
                                )}
                                {!isWarehouseRequest && (
                                  <>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-price-${item.price}`}
                                      type="number" min={0} step="1"
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={price}
                                      onBlur={(event) => {
                                        const newPrice = Number(event.target.value);
                                        if (!Number.isFinite(newPrice) || newPrice < 0) {
                                          setMlImportError("Цена должна быть числом больше или равным нулю");
                                          return;
                                        }
                                        if (newPrice !== price) handleMlItemUpdate(item.id, {price: newPrice});
                                      }}
                                      className={`w-32 px-2 py-1.5 text-sm font-mono border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted ${
                                        price > 0 ? "border-border" : "border-red-300 dark:border-red-400/30"
                                      }`}
                                  />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap"><span
                                    className="text-sm font-semibold font-mono text-foreground">{formatMoney(totalAmount)}</span>
                                </td>
                                  </>
                                )}
                                <td className="px-4 py-3 text-sm font-mono text-foreground">
                                  {item.available_quantity}
                                  {item.is_kit && (
                                    <span className="ml-1 text-[10px] font-sans text-muted-foreground">компл.</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-comment-${item.user_comment ?? ""}`}
                                      type="text" maxLength={1000} disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={item.user_comment ?? ""} placeholder="Комментарий"
                                      onBlur={(event) => {
                                        const comment = event.target.value.trim() || null;
                                        if (comment !== item.user_comment) {
                                          handleMlItemUpdate(item.id, {user_comment: comment});
                                        }
                                      }}
                                      className="w-44 px-2 py-1.5 text-sm border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  {isUpdating ? (
                                      <Loader2
                                          size={16}
                                          className="animate-spin text-primary"
                                      />
                                  ) : item.is_confirmed ? (
                                      <span
                                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
      <CheckCircle2 size={14}/>
      Добавлен
    </span>
                                  ) : effectiveNeedsProduct ? (
                                      <AppTooltip text="Строку нельзя импортировать без товара из каталога. Выберите товар в колонке «Совпавший товар» или создайте новый.">
                                        <button
                                            type="button"
                                            onClick={() => openProductModal(item)}
                                            disabled={mlImport.status !== "draft"}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:bg-slate-200 disabled:text-muted-foreground disabled:cursor-not-allowed"
                                        >
                                          <Plus size={13}/>
                                          Добавить товар
                                        </button>
                                      </AppTooltip>
                                  ) : !effectiveIsReady ? (
                                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
                                        {effectiveReasons.join("; ")}
                                      </span>
                                  ) : (
                                      <div className="flex flex-col items-start gap-1">
                                        {normalizedStatus === "На складе" ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
                                            <CheckCircle2 size={14}/>
                                            На складе
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                                            <CheckCircle2 size={14}/>
                                            Будет куплено
                                          </span>
                                        )}
                                        {item.is_kit && kitComponentsCount === 0 && (
                                          <span className="text-[11px] text-amber-700 dark:text-amber-300">
                                            Состав комплекта не выбран
                                          </span>
                                        )}
                                        {item.is_kit && kitComponentsCount > 0 && kitShortfallCount > 0 && (
                                          <span className="text-[11px] text-amber-700 dark:text-amber-300">
                                            Не хватает: {kitShortfallCount} из {kitComponentsCount} позиций
                                          </span>
                                        )}
                                        {mlImport.status === "draft" && (
                                          <button
                                              type="button"
                                              onClick={() => openProductModal(item)}
                                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                          >
                                            <Plus size={12}/>
                                            Другой товар
                                          </button>
                                        )}
                                      </div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {canDeleteRow && (
                                    <AppTooltip text="Удалить строку из импорта">
                                      <button
                                          type="button"
                                          onClick={() => handleMlItemDelete(item)}
                                          disabled={isDeleting || isUpdating}
                                          aria-label={`Удалить строку ${item.input_product}`}
                                          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-red-50 dark:hover:bg-red-400/15 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {isDeleting ? (
                                          <Loader2 size={15} className="animate-spin"/>
                                        ) : (
                                          <Trash2 size={15}/>
                                        )}
                                      </button>
                                    </AppTooltip>
                                  )}
                                </td>
                              </tr>
                          );
                        })}

                      {isAddingRow && mlImport.status === "draft" && (
                        <tr className="bg-blue-50/60 dark:bg-blue-400/10">
                          <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                            {mlImport.items.length + 1}
                          </td>
                          <td className="px-4 py-3">
                            <ProductSearchCombobox
                                disabled={savingNewRow}
                                value={{
                                  productId: newRowForm.selected_product_id,
                                  name: newRowForm.input_product,
                                  unit: newRowForm.unit,
                                }}
                                onChange={(next) => setNewRowForm((current) => ({
                                  ...current,
                                  input_product: next.name,
                                  selected_product_id: next.productId,
                                  unit: next.unit,
                                }))}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                                type="number"
                                min={1}
                                step="1"
                                disabled={savingNewRow}
                                value={newRowForm.input_quantity}
                                onChange={(event) => setNewRowForm((current) => ({
                                  ...current,
                                  input_quantity: event.target.value,
                                }))}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleCreateMlItem();
                                  }
                                  if (event.key === "Escape") setIsAddingRow(false);
                                }}
                                className="w-24 px-2 py-1.5 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
                            />
                          </td>
                          <td colSpan={isWarehouseRequest ? 5 : 7} className="px-4 py-3 text-xs text-muted-foreground">
                            Товар из каталога и цену продажи укажите в самой строке
                            после её создания.
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                  type="button"
                                  onClick={handleCreateMlItem}
                                  disabled={savingNewRow}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:bg-slate-200 disabled:text-muted-foreground disabled:cursor-not-allowed"
                              >
                                {savingNewRow ? (
                                  <>
                                    <Loader2 size={13} className="animate-spin"/>
                                    Сохранение…
                                  </>
                                ) : (
                                  <>
                                    <Check size={13}/>
                                    Сохранить
                                  </>
                                )}
                              </button>
                              <button
                                  type="button"
                                  onClick={() => setIsAddingRow(false)}
                                  disabled={savingNewRow}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors disabled:cursor-not-allowed"
                                  aria-label="Отменить добавление позиции"
                              >
                                <XCircle size={16}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {mlImport.status === "draft" && !isAddingRow && (
                  <button
                      type="button"
                      onClick={handleStartAddingRow}
                      disabled={creatingEmptyImport}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-dashed border-input rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={15}/>
                    Добавить позицию
                  </button>
                )}

                <div className="flex items-center justify-between gap-4 mt-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {isWarehouseRequest
                        ? "Каждая строка должна быть привязана к товару из каталога — выберите его в колонке «Совпавший товар» либо нажмите «Это новый товар», если подходящего нет. Также укажите количество больше нуля."
                        : "Каждая строка должна быть привязана к товару из каталога — выберите его в колонке «Совпавший товар» либо нажмите «Это новый товар», если подходящего нет. Также у каждой строки должны быть указаны поставщик, цена продажи больше нуля и количество."}
                    </p>
                    {isWarehouseRequest ? (
                      mlImport.status === "draft" && unresolvedWarehouseRows.length > 0 && (
                        <p className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                          Не готово строк: {unresolvedWarehouseRows.length} из {mlImport.items.length}
                          {" — "}
                          {unresolvedWarehouseRows
                            .slice(0, 8)
                            .map((row) => `№${row.index + 1}`)
                            .join(", ")}
                          {unresolvedWarehouseRows.length > 8 ? " и др." : ""}
                        </p>
                      )
                    ) : (
                      mlImport.status === "draft" && unresolvedRows.length > 0 && (
                        <p className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                          Не готово строк: {unresolvedRows.length} из {mlImport.items.length}
                          {" — "}
                          {unresolvedRows
                            .slice(0, 8)
                            .map((row) => `№${row.index + 1}`)
                            .join(", ")}
                          {unresolvedRows.length > 8 ? " и др." : ""}
                        </p>
                      )
                    )}
                    {mlImport.status === "draft" && invalidKitsHint && (
                      <p className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                        {invalidKitsHint}
                      </p>
                    )}
                  </div>
                  {isWarehouseRequest ? (
                    <AppTooltip text={warehouseConfirmBlockedHint}>
                      <button
                          type="button"
                          onClick={handleConfirmWarehouseRequest}
                          disabled={!canConfirmWarehouseRequest || confirmingImport || sending}
                          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:bg-slate-200 disabled:text-muted-foreground disabled:cursor-not-allowed enabled:bg-primary enabled:text-white enabled:hover:bg-primary/90 enabled:cursor-pointer"
                      >
                        {confirmingImport || sending ? (
                            <>
                              <Loader2 size={15} className="animate-spin"/>
                              Отправка…
                            </>
                        ) : mlImport.status === "confirmed" ? (
                            <>
                              <CheckCircle2 size={15}/>
                              Отправлено Комдиру
                            </>
                        ) : (
                            <>
                              <Check size={15}/>
                              Подтверждаю
                            </>
                        )}
                      </button>
                    </AppTooltip>
                  ) : (
                    <AppTooltip text={confirmBlockedHint}>
                      <button
                          type="button"
                          onClick={() => void handleConfirmMlImport()}
                          disabled={!canConfirmMlImport || confirmingImport}
                          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:bg-slate-200 disabled:text-muted-foreground disabled:cursor-not-allowed enabled:bg-primary enabled:text-white enabled:hover:bg-primary/90 enabled:cursor-pointer"
                      >
                        {confirmingImport ? (
                            <>
                              <Loader2 size={15} className="animate-spin"/>
                              Подтверждение…
                            </>
                        ) : mlImport.status === "confirmed" ? (
                            <>
                              <CheckCircle2 size={15}/>
                              {isExpress ? "Отправлено в закуп" : "Импорт подтверждён"}
                            </>
                        ) : (
                            <>
                              <Check size={15}/>
                              {isExpress ? "Подтвердить и отправить в закуп" : "Подтвердить импорт"}
                            </>
                        )}
                      </button>
                    </AppTooltip>
                  )}
                </div>
                </>
                )}
              </>
            )}
        </div>

        {productModalItem && (
          <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-product-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeProductModal();
              }}
          >
            <div className="w-full max-w-lg rounded-xl bg-card shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                <div>
                  <h2 id="create-product-title" className="text-lg font-semibold text-foreground">
                    Добавить товар в систему
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Статус ML-строки не изменится, но после создания товара строка будет привязана к нему и готова к подтверждению.
                  </p>
                </div>
                <button
                    type="button"
                    onClick={closeProductModal}
                    disabled={savingProduct}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground disabled:cursor-not-allowed"
                    aria-label="Закрыть"
                >
                  <XCircle size={20}/>
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="space-y-4 px-6 py-5">
                {unlinkBeforeCreate && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-400/25 bg-amber-50 dark:bg-amber-400/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    Строка сейчас привязана к товару{" "}
                    <span className="font-medium">«{productModalItem.matched_product ?? "—"}»</span>.
                    После сохранения она будет переведена на новый товар.
                  </div>
                )}

                <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Строка из файла: <span className="font-medium text-foreground">{productModalItem.input_product}</span>
                  {productModalItem.matched_product && (
                    <>
                      {" · "}ML предложил:{" "}
                      <span className="font-medium text-foreground">{productModalItem.matched_product}</span>
                    </>
                  )}
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Название товара
                  </span>
                  <input
                      type="text"
                      required
                      maxLength={255}
                      value={productModalForm.product_name}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        product_name: event.target.value,
                      }))}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Единица измерения
                  </span>
                  <input
                      type="text"
                      required
                      maxLength={50}
                      list="ml-product-unit-options"
                      value={productModalForm.unit}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))}
                      placeholder="Выберите или введите"
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <datalist id="ml-product-unit-options">
                    {["шт", "компл.", "упак.", "кг", "м", "л"].map((unit) => (
                      <option key={unit} value={unit}/>
                    ))}
                  </datalist>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Цена продажи
                  </span>
                  <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={productModalForm.price}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        price: event.target.value,
                      }))}
                      className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                      checked={productModalForm.is_kit}
                      onCheckedChange={(checked) => setProductModalForm((current) => ({
                        ...current,
                        is_kit: checked === true,
                      }))}
                  />
                  Это комплект (состоит из нескольких товаров)
                </label>

                {productModalError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-400/25 bg-red-50 dark:bg-red-400/15 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {productModalError}
                  </div>
                )}

                <div className="flex justify-end gap-3 border-t border-border pt-4">
                  <button
                      type="button"
                      onClick={closeProductModal}
                      disabled={savingProduct}
                      className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Отмена
                  </button>
                  <button
                      type="submit"
                      disabled={savingProduct}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {savingProduct && <Loader2 size={15} className="animate-spin"/>}
                    {savingProduct ? "Сохранение…" : "Создать товар"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {kitPickerItem && kitPickerProduct && (() => {
          // КОЛ-ВО строки могло измениться после того, как кит-пикер был
          // открыт (final_quantity правится вне модалки) — берём свежее
          // значение из mlImport.items, а не из захваченного при открытии
          // kitPickerItem, чтобы required = quantityPerKit × kitRowQuantity
          // не был устаревшим.
          const kitRowItem = mlImport?.items.find((i) => i.id === kitPickerItem.id) ?? kitPickerItem;
          const kitRowQuantity = Number(kitRowItem.final_quantity ?? kitRowItem.input_quantity ?? 1);
          const kitShortfallIds = kitSelectedIds.filter((id) => {
            const required = (kitQuantities[id] ?? 1) * kitRowQuantity;
            const available = kitAvailability[id] ?? 0;
            return available < required;
          });
          const hasAvailabilityData = Object.keys(kitAvailability).length > 0;

          // Подсказка себестоимости компонента, пока ПМ её не ввёл: цена из
          // уже сохранённого черновика строки (unit_cost — эффективная
          // себестоимость на backend), а для только что добавленных в этой
          // сессии компонентов — цена из каталога товаров. Manual imports
          // ("Заявка на склад") цен не имеют вовсе — там кит-пикер эту
          // колонку не рендерит (см. isWarehouseRequest ниже).
          const getComponentCostPlaceholder = (id: string): number | null => {
            const savedComponent = kitRowItem.kit_components?.find(
              (c) => String(c.component_product_id) === id,
            );
            if (savedComponent?.unit_cost != null) {
              const value = Number(savedComponent.unit_cost);
              if (Number.isFinite(value)) return value;
            }
            const catalogProduct = productCatalog.find((p) => String(p.id) === id);
            if (catalogProduct?.price != null) {
              const value = Number(catalogProduct.price);
              if (Number.isFinite(value)) return value;
            }
            return null;
          };

          // Себестоимость комплекта = Σ(кол-во на комплект × (введённая
          // себестоимость, иначе подсказка)). Компонент без известной цены
          // не считается нулём — попадает в отдельный счётчик "без цены".
          let kitCostTotal = 0;
          let kitCostMissingCount = 0;
          kitSelectedIds.forEach((id) => {
            const quantityPerKit = kitQuantities[id] ?? 1;
            const cost = parseKitComponentCost(kitComponentCosts[id]) ?? getComponentCostPlaceholder(id);
            if (cost == null || !Number.isFinite(cost)) {
              kitCostMissingCount += 1;
            } else {
              kitCostTotal += cost * quantityPerKit;
            }
          });

          return (
          <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="kit-picker-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeKitPicker();
              }}
          >
            <div className="w-full max-w-2xl rounded-xl bg-card shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                <div>
                  <h2 id="kit-picker-title" className="text-lg font-semibold text-foreground">
                    Состав комплекта «{kitPickerProduct.name}»
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Строка «{kitPickerItem.input_product}» привязана к комплекту — выберите товары, из которых он состоит, и укажите их количество.
                  </p>
                </div>
                <button
                    type="button"
                    onClick={closeKitPicker}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                    aria-label="Закрыть"
                >
                  <XCircle size={20}/>
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                {kitLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin"/>
                    Загрузка состава комплекта…
                  </div>
                ) : (
                  <>
                    <MultiSelectCombobox
                        options={productCatalog
                          .filter((product) => product.id !== kitPickerProduct.id && !product.is_kit)
                          .map((product) => ({ value: String(product.id), label: product.name }))}
                        selected={kitSelectedIds}
                        onChange={(values) => {
                          setKitSelectedIds(values);
                          setKitQuantities((current) => {
                            const next: Record<string, number> = {};
                            values.forEach((id) => { next[id] = current[id] ?? 1; });
                            return next;
                          });
                        }}
                        placeholder="Выберите товары комплекта…"
                        searchPlaceholder="Поиск по каталогу…"
                        emptyText={productCatalogLoading ? "Загрузка каталога…" : "Ничего не найдено"}
                        onCreateOption={handleCreateKitComponentProduct}
                    />

                    {kitSelectedIds.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        {kitAvailabilityLoading && !hasAvailabilityData ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 size={14} className="animate-spin"/>
                            Проверяем остатки…
                          </span>
                        ) : kitShortfallIds.length === 0 ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-green-700 dark:text-green-300">
                            <CheckCircle2 size={14}/>
                            Хватает на {kitRowQuantity} компл.
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={14}/>
                            Не хватает по {kitShortfallIds.length} из {kitSelectedIds.length} позиций
                          </span>
                        )}
                        {kitAvailabilityError && (
                          <span className="text-xs text-red-700 dark:text-red-300">
                            ({kitAvailabilityError})
                          </span>
                        )}
                      </div>
                    )}

                    {kitSelectedIds.length > 0 && (
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                        {kitSelectedIds.map((id) => {
                          const componentProduct = productCatalog.find((p) => String(p.id) === id);
                          const quantityPerKit = kitQuantities[id] ?? 1;
                          const required = quantityPerKit * kitRowQuantity;
                          const available = kitAvailability[id] ?? 0;
                          const isKnown = id in kitAvailability;
                          const sufficient = isKnown && available >= required;
                          const shortfall = Math.max(required - available, 0);
                          const rowBackground = !isKnown
                            ? UNKNOWN_ML_STATUS_STYLE.row
                            : sufficient
                            ? ML_STATUS_STYLES["На складе"].row
                            : ML_STATUS_STYLES["Есть в системе (недостаточно)"].row;
                          const costPlaceholder = getComponentCostPlaceholder(id);

                          return (
                            <div key={id} className={`flex items-center justify-between gap-3 px-3 py-2 ${rowBackground}`}>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {componentProduct?.name ?? `Товар #${id}`}
                                </p>
                                {!isKnown ? (
                                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Loader2 size={10} className="animate-spin"/>
                                    Проверка остатков…
                                  </span>
                                ) : (
                                  <StockStatusBadge
                                      status={sufficient ? "На складе" : "Есть в системе (недостаточно)"}
                                      label={sufficient ? "На складе" : `Не хватает ${shortfall}`}
                                      className="mt-1 px-2 py-0.5 text-[11px]"
                                  />
                                )}
                              </div>
                              <input
                                  type="number"
                                  min={1}
                                  step="1"
                                  value={kitQuantities[id] ?? 1}
                                  onChange={(event) => {
                                    const qty = Number(event.target.value);
                                    setKitQuantities((current) => ({
                                      ...current,
                                      [id]: Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 1,
                                    }));
                                  }}
                                  className="w-20 shrink-0 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:border-primary"
                              />
                              {!isWarehouseRequest && (
                                <div className="flex flex-col items-end gap-0.5 shrink-0">
                                  <span className="text-[10px] leading-none text-muted-foreground">
                                    Себестоимость, за ед.
                                  </span>
                                  <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      aria-label="Себестоимость за единицу"
                                      value={id in kitComponentCosts ? kitComponentCosts[id] : ""}
                                      placeholder={costPlaceholder != null ? String(costPlaceholder) : "—"}
                                      onChange={(event) => {
                                        // Запятая — привычный для ПМ десятичный разделитель,
                                        // нормализуем в точку до валидации.
                                        const raw = event.target.value.replace(",", ".");
                                        if (raw === "") {
                                          setKitComponentCosts((current) => {
                                            const next = { ...current };
                                            delete next[id];
                                            return next;
                                          });
                                          return;
                                        }
                                        // Разрешаем недописанные промежуточные состояния ("12.",
                                        // "0.") — хранится сырой текст, а не Number(raw), иначе
                                        // контролируемый инпут откатывал бы value к уже
                                        // распарсенному числу на каждый рендер, съедая точку
                                        // прежде, чем ПМ допишет дробную часть. "-" (и любые
                                        // другие символы вне цифр/точки) отклоняется целиком —
                                        // отрицательная себестоимость недопустима.
                                        if (!/^\d*\.?\d*$/.test(raw)) return;
                                        setKitComponentCosts((current) => ({ ...current, [id]: raw }));
                                      }}
                                      className="w-24 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:border-primary"
                                  />
                                </div>
                              )}
                              <button
                                  type="button"
                                  onClick={() => {
                                    setKitSelectedIds((current) => current.filter((v) => v !== id));
                                    setKitQuantities((current) => {
                                      const next = { ...current };
                                      delete next[id];
                                      return next;
                                    });
                                  }}
                                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                                  aria-label="Убрать из комплекта"
                              >
                                <XCircle size={15}/>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isWarehouseRequest && kitSelectedIds.length > 0 && (
                      <p className="text-sm font-medium text-foreground">
                        Себестоимость комплекта: {formatMoney(kitCostTotal)}
                        {kitCostMissingCount > 0 && (
                          <span className="text-amber-700 dark:text-amber-300">
                            {" "}+ без цены: {kitCostMissingCount}
                          </span>
                        )}
                      </p>
                    )}
                  </>
                )}

                {kitResolveNotice && (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-400/25 bg-blue-50 dark:bg-blue-400/15 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                    {kitResolveNotice}
                  </div>
                )}

                {kitError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-400/25 bg-red-50 dark:bg-red-400/15 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {kitError}
                  </div>
                )}

                <div className="flex justify-end gap-3 border-t border-border pt-4">
                  <button
                      type="button"
                      onClick={closeKitPicker}
                      className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Отмена
                  </button>
                  <button
                      type="button"
                      onClick={() => void handleSaveKitComponents()}
                      disabled={kitLoading || kitSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {kitSaving && <Loader2 size={14} className="animate-spin"/>}
                    Сохранить состав
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}
    </PageWrap>
  );
}

export function ProjectPageDirector({projectState, onKpApproved, projectId}: {
  projectState: ProjectState; onKpApproved: () => void; projectId: number;
}) {
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isGeneratingKP, setIsGeneratingKP] = useState(false);

  const resolvedProjectId = Number(projectId);
  const hasValidProjectId = Number.isInteger(resolvedProjectId) && resolvedProjectId > 0;
  const [projectItems, setProjectItems] =
  useState<ProjectItemResponse[]>([]);

const [projectItemsLoading, setProjectItemsLoading] =
  useState(false);

const [projectItemsError, setProjectItemsError] =
  useState<string | null>(null);

const [updatingItemId, setUpdatingItemId] =
  useState<number | null>(null);

const [itemSaveError, setItemSaveError] =
  useState<string | null>(null);

  const estimateRows: EstimateRow[] = projectItems.map((item) => {
    const parsedPrice = item.estimated_price == null
      ? null
      : Number(item.estimated_price);

    return {
      id: item.id,
      name: item.product?.name ?? "—",
      code: item.matched_external_id ?? item.product?.external_id ?? null,
      quantity: Number(item.required_quantity ?? 0),
      estimatedPrice: parsedPrice != null && Number.isFinite(parsedPrice)
        ? parsedPrice
        : null,
    };
  });
  useEffect(() => {
    if (!hasValidProjectId) {
      setProject(null);
      setProjectError(`Некорректный ID проекта: ${String(projectId)}`);
      return;
    }
    let cancelled = false;
    setProjectError(null);
    fetchProjectDetails(resolvedProjectId)
      .then((data) => { if (!cancelled) { setProject(data); setProjectError(null); } })
      .catch((error) => { if (!cancelled) { setProject(null); setProjectError(error instanceof Error ? error.message : "Не удалось загрузить проект"); } });
    return () => { cancelled = true; };
  }, [resolvedProjectId, hasValidProjectId]);

  useEffect(() => {
  if (!hasValidProjectId) {
    setProjectItems([]);
    setProjectItemsError(
      `Некорректный ID проекта: ${String(projectId)}`,
    );
    return;
  }

  let cancelled = false;

  setProjectItemsLoading(true);
  setProjectItemsError(null);

  fetchProjectItems(resolvedProjectId)
    .then((data) => {
      if (cancelled) return;

      setProjectItems(data);
      setProjectItemsError(null);
    })
    .catch((error) => {
      if (cancelled) return;

      setProjectItems([]);

      setProjectItemsError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить позиции проекта",
      );
    })
    .finally(() => {
      if (!cancelled) {
        setProjectItemsLoading(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, [
  resolvedProjectId,
  hasValidProjectId,
  projectId,
]);

  // Развёрнутость групп-комплектов — по kit_group_key, чтобы пережить
  // перезапрос projectItems после правки цены комплекта (см.
  // handleKitPricesSaved ниже). Раскрыта по умолчанию.
  const [expandedKitGroups, setExpandedKitGroups] = useState<Record<string, boolean>>({});

  // После patchKitGroupPrices тело ответа не гарантировано — всегда
  // перечитываем позиции проекта заново, а не полагаемся на него.
  const refreshProjectItems = async () => {
    if (!hasValidProjectId) return;
    try {
      const data = await fetchProjectItems(resolvedProjectId);
      setProjectItems(data);
      setProjectItemsError(null);
    } catch (error) {
      setProjectItemsError(
        error instanceof Error ? error.message : "Не удалось загрузить позиции проекта",
      );
    }
  };

  const currentStatus = project?.status?.status_name || "На согласовании у Комдира";

  // «Заявка на склад»: цена/себестоимость/поставщик ей не нужны — это
  // внутренний запрос по наличию, а не коммерческая позиция. Признак
  // приходит с бэкенда на самом проекте (не на импорте, как в ProjectPagePM,
  // — здесь ml_import вообще не загружается).
  const isWarehouseRequest = project?.is_warehouse_request === true;

  const PENDING_DIRECTOR_STATUS = "На согласовании у Комдира";
  const REJECTED_STATUS = "Отклонено Комдиром";

  const decision: null | boolean =
    currentStatus === REJECTED_STATUS ? false :
    currentStatus === PENDING_DIRECTOR_STATUS ? null :
    true;

  const decide = async (approve: boolean) => {
    if (!project) return;

    if (!approve && !showRejectForm) {
      // Первый клик по "Отклонить КП" просто открывает форму с комментарием.
      setShowRejectForm(true);
      return;
    }

    setDeciding(true);
    try {
      if (approve) {
        await approveProjectDirector(project.id);
        setProject(await fetchProjectDetails(project.id));
        onKpApproved();
      } else {
        await rejectProjectDirector(project.id, rejectReason.trim() || undefined);
        setProject(await fetchProjectDetails(project.id));
        setShowRejectForm(false);
        setRejectReason("");
      }
    } catch (error) {
      console.error("Ошибка при принятии решения:", error);
      alert("Не удалось сохранить решение.");
    } finally {
      setDeciding(false);
    }
  };

  const canEditItems = decision === null;

  const PROJECT_ITEMS_API_BASE = "/api/v1/project-items";

  // Единственное поле, которое Комдир правит на ProjectPage, — sale_price.
  // cost_price/supplier теперь заполняются в Закупках (см. перенос); сигнатура
  // сужена намеренно, чтобы сюда нельзя было случайно передать другое поле
  // и затереть значение, проставленное Закупкой.
  const handleItemFieldUpdate = async (
    itemId: number,
    payload: { sale_price: number },
  ) => {
    if (!project) return;

    setUpdatingItemId(itemId);
    setItemSaveError(null);

    try {
      const response = await fetch(`${PROJECT_ITEMS_API_BASE}/${project.id}/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail = Array.isArray(errorBody?.detail)
          ? errorBody.detail.map((e: { msg?: string }) => e.msg).join("; ")
          : errorBody?.detail;
        throw new Error(detail || "Не удалось сохранить изменения");
      }

      const updatedItem = await response.json();

      setProjectItems((current) =>
        current.map((existing) =>
          existing.id === itemId ? { ...existing, ...updatedItem } : existing,
        ),
      );
    } catch (error) {
      setItemSaveError(
        error instanceof Error ? error.message : "Не удалось сохранить изменения",
      );
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleExportExcel = async () => {
    if (!project) return;
    try {
      setIsExporting(true);
      await downloadProjectExcel(project.id);
    } catch (error) {
      console.error("Ошибка при скачивании:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const canGenerateKP = decision === true && currentStatus === "Ожидание клиента";

  const handleGenerateKP = async () => {
    if (!project) return;
    try {
      setIsGeneratingKP(true);
      await downloadKpDocument(project.id);
    } catch (error) {
      console.error("Ошибка генерации КП:", error);
      alert(error instanceof Error ? error.message : "Не удалось сгенерировать КП");
    } finally {
      setIsGeneratingKP(false);
    }
  };

  const title = project?.name ?? "Офисный комплекс «Башня»";
  const subtitle = project
      ? `${project.client?.client_name ?? "—"} · Проверка проекта`
      : "ООО «СтройТех» · Проверка проекта";
  const sidebarDetails: [string, string][] = [
  [
    "Создан",
    project?.created_at
      ? new Date(project.created_at).toLocaleDateString("ru-RU")
      : "—",
  ],
  [
    "Дедлайн",
    project?.deadline
      ? new Date(project.deadline).toLocaleDateString("ru-RU")
      : "—",
  ],
  [
    "Менеджер",
    project?.pm?.name ?? "—",
  ],
  [
    "Клиент",
    project?.client?.client_name ?? "—",
  ],
];

  return (
    <PageWrap
      title={title}
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-2">
          <Chip status={currentStatus} />
          <Chip status="kp" />
          <button
            type="button"
            onClick={() => setShowEstimate((current) => !current)}
            disabled={projectItemsLoading || projectItems.length === 0}
            aria-expanded={showEstimate}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              showEstimate
                ? "border-primary bg-blue-50 dark:bg-blue-400/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-background"
            }`}
          >
            <Calculator size={14}/>
            Смета
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExporting || !project}
            className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-card border border-border text-muted-foreground text-xs font-medium rounded hover:bg-background transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
            {isExporting ? "Скачивание..." : "Скачать Excel"}
          </button>
          {canGenerateKP && (
            <button
              onClick={handleGenerateKP}
              disabled={isGeneratingKP || !project}
              className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-card border border-border text-foreground text-xs font-medium rounded hover:bg-background transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {isGeneratingKP ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14} />}
              {isGeneratingKP ? "Генерация..." : "Сгенерировать КП"}
            </button>
          )}
        </div>
      }
    >
      {projectError && (
        <div className="mb-6 flex items-start gap-2.5 px-4 py-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
          <AlertTriangle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Не удалось загрузить проект</p>
            <p className="text-xs text-destructive mt-1">{projectError}</p>
          </div>
        </div>
      )}
      {showEstimate && <EstimateTable rows={estimateRows}/>}

      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 bg-card rounded-lg border border-border">
        {sidebarDetails.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium text-foreground">{value}</dd>
            </div>
        ))}
      </div>

      <div className="space-y-5">
        {itemSaveError && (
            <div className="mb-3 flex items-start gap-2.5 px-4 py-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
              <AlertTriangle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Не удалось сохранить</p>
                <p className="text-xs text-destructive mt-1">{itemSaveError}</p>
              </div>
            </div>
          )}
          {(() => {
            // Себестоимость/поставщик/маржа больше не показываются и не
            // редактируются на ProjectPage — заполняются на ProcurementPage.
            // Комдир правит только sale_price (см. handleItemFieldUpdate).
            const directorHeaders = isWarehouseRequest
              ? ["№", "Наименование", "Кол-во", "Ед.", "Статус"]
              : ["№", "Наименование", "Кол-во", "Ед.", "Цена", "Сумма", "Статус"];
            const directorColSpan = directorHeaders.length;

            const renderDirectorItemRow = (item: ProjectItemResponse, index: number) => {
              const qty = Number(item.required_quantity ?? 0);
              const price = Number(item.sale_price ?? 0);
              const total = item.total_sum != null ? Number(item.total_sum) : qty * price;
              const isEditedByDirector = Boolean((item as { edited_by_director?: boolean }).edited_by_director);
              const isSaving = updatingItemId === item.id;
              const disabled = !canEditItems || isSaving;
              const stockStatusName = item.status?.status_name ?? "—";
              const isInStock = stockStatusName === "На складе";
              // Компонент комплекта: цена/себестоимость правятся только на
              // уровне комплекта (см. KitGroupHeaderRow) — здесь только
              // отображение уже распределённых (allocated) значений.
              const isKitComponent = Boolean(item.kit_group_key);
              const quantityPerKit = Number(item.quantity_per_kit ?? 0);

              return (
                  <tr key={item.id} className="hover:bg-background/50">
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index + 1}</td>
                    <td className={`px-4 py-3 text-sm text-foreground ${isKitComponent ? "pl-8 border-l-2 border-border/60" : ""}`}>
                      {item.product?.name ?? "—"}
                      {isKitComponent && quantityPerKit > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          × {quantityPerKit.toLocaleString("ru-RU")} в комплекте
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{qty.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.product?.unit ?? "шт"}</td>
                    {!isWarehouseRequest && (
                      <>
                        <td className="px-4 py-3">
                          {isKitComponent ? (
                            <span className="inline-block w-28 px-2 py-1.5 text-sm font-mono text-muted-foreground">
                              {price.toLocaleString("ru-RU")}
                            </span>
                          ) : (
                            <input
                                key={`${item.id}-price-${price}`}
                                type="number"
                                min={0}
                                step="1"
                                disabled={disabled}
                                defaultValue={price}
                                onBlur={(event) => {
                                  const newPrice = Number(event.target.value);
                                  if (!Number.isFinite(newPrice) || newPrice < 0) {
                                    setItemSaveError("Цена должна быть числом больше или равным нулю");
                                    return;
                                  }
                                  if (newPrice !== price) {
                                    handleItemFieldUpdate(item.id, { sale_price: newPrice });
                                  }
                                }}
                                className="w-28 px-2 py-1.5 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted disabled:cursor-not-allowed"
                            />
                          )}
                        </td>
                        <td className={`px-4 py-3 text-sm font-mono whitespace-nowrap ${isKitComponent ? "text-muted-foreground" : "font-semibold"}`}>{total.toLocaleString("ru-RU")}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {isSaving ? (
                        <Loader2 size={16} className="animate-spin text-primary" />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span
                              className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${isInStock ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200"}`}>
                            {stockStatusName}
                          </span>
                          {isEditedByDirector && (
                            <span title="Изменено Комдиром">
                              <Pencil size={13} className="text-muted-foreground flex-shrink-0" />
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
              );
            };

            return (
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <table className={`w-full border-collapse ${isWarehouseRequest ? "min-w-[600px]" : "min-w-[1150px]"}`}>
              <thead>
              <tr className="border-b border-border bg-background/60">
                {directorHeaders.map(h => (
                    <th key={h}
                        className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projectItemsLoading ? (
                  <tr>
                    <td colSpan={directorColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <Loader2 size={16} className="inline-block animate-spin text-primary mr-2" />
                      Загружаем позиции проекта…
                    </td>
                  </tr>
                ) : projectItemsError ? (
                  <tr>
                    <td colSpan={directorColSpan} className="px-4 py-10 text-center text-sm text-destructive">
                      {projectItemsError}
                    </td>
                  </tr>
                ) : projectItems.length === 0 ? (
                  <tr>
                    <td colSpan={directorColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      В проекте нет позиций
                    </td>
                  </tr>
                ) : (
                  groupEntriesByKit(
                    projectItems.map((item, index) => ({ item, index })),
                    (entry) => entry.item.kit_group_key,
                  ).map((row) => {
                    if (row.type === "single") {
                      return renderDirectorItemRow(row.entry.item, row.entry.index);
                    }

                    const first = row.entries[0].item;
                    const expanded = expandedKitGroups[row.key] ?? true;
                    const itemsTotalSum = row.entries.reduce(
                      (sum, entry) => sum + Number(entry.item.total_sum ?? 0),
                      0,
                    );

                    return (
                      <React.Fragment key={row.key}>
                        <KitGroupHeaderRow
                            projectId={resolvedProjectId}
                            groupKey={row.key}
                            kitName={first.kit_name ?? "Комплект"}
                            kitQuantity={Number(first.kit_quantity ?? 0)}
                            itemCount={row.entries.length}
                            colSpan={directorColSpan}
                            expanded={expanded}
                            onToggleExpand={() =>
                              setExpandedKitGroups((current) => ({
                                ...current,
                                [row.key]: !expanded,
                              }))
                            }
                            showPrices={!isWarehouseRequest}
                            kitUnitSalePrice={Number(first.kit_unit_sale_price ?? 0)}
                            itemsTotalSum={itemsTotalSum}
                            canEdit={canEditItems}
                            onPricesSaved={() => { void refreshProjectItems(); }}
                        />
                        {expanded && row.entries.map((entry) => renderDirectorItemRow(entry.item, entry.index))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
            );
          })()}

          <div className="bg-card rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Решение по проекту</h3>
            {deciding ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15}
                                                                                         className="animate-spin text-primary"/>Сохранение
                  решения…</div>
            ) : decision === null ? (
                showRejectForm ? (
                  <div className="space-y-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Причина отклонения (необязательно)"
                      rows={3}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-200"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => decide(false)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                      >
                        <XCircle size={15}/> Отклонить
                      </button>
                      <button
                        onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                        className="px-5 py-2.5 bg-card text-muted-foreground text-sm font-medium rounded-lg border border-border hover:bg-background transition-colors whitespace-nowrap"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => decide(true)} disabled={!project}
                            className="flex items-center gap-2 px-5 py-2.5 bg-success text-success-foreground text-sm font-medium rounded-lg hover:bg-success/90 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                      <CheckCircle2 size={15}/> Подтверждаю
                    </button>
                    <button onClick={() => decide(false)} disabled={!project}
                            className="flex items-center gap-2 px-5 py-2.5 bg-card text-destructive text-sm font-medium rounded-lg border border-border hover:bg-red-50 dark:bg-red-400/15 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                      <XCircle size={15}/> Отклонить КП
                    </button>
                  </div>
                )
            ) : decision ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-400/15 rounded-lg border border-green-200 dark:border-green-400/25">
                  <CheckCircle2 size={16} className="text-green-600 dark:text-green-400"/><span
                    className="text-sm font-medium text-green-700 dark:text-green-300">КП подтверждено</span></div>
            ) : (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-400/15 rounded-lg border border-red-200 dark:border-red-400/25"><XCircle
                    size={16} className="text-destructive"/><span
                    className="text-sm font-medium text-red-700 dark:text-red-300">КП отклонено</span></div>
            )}
          </div>
        </div>
    </PageWrap>
  );
}

export function ProjectPageAccountant({projectId}: { projectId: number }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      await downloadProjectExcel(projectId);
    } catch (error) {
      console.error("Ошибка при скачивании:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageWrap
      title="Офисный комплекс «Башня»"
      subtitle="ООО «СтройТех» · Счета и оплата"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-card border border-border text-muted-foreground text-xs font-medium rounded hover:bg-background transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
            {isExporting ? "Скачивание..." : "Скачать Excel"}
          </button>
        </div>
      }
    >
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border bg-background/60">
            {["Счёт","Поставщик","Сумма","Статус",""].map(h => <th key={h} className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {INVOICES_INIT.slice(0,3).map(inv => (
              <tr key={inv.id} className="hover:bg-background/50">
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{inv.id}</td>
                <td className="px-4 py-3 text-sm text-foreground">{inv.supplier}</td>
                <td className="px-4 py-3 text-sm font-mono text-foreground">{fmt(inv.amount)}</td>
                <td className="px-4 py-3"><Chip status={inv.status} /></td>
                <td className="px-4 py-3">{inv.status === "approved" && <button className="text-xs px-2.5 py-1 bg-success text-success-foreground rounded font-medium hover:bg-success/90 transition-colors whitespace-nowrap">Оплатить</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

export function ProjectPageWarehouse() {
  return (
    <PageWrap title="Офисный комплекс «Башня»" subtitle="ООО «СтройТех» · Резерв и отгрузка">
      <div className="bg-card rounded-lg border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Резерв под проект</h3>
        <div className="space-y-2">
          {STOCK_INIT.slice(0,4).map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-foreground">{item.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">{item.reserved} {item.unit} зарезервировано</span>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">{item.available} доступно</span>
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"><Truck size={14} /> Оформить отгрузку</button>
      </div>
    </PageWrap>
  );
}
export function ProjectPage({
  role,
  onNavigate,
  projectState,
  onKpSent,
  onKpApproved,
  receipts,
  projectItems,
  projectId,
  onOpenProject,
}: {
  role: Role | string;
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  onKpSent: () => void;
  onKpApproved: () => void;
  receipts: Receipt[];
  projectItems: ProjectItem[];
  projectId: number;
  onOpenProject?: (projectId: number) => Promise<void>;
}) {
  if (role === "pm") {
    return (
      <ProjectPagePM
        onNavigate={onNavigate}
        projectState={projectState}
        onKpSent={onKpSent}
        receipts={receipts}
        projectItems={projectItems}
        projectId={projectId}
      />
    );
  }

  if (role === "commercial_director" || role === "director") {
    return (
      <ProjectPageDirector
        projectState={projectState}
        onKpApproved={onKpApproved}
        projectId={projectId}
      />
    );
  }

  if (role === "accountant") {
    return <ProjectPageAccountant projectId={projectId} />;
  }

  return <ProjectPageWarehouse />;
}