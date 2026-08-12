import { useEffect, useState } from "react";
import type { Page, Role } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  ShoppingCart,
  X,
} from "lucide-react";
import { documentsStore } from "../store/documentsStore";
import {
  fetchProjectDocuments,
  generateContract,
  type ContractGenerateRequest,
} from "../api/api";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/*                                                                      */
/* ContractApiProject mirrors ContractProjectResponse from the backend  */
/* (GET /api/v1/projects/contracts). ContractProject is the shape the   */
/* UI below actually renders.                                           */
/*                                                                      */
/* Upload no longer happens on this page — только бухгалтер генерирует  */
/* договор здесь, проверяет/правит его локально и загружает готовый     */
/* файл на странице "Документы". Здесь остаётся только read-only статус */
/* (загружен / не загружен) для всех ролей, и кнопка "Сгенерировать"    */
/* только для бухгалтера.                                               */
/* ------------------------------------------------------------------ */

interface ApiProductInfo {
  name: string | null;
  unit: string;
}

interface ApiProjectItem {
  id: number;
  required_quantity: number | null;
  sale_price: string | number;
  product: ApiProductInfo;
}

interface ContractApiProject {
  id: number;
  name: string | null;
  client: { client_name: string } | null;
  items: ApiProjectItem[];
}

interface SpecItem {
  no: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
}

