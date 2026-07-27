import { useMemo, useState } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Tooltip } from "../app/components/common/Tooltip";
import { StatCard } from "../app/components/common/StatCard";
import { Chip } from "../app/components/common/Chip";
import { InvoiceDetailModal } from "../app/components/modals/InvoiceDetailModal";
import { fmt } from "../lib/format";
import { Invoice, INVOICES_INIT } from "../data/invoices";
import type { Role, ProjectState,  BannerVariant } from "../types";
import { getProjectItems } from "../api/api";
import {
  Plus,
  ClipboardList,
  DollarSign,
  Clock,
  XCircle,
  Loader2,
  Check,
  Edit3,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  Search,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";

type ProjectListItem = {
  id: number;
  name?: string | null;
  project_name?: string | null;
  client?: {
    client_name?: string | null;
  } | null;
};

type ProcurementProjectItem = {
  id: number;
  project_id: number;
  product_id?: number | null;
  item_name?: string | null;
  quantity?: number | string | null;
  required_quantity?: number | string | null;
  price?: number | string | null;
  price_cost?: number | string | null;
  cost_price?: number | string | null;
  sale_price?: number | string | null;
  total_sum?: number | string | null;
  unit?: string | null;
  status_id?: number | null;
  status_name?: string | null;
  product?: {
    id?: number;
    name?: string | null;
    unit?: string | null;
    price_cost?: number | string | null;
    cost_price?: number | string | null;
  } | null;
  status?: {
    id?: number;
    status_name?: string | null;
    name?: string | null;
  } | null;
};

const API_BASE_URL = "http://localhost:8000/api/v1";
const PURCHASE_STATUS = "будет куплено";

const normalizeText = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase("ru-RU");

const getProjectName = (project: ProjectListItem) =>
  project.name?.trim() ||
  project.project_name?.trim() ||
  project.client?.client_name?.trim() ||
  `Проект №${project.id}`;

const getItemStatusName = (item: ProcurementProjectItem) =>
  item.status?.status_name ||
  item.status?.name ||
  item.status_name ||
  "";

const getItemName = (item: ProcurementProjectItem) =>
  item.product?.name?.trim() ||
  item.item_name?.trim() ||
  `Товар №${item.product_id ?? item.id}`;

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

// Себестоимость из ML-импорта — основной источник цены закупки.
const getPurchasePrice = (item: ProcurementProjectItem) =>
  toNumber(
    item.price_cost ??
      item.product?.price_cost ??
      item.cost_price ??
      item.product?.cost_price ??
      0,
  );

export function ProcurementPage({ role, projectState }: { role: Role; projectState: ProjectState }) {
  const [invoices, setInvoices] = useState(INVOICES_INIT);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isProjectSearchOpen, setIsProjectSearchOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<ProcurementProjectItem[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const THRESHOLD = 10;
  const actionsLocked = !projectState.contractSigned;

  const purchaseTotal = useMemo(
    () =>
      purchaseItems.reduce((sum, item) => {
        const quantity = toNumber(item.required_quantity ?? item.quantity);
        const price = getPurchasePrice(item);
        return sum + quantity * price;
      }, 0),
    [purchaseItems],
  );

  const closeProjectSearch = () => {
    if (purchaseLoading) return;
    setIsProjectSearchOpen(false);
    setProjectSearch("");
    setPurchaseError(null);
  };

  const loadProjectPurchases = async (project: ProjectListItem) => {
    const items = (await getProjectItems(project.id)) as ProcurementProjectItem[];
    const onlyPurchases = items.filter(
      (item) => normalizeText(getItemStatusName(item)) === PURCHASE_STATUS,
    );

    setSelectedProject(project);
    setPurchaseItems(onlyPurchases);
  };

  const handleFindProjectPurchases = async () => {
    const query = projectSearch.trim();
    if (!query) {
      setPurchaseError("Введите название проекта");
      return;
    }

    try {
      setPurchaseLoading(true);
      setPurchaseError(null);

      const response = await fetch(`${API_BASE_URL}/projects/`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить список проектов");
      }

      const projects: ProjectListItem[] = await response.json();
      const exactMatch = projects.find(
        (project) => normalizeText(getProjectName(project)) === normalizeText(query),
      );

      if (!exactMatch) {
        throw new Error(`Проект с названием «${query}» не найден`);
      }

      await loadProjectPurchases(exactMatch);
      setIsProjectSearchOpen(false);
      setProjectSearch("");
    } catch (error) {
      console.error("Ошибка загрузки закупок проекта:", error);
      setPurchaseError(
        error instanceof Error ? error.message : "Не удалось загрузить закупки",
      );
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRefreshPurchases = async () => {
    if (!selectedProject) return;

    try {
      setPurchaseLoading(true);
      setPurchaseError(null);
      await loadProjectPurchases(selectedProject);
    } catch (error) {
      console.error("Ошибка обновления закупок:", error);
      setPurchaseError(
        error instanceof Error ? error.message : "Не удалось обновить закупки",
      );
    } finally {
      setPurchaseLoading(false);
    }
  };

  const updateStatus = (id: string, status: string) => {
    setLoadingId(id);
    setTimeout(() => {
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
      setLoadingId(null);
    }, 900);
  };

  const procBanner: { variant: BannerVariant; text: string } = actionsLocked
    ? { variant: "neutral", text: "Раздел «Закупки» доступен только для просмотра. Для создания и согласования счетов необходимо подписать договор с клиентом." }
    : { variant: "success", text: "Договор подписан. Вы можете создавать счета и отправлять их на согласование." };

  return (
    <PageWrap title="Закупки" subtitle="Управление счетами и согласование"
      actions={(
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPurchaseError(null);
              setIsProjectSearchOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Search size={14} /> Найти проект
          </button>
          {role === "pm" && (
            <Tooltip text={actionsLocked ? "Доступно после подписания договора" : ""}>
              <button disabled={actionsLocked}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${actionsLocked ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"}`}>
                <Plus size={14} /> Добавить счёт
              </button>
            </Tooltip>
          )}
        </div>
      )}>

      {selectedInvoice && <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}

      <InfoBanner variant={procBanner.variant} text={procBanner.text} />

      {purchaseError && !isProjectSearchOpen && (
        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200 mb-5">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{purchaseError}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E2E8F0] mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] bg-slate-50/60">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Закупка по проекту
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedProject
                ? getProjectName(selectedProject)
                : "Найдите проект по названию, чтобы увидеть товары"}
            </p>
          </div>
          {selectedProject && (
            <button
              onClick={handleRefreshPurchases}
              disabled={purchaseLoading}
              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              title="Обновить закупку"
            >
              <RefreshCw size={15} className={purchaseLoading ? "animate-spin" : ""} />
            </button>
          )}
        </div>

        {purchaseLoading && !selectedProject ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin text-[#2563EB]" />
            Загружаем закупку…
          </div>
        ) : !selectedProject ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShoppingCart size={28} className="text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">Проект пока не выбран</p>
            <p className="text-xs text-slate-400 mt-1">
              Нажмите «Найти проект» и введите его точное название
            </p>
          </div>
        ) : purchaseItems.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-slate-600">
              Нет товаров со статусом «Будет куплено»
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Проверьте статусы позиций проекта и обновите список
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                  {["Товар", "Ед. изм.", "Количество", "Цена закупки", "Сумма", "Статус"].map((header) => (
                    <th key={header} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {purchaseItems.map((item) => {
                  const quantity = toNumber(item.required_quantity ?? item.quantity);
                  const price = getPurchasePrice(item);
                  const total = quantity * price;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">
                        {getItemName(item)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {item.product?.unit || item.unit || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-700">
                        {quantity}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-700">
                        {fmt(price)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-slate-900">
                        {fmt(total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                          Будет куплено
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E2E8F0] bg-slate-50/60">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-700 text-right">
                    Итого:
                  </td>
                  <td className="px-4 py-3 text-sm font-mono font-semibold text-slate-900">
                    {fmt(purchaseTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Всего счетов" value={String(invoices.length)} sub="По проекту" icon={ClipboardList} />
        <StatCard label="Ожидают оплаты" value={fmt(invoices.filter(i => i.status==="approved").reduce((s,i)=>s+i.amount,0))} sub="Одобрены" icon={DollarSign} iconColor="text-green-500" iconBg="bg-green-50" />
        <StatCard label="На согласовании" value={String(invoices.filter(i=>i.status==="pending").length)} sub="Ожидают решения" icon={Clock} iconColor="text-amber-500" iconBg="bg-amber-50" />
        <StatCard label="Отклонено" value={String(invoices.filter(i=>i.status==="rejected").length)} sub="Нужна корректировка" icon={XCircle} iconColor="text-red-500" iconBg="bg-red-50" />
      </div>

      {invoices.some(i => i.deviation > THRESHOLD && i.status === "pending") && (
        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200 mb-5">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Счета с превышением порогового отклонения ({THRESHOLD}%)</p>
            <p className="text-xs text-red-600 mt-0.5">Счета с отклонением свыше {THRESHOLD}% требуют обязательного комментария ПМ и одобрения Комдира.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["№ Счёта","Поставщик","Сумма факт","Сумма план","Откл. %","К оплате до","Статус","Комментарий ПМ","Действие"].map(h => (
              <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {invoices.map(inv => {
              const highDev = inv.deviation > THRESHOLD;
              const comment = comments[inv.id] || "";
              const needsComment = highDev && inv.status === "pending" && !comment;
              const isLoading = loadingId === inv.id;

              return (
                <tr key={inv.id}
                  className={`transition-colors cursor-pointer ${highDev && inv.status === "pending" ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/50"}`}
                  onClick={() => setSelectedInvoice(inv)}>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{inv.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{inv.supplier}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-900">{fmt(inv.amount)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{fmt(inv.planned)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${highDev ? "bg-red-100 text-red-700" : inv.deviation > 5 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>+{inv.deviation}%</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{inv.dueDate}</td>
                  <td className="px-4 py-3"><Chip status={inv.status} /></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {inv.comment ? (
                      <span className="text-xs text-slate-600 italic">{inv.comment}</span>
                    ) : role === "pm" && inv.status === "pending" ? (
                      <input value={comment} onChange={e => setComments(c => ({ ...c, [inv.id]: e.target.value }))}
                        placeholder={highDev ? "Обязателен *" : "Комментарий…"}
                        className={`text-xs px-2 py-1 border rounded w-40 focus:outline-none focus:border-[#2563EB] ${needsComment ? "border-red-300 bg-red-50/30 placeholder-red-400" : "border-[#E2E8F0]"}`} />
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {isLoading ? (
                        <Loader2 size={14} className="animate-spin text-[#2563EB]" />
                      ) : (
                        <>
                          {role === "director" && inv.status === "pending" && (
                            <>
                              <button onClick={() => updateStatus(inv.id, "approved")} className="w-7 h-7 flex items-center justify-center rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors" title="Одобрить"><Check size={12} /></button>
                              <button onClick={() => updateStatus(inv.id, "rejected")} className="w-7 h-7 flex items-center justify-center rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors" title="Отклонить"><X size={12} /></button>
                            </>
                          )}
                          {role === "pm" && inv.status === "pending" && (
                            <>
                              <Tooltip text={actionsLocked ? "Доступно после подписания договора" : needsComment ? "Заполните комментарий ПМ" : ""}>
                                <button disabled={needsComment || actionsLocked}
                                  onClick={() => !needsComment && !actionsLocked && updateStatus(inv.id, "approved")}
                                  className={`text-xs px-2.5 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${(needsComment || actionsLocked) ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"}`}>
                                  Отправить
                                </button>
                              </Tooltip>
                              <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Редактировать"><Edit3 size={12} /></button>
                              <button onClick={() => updateStatus(inv.id, "rejected")} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Отменить"><Trash2 size={12} /></button>
                            </>
                          )}
                          {role === "accountant" && inv.status === "approved" && (
                            <button onClick={() => updateStatus(inv.id, "paid")} className="text-xs px-2.5 py-1.5 bg-[#16A34A] text-white rounded font-medium hover:bg-green-700 transition-colors">Оплатить</button>
                          )}
                          {(role === "warehouse" || (role !== "pm" && role !== "director" && role !== "accountant")) && (
                            <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400"><Eye size={12} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">Нажмите на строку счёта для просмотра деталей</p>

      {isProjectSearchOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeProjectSearch}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] bg-slate-50">
              <h3 className="font-semibold text-slate-800">Найти закупку проекта</h3>
              <button
                onClick={closeProjectSearch}
                disabled={purchaseLoading}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Название проекта
              </label>
              <input
                autoFocus
                value={projectSearch}
                onChange={(event) => {
                  setProjectSearch(event.target.value);
                  setPurchaseError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !purchaseLoading) {
                    void handleFindProjectPurchases();
                  }
                }}
                placeholder="Например: ООО Бекнур"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
              />
              <p className="text-xs text-slate-400 mt-2">
                Поиск выполняется по точному названию без учёта регистра
              </p>

              {purchaseError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {purchaseError}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={closeProjectSearch}
                  disabled={purchaseLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E2E8F0] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={() => void handleFindProjectPurchases()}
                  disabled={purchaseLoading || !projectSearch.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {purchaseLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  Найти
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}