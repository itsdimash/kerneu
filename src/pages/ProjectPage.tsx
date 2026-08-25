import React, { useState, useEffect } from "react";
import type { Role, Page, ProjectState, Receipt } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import { Chip } from "../app/components/common/Chip";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { fmt } from "../lib/format";
import { INVOICES_INIT } from "../data/invoices";
import { STOCK_INIT } from "../data/stock";
import { AlertTriangle, Calculator, CheckCircle2, Loader2, Send, Truck, Check, XCircle, Download, FileText, ChevronDown, Plus, Pencil } from "lucide-react";
import {
  fetchProjectDetails,
  fetchProjectItems,
  getMlImport,
  updateMlImportItem,
  createProductForMlImportItem,
  confirmMlImport,
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
  MlImportItemCreateProduct,
  MlImportItemUpdate,
} from "../api/api";

type MlStatus =
  | "Нет в системе"
  | "Нет в системе (похожие варианты)"
  | "Возможное совпадение (требует проверки)"
  | "Есть в системе (недостаточно)"
  | "На складе";

const ML_STATUS_STYLES: Record<
  MlStatus,
  {
    badge: string;
    row: string;
  }
> = {
  "Нет в системе": {
    badge: "bg-red-100 dark:bg-red-400/20 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-400/30",
    row: "bg-red-50 dark:bg-red-400/15 hover:bg-red-100/60 dark:bg-red-400/30",
  },
  "Нет в системе (похожие варианты)": {
    badge: "bg-orange-100 dark:bg-orange-400/20 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-400/30",
    row: "bg-orange-50 dark:bg-orange-400/15 hover:bg-orange-100/60 dark:bg-orange-400/30",
  },
  "Возможное совпадение (требует проверки)": {
    badge: "bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-400/30",
    row: "bg-amber-50 dark:bg-amber-400/15 hover:bg-amber-100/60 dark:bg-amber-400/30",
  },
  "Есть в системе (недостаточно)": {
    badge: "bg-yellow-100 dark:bg-yellow-400/20 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-400/30",
    row: "bg-yellow-50 dark:bg-yellow-400/15 hover:bg-yellow-100/60 dark:bg-yellow-400/30",
  },
  "На складе": {
    badge: "bg-green-100 dark:bg-green-400/20 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-400/30",
    row: "bg-green-50 dark:bg-green-400/15 hover:bg-green-100/60 dark:bg-green-400/30",
  },
};

const normalizeMlStatus = (
  status: string | null | undefined,
): MlStatus | null => {
  const normalized = status?.trim();

  if (normalized === "Нет в системе") return "Нет в системе";
  if (normalized === "Нет в системе (похожие варианты)") {
    return "Нет в системе (похожие варианты)";
  }
  if (normalized === "Возможное совпадение (требует проверки)") {
    return "Возможное совпадение (требует проверки)";
  }
  if (normalized === "На складе") return "На складе";
  if (normalized === "Есть в системе (недостаточно)") {
    return "Есть в системе (недостаточно)";
  }

  return null;
};