interface ContractProject {
  id: string;
  name: string;
  client: string;
  contractUploaded: boolean;
  fileName?: string;
  uploadDate?: string;
  items: SpecItem[];
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const API_BASE = "http://localhost:8000/api/v1";

function mapApiProject(p: ContractApiProject): ContractProject {
  return {
    id: String(p.id),
    name: p.name ?? `Проект #${p.id}`,
    client: p.client?.client_name ?? "—",
    contractUploaded: false,
    items: p.items.map((item, index) => ({
      no: index + 1,
      name: item.product?.name ?? "—",
      qty: item.required_quantity ?? 0,
      unit: item.product?.unit ?? "шт",
      price: Number(item.sale_price ?? 0),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Generate-contract modal (PM, accountant, director)                  */
/* ------------------------------------------------------------------ */

const todayIso = () => new Date().toISOString().slice(0, 10);

type GenerateFormState = {
  contract_number: string;
  contract_date: string;
  contract_valid_until: string;
  buyer_company_name: string;
  buyer_director_name: string;
  buyer_address: string;
  buyer_bin: string;
  buyer_iik: string;
  buyer_bik: string;
  buyer_kbe: string;
  specification_number: string;
  delivery_term_days: string;
  shipment_method: "pickup" | "delivery";
  pickup_address: string;
};

function emptyGenerateForm(clientName: string): GenerateFormState {
  return {
    contract_number: "",
    contract_date: todayIso(),
    contract_valid_until: "",
    buyer_company_name: clientName !== "—" ? clientName : "",
    buyer_director_name: "",
    buyer_address: "",
    buyer_bin: "",
    buyer_iik: "",
    buyer_bik: "",
    buyer_kbe: "17",
    specification_number: "",
    delivery_term_days: "30",
    shipment_method: "pickup",
    pickup_address: "",
  };
}

/* ------------------------------------------------------------------ */
/* Full-page validation/error overlay — sits above everything (including */
/* the generate modal itself), blurring the whole page behind it, rather */
/* than a small inline banner easy to miss inside a long form.          */
/* ------------------------------------------------------------------ */

function ErrorOverlay({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm px-4"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-card shadow-xl px-6 py-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-400/15">
          <AlertCircle size={24} className="text-destructive" />
        </div>
        <p className="text-sm font-medium leading-snug text-foreground">{message}</p>
        <button
          onClick={onDismiss}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function GenerateContractModal({
  project,
  onClose,
}: {
  project: ContractProject;
  onClose: () => void;
}) {
  const [form, setForm] = useState<GenerateFormState>(() => emptyGenerateForm(project.client));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof GenerateFormState>(key: K, value: GenerateFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Кнопка вне <form> с type="button" — нативная HTML-валидация required
    // не срабатывает, так что проверяем сами, до похода на бэкенд.
    const requiredFields: { key: keyof GenerateFormState; label: string }[] = [
      { key: "contract_number", label: "Номер договора" },
      { key: "buyer_company_name", label: "Название компании" },
      { key: "buyer_director_name", label: "ФИО директора" },
      { key: "buyer_address", label: "Адрес" },
      { key: "buyer_bin", label: "БИН" },
      { key: "buyer_iik", label: "ИИК" },
      { key: "buyer_bik", label: "БИК" },
    ];
    const missing = requiredFields.filter((f) => !form[f.key].trim());

    if (missing.length > 0) {
      setError(
        `Заполните все обязательные поля: ${missing.map((f) => f.label).join(", ")}`,
      );
      return;
    }

    if (!/^\d{12}$/.test(form.buyer_bin)) {
      setError("БИН должен состоять ровно из 12 цифр");
      return;
    }

    setSubmitting(true);
    try {
      const payload: ContractGenerateRequest = {
        project_id: Number(project.id),
        contract_number: form.contract_number.trim(),
        contract_date: form.contract_date || undefined,
        contract_valid_until: form.contract_valid_until || undefined,
        buyer_company_name: form.buyer_company_name.trim(),
        buyer_director_name: form.buyer_director_name.trim(),
        buyer_address: form.buyer_address.trim(),
        buyer_bin: form.buyer_bin.trim(),
        buyer_iik: form.buyer_iik.trim(),
        buyer_bik: form.buyer_bik.trim(),
        buyer_kbe: form.buyer_kbe.trim() || undefined,
        specification_number: form.specification_number.trim() || undefined,
        delivery_term_days: form.delivery_term_days ? Number(form.delivery_term_days) : undefined,
        shipment_method: form.shipment_method,
        pickup_address: form.shipment_method === "pickup" ? (form.pickup_address.trim() || undefined) : undefined,
      };

      await generateContract(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сгенерировать договор");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-primary/50";
  const labelCls = "text-xs font-medium text-muted-foreground mb-1 block";

  return (
    <>
      {error && <ErrorOverlay message={error} onDismiss={() => setError(null)} />}

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-8 overflow-y-auto"
        onClick={() => !submitting && onClose()}
      >
        <div
          className="w-full max-w-2xl rounded-xl bg-card shadow-xl my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h3 className="text-base font-semibold text-foreground">Сгенерировать договор</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{project.name} · {project.client}</p>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="text-muted-foreground hover:text-muted-foreground p-1"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Договор</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Номер договора *</label>

                <input
                  required
                  value={form.contract_number}
                  onChange={(e) => set("contract_number", e.target.value)}
                  placeholder="015"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Дата подписания</label>
                <input
                  type="date"
                  value={form.contract_date}
                  onChange={(e) => set("contract_date", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Действует до</label>
                <input
                  type="date"
                  value={form.contract_valid_until}
                  onChange={(e) => set("contract_valid_until", e.target.value)}
                  className={inputCls}
                  placeholder="31.12 текущего года"
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Реквизиты покупателя
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Название компании *</label>
                <input
                  required
                  value={form.buyer_company_name}
                  onChange={(e) => set("buyer_company_name", e.target.value)}
                  placeholder='ТОО "Компания"'
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>ФИО директора *</label>
                <input
                  required
                  value={form.buyer_director_name}
                  onChange={(e) => set("buyer_director_name", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Адрес *</label>
                <input
                  required
                  value={form.buyer_address}
                  onChange={(e) => set("buyer_address", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>БИН (12 цифр) *</label>
                <input
                  required
                  value={form.buyer_bin}
                  onChange={(e) => set("buyer_bin", e.target.value.replace(/\D/g, "").slice(0, 12))}
                  inputMode="numeric"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Кбе</label>
                <input
                  value={form.buyer_kbe}
                  onChange={(e) => set("buyer_kbe", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ИИК *</label>
                <input
                  required
                  value={form.buyer_iik}
                  onChange={(e) => set("buyer_iik", e.target.value)}
                  placeholder="KZ..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>БИК *</label>
                <input
                  required
                  value={form.buyer_bik}
                  onChange={(e) => set("buyer_bik", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Условия поставки
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Срок поставки, дней</label>
                <input
                  type="number"
                  min={1}
                  value={form.delivery_term_days}
                  onChange={(e) => set("delivery_term_days", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Номер спецификации</label>
                <input
                  value={form.specification_number}
                  onChange={(e) => set("specification_number", e.target.value)}
                  placeholder="= номер договора"
                  className={inputCls}
                />
              </div>

              <div className="col-span-2">
                <label className={labelCls}>Место отгрузки</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => set("shipment_method", "pickup")}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      form.shipment_method === "pickup"
                        ? "bg-primary border-primary text-white"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    Самовывоз
                  </button>
                  <button
                    type="button"
                    onClick={() => set("shipment_method", "delivery")}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      form.shipment_method === "delivery"
                        ? "bg-primary border-primary text-white"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    Доставка Поставщиком
                  </button>
                </div>

                {form.shipment_method === "pickup" ? (
                  <input
                    value={form.pickup_address}
                    onChange={(e) => set("pickup_address", e.target.value)}
                    placeholder="Адрес склада самовывоза — по умолчанию склад Kerneu Group в Алматы"
                    className={inputCls}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground px-1">
                    Ничего вводить не нужно — в договоре укажется стандартная формулировка без адреса.
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Спецификация подтянется автоматически из позиций проекта.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {submitting ? "Генерация…" : "Сгенерировать и скачать"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export function ContractPage({
  onNavigate,
  role,
}: {
  onNavigate: (p: Page) => void;
  role: Role;
}) {
  const [projects, setProjects] = useState<ContractProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateForProject, setGenerateForProject] = useState<ContractProject | null>(null);

  const canGenerateContract =
    role === "accountant" ||
    role === "pm" ||
    role === "director" ||
    role === "commercial_director";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const res = await fetch(`${API_BASE}/projects/contracts`, { credentials: "include" });
        if (!res.ok) throw new Error("Не удалось загрузить проекты");

        const data: ContractApiProject[] = await res.json();

        // Check the backend for existing documents for each project
        const projectsWithDocs = await Promise.all(
          data.map(async (apiProject) => {
            const project = mapApiProject(apiProject);

            try {
              // Fetch real documents from the server to check if a contract exists
              const docs = await fetchProjectDocuments(project.id);
              const contractDoc = docs.find((d) => d.category === "contract");

              if (contractDoc) {
                // If it exists on the server, set it as uploaded!
                project.contractUploaded = true;
                project.fileName = contractDoc.file_name;
                project.uploadDate = new Date(contractDoc.created_at).toLocaleDateString("ru-RU");

                // Keep the global Documents store in sync just in case
                documentsStore.updateDocument(project.id, `${project.id}-contract`, {
                  status: "uploaded",
                  date: project.uploadDate,
                  fileName: project.fileName,
                  backendDocument: contractDoc,
                });
              }
            } catch (err) {
              console.error(`Ошибка загрузки документов для проекта ${project.id}`, err);
            }

            return project;
          })
        );

        if (!cancelled) setProjects(projectsWithDocs);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Не удалось загрузить проекты");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageWrap title="Договор" subtitle="Все проекты">
      {loading && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-400/15 border border-blue-200 dark:border-blue-400/25 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <Loader2 size={14} className="animate-spin" />
          Загружаем проекты…
        </div>
      )}

      {!loading && loadError && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg text-sm text-red-700 dark:text-red-300">
          {loadError}
        </div>
      )}

      {!loading && !loadError && projects.length === 0 && (
        <div className="px-4 py-3 bg-background border border-border rounded-lg text-sm text-muted-foreground">
          Нет проектов в статусе от «Ожидание подписания» до «Завершен».
        </div>
      )}

      <div className="space-y-3">
        {!loading && !loadError && projects.map((project) => {
          const isOpen = expandedId === project.id;
          const total = project.items.reduce((sum, it) => sum + it.qty * it.price, 0);

          return (
            <div
              key={project.id}
              className={`bg-card rounded-lg border transition-colors overflow-hidden ${isOpen ? "border-primary/40" : "border-border"}`}
            >
              {/* Header — click to expand/collapse the spec table */}
              <button
                onClick={() => setExpandedId(isOpen ? null : project.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-background/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${project.contractUploaded ? "bg-green-50 dark:bg-green-400/15" : "bg-blue-50 dark:bg-blue-400/15"}`}>
                    <Building2 size={16} className={project.contractUploaded ? "text-green-600 dark:text-green-400" : "text-primary"} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{project.client}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {project.contractUploaded ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-400/20 rounded-full">
                      <CheckCircle2 size={13} className="text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-700 dark:text-green-300">Договор загружен</span>
                    </span>
                  ) : canGenerateContract ? (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setGenerateForProject(project);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white cursor-pointer transition-all"
                    >
                      <FileText size={13} />
                      Сгенерировать договор
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full">
                      <span className="text-xs font-medium text-muted-foreground">Договор не загружен</span>
                    </span>
                  )}

                  {project.contractUploaded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate("procurement");
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-card text-foreground border border-border hover:bg-background transition-colors"
                    >
                      <ShoppingCart size={13} className="text-muted-foreground" />
                      Посмотреть закупки
                    </button>
                  )}

                  <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Uploaded-file strip */}
              {project.contractUploaded && (
                <div className="flex items-center justify-between px-5 py-2 bg-success-muted border-t border-success/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={13} className="text-success flex-shrink-0" />
                    <span className="text-xs text-success truncate">{project.fileName}</span>
                    <span className="text-xs text-success/70 flex-shrink-0">· {project.uploadDate}</span>
                  </div>
                </div>
              )}

              {/* Expandable spec table */}
              {isOpen && (
                <div className="border-t border-border overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-background">
                        <th className="w-12 px-3 py-2.5 text-left font-semibold text-muted-foreground border-b border-r border-border">№</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground border-b border-r border-border">Наименование</th>
                        <th className="w-24 px-3 py-2.5 text-right font-semibold text-muted-foreground border-b border-r border-border">Кол-во</th>
                        <th className="w-16 px-3 py-2.5 text-left font-semibold text-muted-foreground border-b border-r border-border">Ед.</th>
                        <th className="w-28 px-3 py-2.5 text-right font-semibold text-muted-foreground border-b border-r border-border">Цена</th>
                        <th className="w-32 px-3 py-2.5 text-right font-semibold text-muted-foreground border-b border-border">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.items.map((item) => (
                        <tr key={item.no} className="hover:bg-background/50">
                          <td className="px-3 py-2.5 text-muted-foreground border-b border-r border-border align-top">{item.no}</td>
                          <td className="px-3 py-2.5 text-foreground border-b border-r border-border align-top">{item.name}</td>
                          <td className="px-3 py-2.5 text-right text-foreground border-b border-r border-border align-top">{fmt(item.qty)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground border-b border-r border-border align-top">{item.unit}</td>
                          <td className="px-3 py-2.5 text-right text-foreground border-b border-r border-border align-top">{fmt(item.price)}</td>
                          <td className="px-3 py-2.5 text-right text-foreground border-b border-border align-top">{fmt(item.qty * item.price)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-right font-semibold text-foreground border-t-2 border-border">Итого:</td>
                        <td className="px-3 py-3 text-right font-semibold text-foreground border-t-2 border-border">{fmt(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {generateForProject && (
        <GenerateContractModal
          project={generateForProject}
          onClose={() => setGenerateForProject(null)}
        />
      )}
    </PageWrap>
  );
}