const UNKNOWN_ML_STATUS_STYLE = {
  badge: "bg-muted text-foreground border border-input",
  row: "bg-card hover:bg-background",
};

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

  // После confirm_ml_import черновик ml-импорта больше не отражает
  // реальность — Комдир может поправить поставщика/себестоимость/цену
  // прямо в ProjectItem, а строки ml-импорта останутся со старыми
  // значениями. liveItems — это то же самое, что видит Комдир, читаем
  // напрямую из /project-items, чтобы ПМ видел актуальные цифры.
  const [liveItems, setLiveItems] = useState<ProjectItemResponse[]>([]);
  const [liveItemsLoading, setLiveItemsLoading] = useState(false);
  const [liveItemsError, setLiveItemsError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
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
    supplier_name: "",
    unit: "шт",
    price_cost: "",
    price: "",
  });
  const [productModalError, setProductModalError] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);

  // Каталог товаров нужен для строк ML-импорта со статусом «Нет в
  // системе (похожие варианты)»: ML-варианты в similar_variants приходят
  // из внешнего Excel-файла и НЕ содержат id из нашей таблицы products
  // (иногда там вообще нет структурированных данных, только текст) —
  // поэтому PM должен искать и выбирать реальный товар из каталога, а не
  // из similar_variants напрямую.
  const [productCatalog, setProductCatalog] = useState<
    { id: number; name: string; unit?: string | null; price?: number | string | null }[]
  >([]);
  const [productCatalogLoading, setProductCatalogLoading] = useState(false);
  const [openVariantPickerId, setOpenVariantPickerId] = useState<number | null>(null);

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
        setMlImport(null);
        setMlImportError(error instanceof Error ? error.message : "Не удалось загрузить ML-импорт");
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
      .then((data) => { if (!cancelled) setProductCatalog(data); })
      .catch((error) => { console.error("Не удалось загрузить каталог товаров:", error); })
      .finally(() => { if (!cancelled) setProductCatalogLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const currentStatus = project?.status?.status_name || "Новый";

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

  const STAGES = [
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
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось изменить строку");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const RESOLVABLE_ML_STATUSES = new Set([
    "Нет в системе",
    "Нет в системе (похожие варианты)",
  ]);

  const openProductModal = (item: MlImportItemResponse) => {
    const trimmedStatus = item.ml_status?.trim() ?? "";
    if (!RESOLVABLE_ML_STATUSES.has(trimmedStatus)) {
      setMlImportError(
        `Товар можно добавить только для строк со статусом «Нет в системе» или «Нет в системе (похожие варианты)». Текущий статус: «${trimmedStatus || "не указан"}».`,
      );
      return;
    }

    setProductModalItem(item);
    setProductModalForm({
      product_name: item.input_product,
      supplier_name: item.supplier_name ?? "",
      unit: item.unit?.trim() || "шт",
      price_cost: Number(item.price_cost ?? 0) > 0
        ? String(item.price_cost)
        : "",
      price: Number(item.price ?? 0) > 0 ? String(item.price) : "",
    });
    setProductModalError(null);
  };

  const closeProductModal = () => {
    if (savingProduct) return;
    setProductModalItem(null);
    setProductModalError(null);
  };

  const handleCreateProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mlImport || !productModalItem) return;

    const productName = productModalForm.product_name.trim();
    const supplierName = productModalForm.supplier_name.trim();
    const unit = productModalForm.unit.trim();
    const priceCost = Number(productModalForm.price_cost);
    const price = Number(productModalForm.price);

    if (!productName || !supplierName || !unit) {
      setProductModalError(
        "Заполните название товара, поставщика и единицу измерения.",
      );
      return;
    }

    if (!Number.isFinite(priceCost) || priceCost <= 0) {
      setProductModalError("Себестоимость должна быть больше нуля.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setProductModalError("Цена продажи должна быть больше нуля.");
      return;
    }

    if (price < priceCost) {
      setProductModalError("Цена продажи не может быть ниже себестоимости.");
      return;
    }

    const payload: MlImportItemCreateProduct = {
      product_name: productName,
      supplier_name: supplierName,
      unit,
      price_cost: priceCost,
      price,
    };

    try {
      setSavingProduct(true);
      setProductModalError(null);
      setMlImportError(null);

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
      setProductModalItem(null);
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

  const handleConfirmMlImport = async () => {
    if (!mlImport || mlImport.status !== "draft") return;
    try {
      setConfirmingImport(true);
      setMlImportError(null);
      await confirmMlImport(mlImport.id);

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

      if (updatedProject.status?.status_name !== "В редактировании") {
        throw new Error(
          `Импорт подтверждён, но проект остался в статусе «${
            updatedProject.status?.status_name || "не задан"
          }»`,
        );
      }

      setMlImport(await getMlImport(mlImport.id));
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось подтвердить ML-импорт");
    } finally {
      setConfirmingImport(false);
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

  const canConfirmMlImport =
  mlImport !== null &&
  mlImport.status === "draft" &&
  mlImport.items.length > 0 &&
  mlImport.items.every((item) => {
    const quantity = Number(
      item.final_quantity ?? item.input_quantity ?? 0
    );

    const price = Number(item.price ?? 0);
    const priceCost = Number(item.price_cost ?? 0);
    const normalizedStatus = normalizeMlStatus(item.ml_status);

    const mlStatusReady =
      normalizedStatus !== null &&
      (normalizedStatus === "Нет в системе"
        ? item.selected_product_id !== null
        : normalizedStatus === "Нет в системе (похожие варианты)"
        ? item.selected_product_id !== null
        : true);

    return (
      quantity > 0 &&
      price > 0 &&
      priceCost >= 0 &&
      Boolean(item.supplier_name?.trim()) &&
      mlStatusReady
    );
  });
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
                  {mlImport && !isApproved && !isRejected && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${mlImport.status === "confirmed" ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200"}`}>
                      {mlImport.status === "confirmed" ? "Подтверждено" : "Черновик"}
                    </span>
                  )}

                  {!isPastApprovalWindow && (
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
                </div>
            </div>

            {mlImportError && (
              <div className="flex items-start gap-2.5 mb-3 px-4 py-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg">
                <AlertTriangle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Ошибка ML-импорта</p>
                  <p className="text-xs text-destructive mt-1">{mlImportError}</p>
                </div>
              </div>
            )}

            {mlImportLoading ? (
              <div className="bg-card rounded-lg border border-border p-10 flex flex-col items-center">
                <Loader2 size={26} className="animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Загружаем результаты ML…</p>
              </div>
            ) : !mlImport ? (
              <div className="bg-card rounded-lg border border-border px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">Для этого проекта ML-импорт пока не найден</p>
              </div>
            ) : (
              <>
                {isApproved ? (
                  <div className="bg-card rounded-lg border border-border overflow-x-auto">
                    <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border bg-background/60">
                      Финальные значения по проекту, с учётом правок Комдира (если он их вносил).
                    </div>
                    <table className="w-full min-w-[950px] border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-background/60">
                          {["№", "Наименование", "Поставщик", "Кол-во", "Ед.", "Себестоимость", "Цена", "Сумма", "Маржа", "Статус"].map(h => (
                              <th key={h}
                                  className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {liveItemsLoading ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              <Loader2 size={16} className="inline-block animate-spin text-primary mr-2" />
                              Загружаем позиции проекта…
                            </td>
                          </tr>
                        ) : liveItemsError ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-10 text-center text-sm text-destructive">
                              {liveItemsError}
                            </td>
                          </tr>
                        ) : liveItems.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              В проекте нет позиций
                            </td>
                          </tr>
                        ) : (
                          liveItems.map((item, index) => {
                            const qty = Number(item.required_quantity ?? 0);
                            const price = Number(item.sale_price ?? 0);
                            const priceCost = Number(item.cost_price ?? 0);
                            const total = item.total_sum != null ? Number(item.total_sum) : qty * price;
                            const margin = price > 0 ? ((price - priceCost) / price) * 100 : 0;
                            const isEditedByDirector = Boolean((item as { edited_by_director?: boolean }).edited_by_director);
                            const stockStatusName = item.status?.status_name ?? "—";
                            const isInStock = stockStatusName === "На складе";

                            return (
                                <tr key={item.id} className="hover:bg-background/50">
                                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index + 1}</td>
                                  <td className="px-4 py-3 text-sm text-foreground">{item.product?.name ?? "—"}</td>
                                  <td className="px-4 py-3 text-sm text-foreground">
                                    {item.supplier_raw_name ?? item.supplier?.supplier_name ?? "—"}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-mono">{qty.toLocaleString("ru-RU")}</td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.product?.unit ?? "шт"}</td>
                                  <td className="px-4 py-3 text-sm font-mono">{priceCost.toLocaleString("ru-RU", {minimumFractionDigits: 0, maximumFractionDigits: 2,})}</td>
                                  <td className="px-4 py-3 text-sm font-mono">{price.toLocaleString("ru-RU")}</td>
                                  <td className="px-4 py-3 text-sm font-mono font-semibold">{total.toLocaleString("ru-RU")}</td>
                                  <td className="px-4 py-3">
                                  <span
                                      className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${margin >= 20 ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : margin > 0 ? "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200" : "bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 ring-1 ring-red-200"}`}>
                                    {margin.toFixed(1)}%
                                  </span>
                                  </td>
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
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                <>
                <div className="bg-card rounded-lg border border-border overflow-x-auto">
                  <table className="w-full min-w-[1950px] border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-background/60">
                        {["№", "Исходный товар", "Кол-во", "Статус ML", "Совпавший товар", "Поставщик", "Себестоимость", "Цена", "Сумма", "Маржа", "Доступно", "Комментарий", "Статус"].map((heading) => (
                          <th key={heading} className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mlImport.items.length === 0 ? (
                        <tr><td colSpan={13} className="px-4 py-10 text-center text-sm text-muted-foreground">В ML-импорте нет товаров</td></tr>
                      ) : (
                        mlImport.items.map((item, index) => {
                          const isUpdating = updatingItemId === item.id;
                          const priceCost = Number(item.price_cost ?? 0);
                          const price = Number(item.price ?? 0);
                          const totalAmount = Number(item.total_amount ?? 0);
                          const margin = Number(item.margin ?? 0);
                          const marginPercent = margin * 100;
                          const normalizedStatus = normalizeMlStatus(item.ml_status);
                          const trimmedItemStatus = item.ml_status?.trim() ?? "";
                          const isNotInSystem = trimmedItemStatus === "Нет в системе";
                          const isSimilarVariants =
                            normalizedStatus === "Нет в системе (похожие варианты)";
                          const isPossibleMatch =
                            normalizedStatus === "Возможное совпадение (требует проверки)";
                          const needsProductResolution =
                            !item.is_confirmed &&
                            item.selected_product_id === null &&
                            (isNotInSystem || isSimilarVariants || isPossibleMatch);
                          const displayedStatus =
                            normalizedStatus ??
                            item.ml_status?.trim() ??
                            "Статус не указан";
                          const statusStyle = normalizedStatus
                            ? ML_STATUS_STYLES[normalizedStatus]
                            : UNKNOWN_ML_STATUS_STYLE;

                          return (
                              <tr key={item.id} className={`transition-colors ${statusStyle.row}`}>
                                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index + 1}</td>
                                <td className="px-4 py-3"><p
                                    className="text-sm font-medium text-foreground">{item.input_product}</p></td>
                                <td className="px-4 py-3 text-sm font-mono text-foreground">{item.input_quantity}</td>
                                <td className="px-4 py-3">
                                  <span
                                      className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${statusStyle.badge}`}>
                                    {displayedStatus}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {(isSimilarVariants || isPossibleMatch) && !item.is_confirmed ? (() => {
                                      const similarLabels = getSimilarVariantLabels(item);
                                      const matchedCatalogOptions = productCatalog.filter((p) => {
                                        const catalogName = p.name.trim().toLowerCase();
                                        return similarLabels.some((label) => {
                                          const labelLower = label.toLowerCase();
                                          return catalogName.includes(labelLower) || labelLower.includes(catalogName);
                                        });
                                      });
                                      const isPickerOpen = openVariantPickerId === item.id;
                                      const selectedProductName =
                                        item.selected_product_id != null
                                          ? productCatalog.find((p) => p.id === item.selected_product_id)?.name
                                            ?? item.matched_product
                                            ?? "Товар выбран"
                                          : null;

                                      return (
                                        <div className="relative" data-variant-picker={item.id}>
                                          <button
                                              type="button"
                                              disabled={mlImport.status !== "draft" || isUpdating}
                                              onClick={() =>
                                                setOpenVariantPickerId((current) => (current === item.id ? null : item.id))
                                              }
                                              className={`w-56 flex items-center justify-between gap-2 px-2 py-1.5 text-sm border rounded-md bg-card text-left disabled:bg-muted disabled:cursor-not-allowed ${
                                                item.selected_product_id != null ? "border-border" : "border-orange-300 dark:border-orange-400/30"
                                              }`}
                                          >
                                            <span className={`truncate ${selectedProductName ? "text-foreground" : "text-muted-foreground"}`}>
                                              {selectedProductName ?? (productCatalogLoading ? "Загрузка каталога…" : "Выберите товар")}
                                            </span>
                                            <ChevronDown
                                                size={14}
                                                className={`flex-shrink-0 text-muted-foreground transition-transform ${isPickerOpen ? "rotate-180" : ""}`}
                                            />
                                          </button>

                                          {isPickerOpen && (
                                            <div className="absolute z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg py-1">
                                              {matchedCatalogOptions.length === 0 ? (
                                                <p className="px-3 py-2 text-xs text-muted-foreground">Похожих товаров в каталоге не найдено</p>
                                              ) : (
                                                matchedCatalogOptions.map((product) => (
                                                  <button
                                                      key={product.id}
                                                      type="button"
                                                      onClick={() => {
                                                        handleMlItemUpdate(item.id, { selected_product_id: product.id });
                                                        setOpenVariantPickerId(null);
                                                      }}
                                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-background transition-colors ${
                                                        item.selected_product_id === product.id
                                                          ? "bg-blue-50 dark:bg-blue-400/15 text-primary font-medium"
                                                          : "text-foreground"
                                                      }`}
                                                  >
                                                    {product.name}
                                                  </button>
                                                ))
                                              )}
                                              <div className="border-t border-border mt-1 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                      setOpenVariantPickerId(null);
                                                      openProductModal(item);
                                                    }}
                                                    className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-sm font-medium text-primary hover:bg-accent transition-colors"
                                                >
                                                  <Plus size={14} /> Это новый товар
                                                </button>
                                              </div>
                                            </div>
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
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-supplier-${item.supplier_name ?? ""}`}
                                      type="text"
                                      maxLength={255}
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={item.supplier_name ?? ""}
                                      placeholder="Укажите поставщика"
                                      onBlur={(event) => {
                                        const supplierName = event.target.value.trim() || null;
                                        if (supplierName !== item.supplier_name) {
                                          handleMlItemUpdate(item.id, {supplier_name: supplierName});
                                        }
                                      }}
                                      className={`w-44 px-2 py-1.5 text-sm border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted ${
                                        item.supplier_name?.trim()
                                          ? "border-border"
                                          : "border-red-300 dark:border-red-400/30"
                                      }`}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-cost-${item.price_cost}`}
                                      type="number" min={0} step="1"
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed} defaultValue={priceCost}
                                      onBlur={(event) => {
                                        const newPriceCost = Number(event.target.value);
                                        if (!Number.isFinite(newPriceCost) || newPriceCost < 0) {
                                          setMlImportError("Себестоимость должна быть числом больше или равным нулю");
                                          return;
                                        }
                                        if (newPriceCost !== priceCost) handleMlItemUpdate(item.id, {price_cost: newPriceCost});
                                      }}
                                      className="w-32 px-2 py-1.5 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
                                  />
                                </td>
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
                                      className="w-32 px-2 py-1.5 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
                                  />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap"><span
                                    className="text-sm font-semibold font-mono text-foreground">{formatMoney(totalAmount)}</span>
                                </td>
                                <td className="px-4 py-3">
                                <span
                                    className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${marginPercent >= 20 ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : marginPercent > 0 ? "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200" : marginPercent < 0 ? "bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 ring-1 ring-red-200" : "bg-muted text-muted-foreground ring-1 ring-slate-200"}`}>
                                  {marginPercent.toFixed(1)}%
                                </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-mono text-foreground">{item.available_quantity}</td>
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
                                  ) : needsProductResolution ? (
                                      <button
                                          type="button"
                                          onClick={() => openProductModal(item)}
                                          disabled={mlImport.status !== "draft"}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:bg-slate-200 disabled:text-muted-foreground disabled:cursor-not-allowed"
                                      >
                                        Добавить товар
                                      </button>
                                  ) : normalizedStatus === "На складе" ? (
                                      <span
                                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
      <CheckCircle2 size={14}/>
      На складе
    </span>
                                  ) : Number(item.price ?? 0) > 0 &&
                                  Number(
                                      item.final_quantity ??
                                      item.input_quantity ??
                                      0
                                  ) > 0 ? (
                                      <span
                                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
      <CheckCircle2 size={14}/>
      Будет куплено
    </span>
                                  ) : (
                                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
      Требуется указать цену
    </span>
                                  )}
                                </td>
                              </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-4 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Для строк «Нет в системе» создайте товар через кнопку в строке.
                    Для строк «Нет в системе (похожие варианты)» выберите товар из
                    предложенного списка либо нажмите «Это новый товар», если
                    подходящего нет. У остальных строк должны быть указаны поставщик,
                    цена и количество.
                  </p>
                  <button
                      type="button"
                      onClick={handleConfirmMlImport}
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
                          Импорт подтверждён
                        </>
                    ) : (
                        <>
                          <Check size={15}/>
                          Подтвердить импорт
                        </>
                    )}
                  </button>
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
                    Статус ML-строки не изменится, но после создания товара строка будет готова к подтверждению.
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
                    Поставщик
                  </span>
                  <input
                      type="text"
                      required
                      maxLength={255}
                      value={productModalForm.supplier_name}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        supplier_name: event.target.value,
                      }))}
                      placeholder="Введите имя поставщика"
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-foreground">
                      Себестоимость
                    </span>
                    <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={productModalForm.price_cost}
                        onChange={(event) => setProductModalForm((current) => ({
                          ...current,
                          price_cost: event.target.value,
                        }))}
                        className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
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
                </div>

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
  const currentStatus = project?.status?.status_name || "На согласовании у Комдира";

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

  const handleItemFieldUpdate = async (
    itemId: number,
    payload: Record<string, number | string | null>,
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
      ? `${project.client?.client_name ?? "—"} · Проверка КП`
      : "ООО «СтройТех» · Проверка КП";
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
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse">
              <thead>
              <tr className="border-b border-border bg-background/60">
                {["№", "Наименование", "Поставщик", "Кол-во", "Ед.", "Себестоимость", "Цена", "Сумма", "Маржа", "Статус"].map(h => (
                    <th key={h}
                        className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projectItemsLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <Loader2 size={16} className="inline-block animate-spin text-primary mr-2" />
                      Загружаем позиции проекта…
                    </td>
                  </tr>
                ) : projectItemsError ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-destructive">
                      {projectItemsError}
                    </td>
                  </tr>
                ) : projectItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      В проекте нет позиций
                    </td>
                  </tr>
                ) : (
                  projectItems.map((item, index) => {
                    const qty = Number(item.required_quantity ?? 0);
                    const price = Number(item.sale_price ?? 0);
                    const priceCost = Number(item.cost_price ?? 0);
                    const total = item.total_sum != null ? Number(item.total_sum) : qty * price;
                    const margin = price > 0 ? ((price - priceCost) / price) * 100 : 0;
                    const isEditedByDirector = Boolean((item as { edited_by_director?: boolean }).edited_by_director);
                    const isSaving = updatingItemId === item.id;
                    const disabled = !canEditItems || isSaving;
                    const stockStatusName = item.status?.status_name ?? "—";
                    const isInStock = stockStatusName === "На складе";

                    return (
                        <tr key={item.id} className="hover:bg-background/50">
                          <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.product?.name ?? "—"}</td>
                          <td className="px-4 py-3">
                            <input
                                key={`${item.id}-supplier-${item.supplier_raw_name ?? ""}`}
                                type="text"
                                maxLength={255}
                                disabled={disabled}
                                defaultValue={item.supplier_raw_name ?? item.supplier?.supplier_name ?? ""}
                                placeholder="Укажите поставщика"
                                onBlur={(event) => {
                                  const supplierName = event.target.value.trim() || null;
                                  if (supplierName !== (item.supplier_raw_name ?? null)) {
                                    handleItemFieldUpdate(item.id, { supplier_raw_name: supplierName });
                                  }
                                }}
                                className="w-36 px-2 py-1.5 text-sm border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{qty.toLocaleString("ru-RU")}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{item.product?.unit ?? "шт"}</td>
                          <td className="px-4 py-3">
                            <input
                                key={`${item.id}-cost-${priceCost}`}
                                type="number"
                                min={0}
                                step="1"
                                disabled={disabled}
                                defaultValue={priceCost}
                                onBlur={(event) => {
                                  const newCost = Number(event.target.value);
                                  if (!Number.isFinite(newCost) || newCost < 0) {
                                    setItemSaveError("Себестоимость должна быть числом больше или равным нулю");
                                    return;
                                  }
                                  if (newCost !== priceCost) {
                                    handleItemFieldUpdate(item.id, { cost_price: newCost });
                                  }
                                }}
                                className="w-28 px-2 py-1.5 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-3">
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
                          </td>
                          <td className="px-4 py-3 text-sm font-mono font-semibold whitespace-nowrap">{total.toLocaleString("ru-RU")}</td>
                          <td className="px-4 py-3">
                          <span
                              className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${margin >= 20 ? "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 ring-1 ring-green-200" : margin > 0 ? "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200" : "bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 ring-1 ring-red-200"}`}>
                            {margin.toFixed(1)}%
                          </span>
                          </td>
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
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-card rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Решение по КП</h3>
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
