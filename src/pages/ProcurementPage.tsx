import { useMemo, useState, useEffect, useRef } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { fmt } from "../lib/format";
import type { Role, ProjectState } from "../types";
import { 
  getProjectItems, 
  uploadProjectDocument, 
  fetchProjectDocuments,
  fetchWarehouseList,
  WarehouseInfo
} from "../api/api";
import {
  Loader2,
  Download,
  UploadCloud,
  RefreshCw,
  ChevronDown,
  FileText,
  Send,
  Check,
  PackageCheck,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Building2,
  X
} from "lucide-react";

type ProjectListItem = {
  id: number;
  name?: string | null;
  project_name?: string | null;
  status?: { status_name?: string } | null;
  status_name?: string | null;
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
  
  // Обновленные поля для поставщика согласно новой схеме БД
  supplier_id?: number | null;
  supplier_raw_name?: string | null;
  supplier?: {
    id?: number;
    name?: string | null;
  } | string | null; 

  product?: {
    id?: number;
    name?: string | null;
    unit?: string | null;
    price_cost?: number | string | null;
    cost_price?: number | string | null;
    supplier_raw_name?: string | null;
    supplier?: any;
  } | null;
  status?: {
    id?: number;
    status_name?: string | null;
    name?: string | null;
  } | null;
};

type InvoiceWorkflowStatus =
  | 'draft'
  | 'pending_accountant'
  | 'pending_director'
  | 'rejected_by_accountant'
  | 'rejected_by_director'
  | 'approved'
  | 'income';

type SupplierWorkflowState = {
  file: File | null;
  fileName?: string;
  downloadUrl?: string;
  docId?: number;
  isUploading?: boolean;
  status: InvoiceWorkflowStatus;
  directorApproved: boolean;
  accountantApproved: boolean;
  rejectionReason?: string | null;
  rejectFormOpen?: boolean;
  rejectDraftReason?: string;
  actionLoading?: boolean;
};

type ProcurementDocumentDto = {
  id: number;
  category?: string | null;
  name?: string | null;
  file_name?: string | null;
  download_url?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  accountant_approved_by?: number | null;
  director_approved_by?: number | null;
};

const normalizeInvoiceStatus = (raw: unknown): InvoiceWorkflowStatus => {
  const value = String(raw ?? "").trim();
  if (
    value === 'pending_accountant' ||
    value === 'pending_director' ||
    value === 'rejected_by_accountant' ||
    value === 'rejected_by_director' ||
    value === 'approved' ||
    value === 'income'
  ) {
    return value;
  }
  return 'draft';
};

const isAwaitingSend = (st: InvoiceWorkflowStatus) =>
  st === 'draft' || st === 'rejected_by_accountant' || st === 'rejected_by_director';

const API_BASE_URL = "http://localhost:8000/api/v1";
const PURCHASE_STATUS = "будет куплено";

async function postInvoiceAction(documentId: number, action: string, body?: unknown) {
  const response = await fetch(`${API_BASE_URL}/procurement-invoices/${documentId}/${action}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Не удалось выполнить действие");
  }

  return response.json();
}

const sendInvoiceToCheck = (documentId: number) => postInvoiceAction(documentId, "send-to-check");
const directorApproveInvoice = (documentId: number) => postInvoiceAction(documentId, "director-approve");
const directorRejectInvoice = (documentId: number, reason: string) =>
  postInvoiceAction(documentId, "director-reject", { reason });

const sendInvoiceToIncomeApi = (documentId: number, warehouseId: number, items: Array<{ product_id: number; quantity: number; purchase_price: number }>) =>
  postInvoiceAction(documentId, "send-to-income", { warehouse_id: warehouseId, items });

// TODO(backend): эндпоинт ещё не реализован — предполагаемый контракт:
// POST /projects/{project_id}/send-to-receiving
// Должен перевести Project.status_id проекта в статус "На приходе"
// (id=10 в project_statuses) и вернуть обновлённый проект (как минимум
// { status: { status_name: "На приходе" } }), чтобы фронт мог
// синхронизировать локальный state с реальным статусом из БД, а не
// полагаться только на оптимистичное обновление ниже.
async function sendProjectToReceiving(projectId: number) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/send-to-receiving`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Не удалось отправить проект на приход");
  }

  return response.json().catch(() => null);
}

const PROJECT_WORKFLOW = [
  "Новый проект",
  "В редактировании",
  "На согласовании",
  "Ожидание клиента",
  "Ожидание подписания",
  "Активный закуп",
  "На приходе",
  "На отгрузке",
  "Ожидание документов",
  "Завершен"
];

const normalizeText = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("ru-RU");

const safeTrim = (val: unknown): string => {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val).trim();
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const inner = obj.name || obj.supplier_name || obj.client_name || obj.status_name || "";
    return typeof inner === "string" ? inner.trim() : "";
  }
  return "";
};

const getProjectName = (project: any) =>
  safeTrim(project.name) || safeTrim(project.project_name) || safeTrim(project.client?.client_name) || `Проект №${project.id}`;

const getItemStatusName = (item: any) =>
  safeTrim(item.status?.status_name) || safeTrim(item.status?.name) || safeTrim(item.status_name) || "";

const getItemName = (item: any) =>
  safeTrim(item.product?.name) || safeTrim(item.item_name) || `Товар №${item.product_id ?? item.id}`;

// ОБНОВЛЕНО: Используем правильную иерархию полей для получения имени поставщика
const getSupplierName = (item: any) => {
  // 1. Приоритет отдаем supplier_raw_name (историческое имя)
  if (item.supplier_raw_name) {
    return safeTrim(item.supplier_raw_name);
  }

  // 2. Если supplier вернулся как объект связи (relationship)
  if (item.supplier && typeof item.supplier === 'object' && item.supplier.name) {
    return safeTrim(item.supplier.name);
  }

  // 3. Fallbacks для старой структуры или данных из продукта
  const fallback = safeTrim(item.supplier) || safeTrim(item.product?.supplier_raw_name) || safeTrim(item.product?.supplier);
  return fallback || "Основной поставщик";
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPurchasePrice = (item: ProcurementProjectItem) =>
  toNumber(item.price_cost ?? item.product?.price_cost ?? item.cost_price ?? item.product?.cost_price ?? 0);

const getSalePrice = (item: ProcurementProjectItem) =>
  toNumber(item.sale_price ?? item.price ?? 0);

export function ProcurementPage({
  role,
  projectState,
  initialProjectId,
}: {
  role: Role | string;
  projectState: ProjectState;
  /** When set, auto-selects this project once the dropdown's project list
   *  has loaded — used so an invoice notification's "Открыть закупки" CTA
   *  lands directly on the right project, not an empty selector. */
  initialProjectId?: number | string | null;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);

  const [purchaseItems, setPurchaseItems] = useState<ProcurementProjectItem[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});
  const [supplierWorkflows, setSupplierWorkflows] = useState<Record<string, SupplierWorkflowState>>({});

  // Модалка выбора склада для отправки на приход
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number>(1);
  const [isSendingToIncome, setIsSendingToIncome] = useState(false);

  const isDirector = role === "director" || role === "commercial_director";
  const isAccountant = role === "accountant";
  const isPm = role === "pm";

  useEffect(() => {
    let cancelled = false;
    const fetchProjects = async () => {
      try {
        setProjectsLoading(true);
        const response = await fetch(`${API_BASE_URL}/projects/`, { credentials: "include" });
        if (!response.ok) throw new Error("Ошибка загрузки");

        const data: ProjectListItem[] = await response.json();
        const activeIndex = PROJECT_WORKFLOW.indexOf("Активный закуп");
        const completedIndex = PROJECT_WORKFLOW.indexOf("На отгрузке");

        const filtered = data.filter(p => {
           const statusName = safeTrim(p.status?.status_name) || safeTrim(p.status_name) || "Новый проект";
           const idx = PROJECT_WORKFLOW.indexOf(statusName);
           // Верхняя граница: как только проект переходит в "На отгрузке",
           // он больше не должен висеть в закупках (симметрично тому,
           // как это уже работает на странице "Договор").
           return idx >= activeIndex && idx < completedIndex;
        });

        if (!cancelled) setProjects(filtered);
      } catch(e) {
        console.error("Ошибка при загрузке проектов:", e);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    fetchProjects();
    fetchWarehouseList().then(whs => {
      if (whs && whs.length > 0) {
        setWarehouses(whs);
        setSelectedWarehouseId(whs[0].id);
      }

    }).catch(e => console.error("Ошибка загрузки складов:", e));

    return () => { cancelled = true; };
  }, []);

  const loadProjectPurchases = async (project: ProjectListItem) => {
    try {
      setPurchaseLoading(true);
      setPurchaseError(null);

      const [items, docs] = await Promise.all([
        getProjectItems(project.id) as Promise<ProcurementProjectItem[]>,
        fetchProjectDocuments(project.id) as Promise<ProcurementDocumentDto[]>
      ]);

      const onlyPurchases = items.filter(
        (item) => normalizeText(getItemStatusName(item)) === PURCHASE_STATUS
      );

      setSelectedProject(project);
      setPurchaseItems(onlyPurchases);

      const grouped = groupBySupplier(onlyPurchases);
      const expanded: Record<string, boolean> = {};
      const workflows: Record<string, SupplierWorkflowState> = {};

      Object.keys(grouped).forEach(supplier => {
        expanded[supplier] = true;

        const existingDoc = docs.find(d => d.category === "invoice" && safeTrim(d.name) === supplier);

        if (existingDoc) {
          const docStatus = normalizeInvoiceStatus(existingDoc.status);
          workflows[supplier] = {
            file: null,
            fileName: existingDoc.file_name || undefined,
            downloadUrl: existingDoc.download_url || undefined,
            docId: existingDoc.id,
            status: docStatus,
            accountantApproved: docStatus === 'pending_director' || docStatus === 'approved' || docStatus === 'income',
            directorApproved: docStatus === 'approved' || docStatus === 'income',
            rejectionReason: existingDoc.rejection_reason ?? null,
          };
        } else {
          workflows[supplier] = {
            file: null, status: 'draft', directorApproved: false, accountantApproved: false
          };
        }
      });

      setExpandedSuppliers(expanded);
      setSupplierWorkflows(workflows);

    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Не удалось загрузить закупки");
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleProjectSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    setSelectedProjectId(pId);
    const p = projects.find(x => String(x.id) === pId);
    if (p) {
      loadProjectPurchases(p);
    } else {
      setSelectedProject(null);
      setPurchaseItems([]);
    }
  };

  // NEW: применяем initialProjectId, как только список проектов загрузится.
  // Ref нужен, чтобы не выбирать проект повторно на каждый ререндер, но
  // при этом среагировать, если пришло уведомление на ДРУГОЙ проект.
  const appliedInitialProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (!initialProjectId) return;
    const idStr = String(initialProjectId);
    if (appliedInitialProjectId.current === idStr) return;
    if (projects.length === 0) return; // ждём загрузки списка

    const match = projects.find((p) => String(p.id) === idStr);
    if (match) {
      appliedInitialProjectId.current = idStr;
      setSelectedProjectId(idStr);
      loadProjectPurchases(match);
    }
  }, [initialProjectId, projects]);

  const groupBySupplier = (items: ProcurementProjectItem[]) => {
    const groups: Record<string, ProcurementProjectItem[]> = {};
    items.forEach(item => {
      const sup = getSupplierName(item);
      if (!groups[sup]) groups[sup] = [];
      groups[sup].push(item);
    });
    return groups;
  };

  const groupedItems = useMemo(() => groupBySupplier(purchaseItems), [purchaseItems]);
  const supplierKeys = Object.keys(groupedItems);

  const toggleSupplier = (sup: string) => {
    setExpandedSuppliers(p => ({ ...p, [sup]: !p[sup] }));
  };

  const handleFileUpload = async (supplier: string, file: File) => {
    if (!selectedProjectId) return;

    setSupplierWorkflows(prev => ({
      ...prev,
      [supplier]: { ...prev[supplier], isUploading: true }
    }));

    try {
      const uploadedDoc = await uploadProjectDocument(
        selectedProjectId,
        "invoice",
        file,
        supplier
      );

      const uploadedStatus = (uploadedDoc as { status?: string | null }).status;

      setSupplierWorkflows(prev => {
        const curr = prev[supplier];
        return {
          ...prev,
          [supplier]: {
            ...curr,
            file,
            fileName: uploadedDoc.file_name,
            downloadUrl: uploadedDoc.download_url,
            docId: uploadedDoc.id,
            isUploading: false,
            status: uploadedStatus ? normalizeInvoiceStatus(uploadedStatus) : curr.status,
            directorApproved: false,
            accountantApproved: false,
          }
        };
      });
    } catch (error) {
      console.error("Upload failed", error);
      alert("Не удалось загрузить файл.");
      setSupplierWorkflows(prev => ({
        ...prev,
        [supplier]: { ...prev[supplier], isUploading: false }
      }));
    }
  };

  const downloadFile = (wfState: SupplierWorkflowState) => {
    if (wfState.downloadUrl) {
      const fullUrl = wfState.downloadUrl.startsWith("http")
        ? wfState.downloadUrl
        : `http://localhost:8000${wfState.downloadUrl}`;

      window.open(fullUrl, '_blank');
      return;
    }

    if (wfState.file) {
      const url = URL.createObjectURL(wfState.file);
      const a = document.createElement("a");
      a.href = url;
      a.download = wfState.file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const updateSupplierWorkflow = (supplier: string, changes: Partial<SupplierWorkflowState>) => {
    setSupplierWorkflows(prev => {
      const curr = prev[supplier] || { file: null, status: 'draft', directorApproved: false, accountantApproved: false };
      return { ...prev, [supplier]: { ...curr, ...changes } };
    });
  };

  const openRejectForm = (supplier: string) => updateSupplierWorkflow(supplier, { rejectFormOpen: true, rejectDraftReason: "" });
  const closeRejectForm = (supplier: string) => updateSupplierWorkflow(supplier, { rejectFormOpen: false, rejectDraftReason: "" });
  const setRejectDraftReason = (supplier: string, value: string) => updateSupplierWorkflow(supplier, { rejectDraftReason: value });

  const handleDirectorApprove = async (supplier: string) => {
    const docId = supplierWorkflows[supplier]?.docId;
    if (!docId) return;
    updateSupplierWorkflow(supplier, { actionLoading: true });
    try {
      await directorApproveInvoice(docId);
      updateSupplierWorkflow(supplier, { status: 'approved', directorApproved: true, actionLoading: false });
    } catch (error) {
      console.error("Director approve failed", error);
      alert("Не удалось подтвердить счёт.");
      updateSupplierWorkflow(supplier, { actionLoading: false });
    }
  };

  const handleDirectorReject = async (supplier: string) => {
    const wf = supplierWorkflows[supplier];
    const reason = wf?.rejectDraftReason?.trim();
    if (!wf?.docId || !reason) return;
    updateSupplierWorkflow(supplier, { actionLoading: true });
    try {
      await directorRejectInvoice(wf.docId, reason);
      updateSupplierWorkflow(supplier, {
        status: 'rejected_by_director',
        accountantApproved: false,
        directorApproved: false,
        rejectionReason: reason,
        rejectFormOpen: false,
        rejectDraftReason: "",
        actionLoading: false,
      });
    } catch (error) {
      console.error("Director reject failed", error);
      alert("Не удалось отклонить счёт.");
      updateSupplierWorkflow(supplier, { actionLoading: false });
    }
  };

  const pendingSendSuppliers = useMemo(() => {
    return supplierKeys.filter(sup => isAwaitingSend(supplierWorkflows[sup]?.status ?? 'draft'));
  }, [supplierKeys, supplierWorkflows]);

  const pendingSendSuppliersWithFile = useMemo(() => {
    return pendingSendSuppliers.filter(sup => !!(supplierWorkflows[sup]?.file || supplierWorkflows[sup]?.fileName));
  }, [pendingSendSuppliers, supplierWorkflows]);

  const hasPendingSendSuppliers = pendingSendSuppliers.length > 0;
  const allPendingSendFilesUploaded = pendingSendSuppliers.length > 0 && pendingSendSuppliers.length === pendingSendSuppliersWithFile.length;

  const hasRejectedPendingSuppliers = useMemo(() => {
    return pendingSendSuppliers.some(sup => {
      const st = supplierWorkflows[sup]?.status;
      return st === 'rejected_by_accountant' || st === 'rejected_by_director';
    });
  }, [pendingSendSuppliers, supplierWorkflows]);

  const allSuppliersApproved = useMemo(() => {
    if (supplierKeys.length === 0) return false;
    return supplierKeys.every(sup => {
      const st = supplierWorkflows[sup]?.status;
      return st === 'approved' || st === 'income';
    });
  }, [supplierKeys, supplierWorkflows]);

  const canGlobalSendToIncome = allSuppliersApproved;

  const allSuppliersIncomed = useMemo(() => {
    if (supplierKeys.length === 0) return false;
    return supplierKeys.every(sup => supplierWorkflows[sup]?.status === 'income');
  }, [supplierKeys, supplierWorkflows]);

  const [isSendingToCheck, setIsSendingToCheck] = useState(false);

  const handleGlobalSendToCheck = async () => {
    const targets = pendingSendSuppliersWithFile;
    if (targets.length === 0) return;

    setIsSendingToCheck(true);
    try {
      await Promise.all(
        targets.map(sup => {
          const docId = supplierWorkflows[sup]?.docId;
          return docId ? sendInvoiceToCheck(docId) : Promise.resolve();
        })
      );
      setSupplierWorkflows(prev => {
        const next = { ...prev };
        targets.forEach(sup => {
          if (next[sup]) {
            next[sup] = {
              ...next[sup],
              status: 'pending_accountant',
              rejectionReason: null,
            };
          }
        });
        return next;
      });
    } catch (error) {
      console.error("Send to check failed", error);
      alert("Не удалось отправить счета на проверку.");
    } finally {
      setIsSendingToCheck(false);
    }
  };

  const handleOpenSendToIncomeModal = () => {
    if (!canGlobalSendToIncome) return;
    setIsIncomeModalOpen(true);
  };

  const handleConfirmGlobalSendToIncome = async () => {
    if (!selectedWarehouseId) return;

    const approvedSuppliers = supplierKeys.filter(
      sup => supplierWorkflows[sup]?.status === 'approved'
    );
    if (approvedSuppliers.length === 0) {
      setIsIncomeModalOpen(false);
      return;
    }

    setIsSendingToIncome(true);
    try {
      await Promise.all(
        approvedSuppliers.map(sup => {
          const docId = supplierWorkflows[sup]?.docId;
          if (!docId) return Promise.resolve();

          const items = (groupedItems[sup] || []).map(item => ({
            product_id: Number(item.product_id ?? item.product?.id ?? item.id),
            quantity: toNumber(item.required_quantity ?? item.quantity),
            purchase_price: getPurchasePrice(item),
          }));

          const itemWithoutPurchasePrice = items.find(
            item => item.purchase_price <= 0
          );
          if (itemWithoutPurchasePrice) {
            throw new Error(
              `Не указана себестоимость товара №${itemWithoutPurchasePrice.product_id}`
            );
          }

          return sendInvoiceToIncomeApi(docId, selectedWarehouseId, items);
        })
      );

      // Переводит проект в статус "На приходе" на бэкенде — как только
      // друг реализует /send-to-receiving, ProjectPage сразу подхватит
      // новый статус: "Активный закуп" станет done, "На приходе" — active.
      if (selectedProject) {
        try {
          await sendProjectToReceiving(selectedProject.id);
          const nextStatus = { status_name: "На приходе" };
          setSelectedProject(prev => (prev ? { ...prev, status: nextStatus } : prev));
          setProjects(prev =>
            prev.map(p => (p.id === selectedProject.id ? { ...p, status: nextStatus } : p))
          );
        } catch (error) {
          console.error("Send to receiving failed", error);
          // Не блокируем остальной флоу счетов из-за этого — просто
          // предупреждаем, статус проекта можно будет поправить вручную.
          alert("Счета отправлены на приход, но не удалось обновить статус проекта.");
        }
      }

      setSupplierWorkflows(prev => {
        const next = { ...prev };
        approvedSuppliers.forEach(sup => {
          if (next[sup]) {
            next[sup] = { ...next[sup], status: 'income' };
          }
        });
        return next;
      });

      setIsIncomeModalOpen(false);
    } catch (error) {
      console.error("Send to income failed", error);
      alert(
        error instanceof Error
          ? error.message
          : "Не удалось отправить счета на приход."
      );
    } finally {
      setIsSendingToIncome(false);
    }
  };

  return (
    <PageWrap title="Закупки" subtitle="Оформление счетов и отправка на приход">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Выберите активный проект</label>
          <div className="flex items-center gap-3">
            <select
              value={selectedProjectId}
              onChange={handleProjectSelect}
              disabled={projectsLoading}
              className="flex-1 max-w-md border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-background"
            >
              <option value="" disabled>
                {projectsLoading ? "Загрузка проектов..." : "— Нажмите, чтобы выбрать проект —"}
              </option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {getProjectName(p)}
                </option>
              ))}
            </select>
            {selectedProject && (
              <button
                onClick={() => loadProjectPurchases(selectedProject)}
                disabled={purchaseLoading}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-background transition-colors"
                title="Обновить закупку"
              >
                <RefreshCw size={15} className={purchaseLoading ? "animate-spin" : ""} />
              </button>
            )}
          </div>
        </div>
      </div>

      {purchaseError && (
        <div className="p-4 bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-400/25 rounded-lg mb-6 text-sm">
          {purchaseError}
        </div>
      )}

      {purchaseLoading && !selectedProject && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-primary" />
          Загружаем закупку…
        </div>
      )}

      {!selectedProject && !purchaseLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-lg border border-dashed border-border">
          <ShoppingCart size={32} className="text-slate-300 mb-3" />
          <p className="text-base font-medium text-foreground">Проект не выбран</p>
          <p className="text-sm text-muted-foreground mt-1">Выберите проект из списка выше, чтобы начать работу с закупками.</p>
        </div>
      )}

      {selectedProject && !purchaseLoading && supplierKeys.length === 0 && (
        <div className="py-16 text-center bg-card rounded-lg border border-border">
          <p className="text-sm font-medium text-muted-foreground">В этом проекте нет товаров к закупке.</p>
        </div>
      )}

      {supplierKeys.map(supplier => {
        const items = groupedItems[supplier];
        const isExpanded = expandedSuppliers[supplier] || false;
        const wfState = supplierWorkflows[supplier] || { file: null, status: 'draft', directorApproved: false, accountantApproved: false };
        const hasFile = !!(wfState.file || wfState.fileName);
        
        return (
          <div key={supplier} className="bg-card rounded-lg border border-border mb-5 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <div 
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-background cursor-pointer hover:bg-muted/50 border-b border-border"
              onClick={() => toggleSupplier(supplier)}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-400/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <ShoppingCart size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{supplier}</h3>
                  <p className="text-xs text-muted-foreground">{items.length} позиций</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {wfState.status === 'income' && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-green-100 dark:bg-green-400/20 text-green-700 dark:text-green-300 rounded-full flex items-center gap-1">
                    <PackageCheck size={12}/> Оприходовано
                  </span>
                )}
                {wfState.status === 'approved' && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-blue-100 dark:bg-blue-400/20 text-blue-700 dark:text-blue-300 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={12}/> Готово к приходу
                  </span>
                )}

                {(wfState.status === 'rejected_by_accountant' || wfState.status === 'rejected_by_director') && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-red-100 dark:bg-red-400/20 text-red-700 dark:text-red-300 rounded-full flex items-center gap-1">
                    <XCircle size={12}/> Отклонено {wfState.status === 'rejected_by_director' ? 'директором' : 'бухгалтером'}
                  </span>
                )}

                {(wfState.status === 'pending_director' || wfState.status === 'pending_accountant') && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 rounded-full flex items-center gap-1 animate-pulse">
                    <AlertCircle size={12}/> На проверке у директора
                  </span>
                )}

                <ChevronDown
                  size={16}
                  className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                />
              </div>
            </div>

            {isExpanded && (
              <div className="flex flex-col">
                {(wfState.status === 'rejected_by_accountant' || wfState.status === 'rejected_by_director') && (
                  <div className="mx-5 mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 text-red-700 dark:text-red-300 px-3 py-2.5 rounded-lg text-sm">
                    <XCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">
                        Отклонено {wfState.status === 'rejected_by_director' ? 'директором' : 'бухгалтером'}:
                      </span>{" "}
                      {wfState.rejectionReason}
                      {(isPm || isAccountant) && (
                        <span className="block mt-1 text-destructive/80">
                          Замените файл счёта и отправьте его на проверку заново.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="px-5 py-4 border-b border-border bg-card flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {wfState.isUploading ? (
                       <div className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-muted-foreground text-sm font-medium rounded-lg">
                          <Loader2 size={16} className="animate-spin text-primary" /> Загрузка файла...
                       </div>
                    ) : !hasFile ? (
                      (isPm || isAccountant) ? (
                        <label className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-foreground text-sm font-medium rounded-lg cursor-pointer hover:bg-muted transition-colors">
                          <UploadCloud size={16} className="text-primary" />
                          Загрузить Счет на оплату
                          <input 
                            type="file" 
                            accept=".pdf,.doc,.docx,.xls,.xlsx" 
                            className="hidden" 
                            onChange={(e) => {
                              if(e.target.files?.[0]) handleFileUpload(supplier, e.target.files[0]);
                            }} 
                          />
                        </label>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Счёт на оплату не загружен</p>
                      )
                    ) : (
                      <div className="flex items-center gap-3 bg-blue-50/50 dark:bg-blue-400/25 border border-blue-100 dark:border-blue-400/20 px-3 py-2 rounded-lg">
                        <FileText size={16} className="text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-foreground max-w-[200px] truncate" title={wfState.fileName || wfState.file?.name}>
                          {wfState.fileName || wfState.file?.name}
                        </span>
                        
                        <div className="h-4 w-px bg-blue-200 mx-1"></div>
                        
                        <button onClick={() => downloadFile(wfState)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                          <Download size={13}/> Скачать
                        </button>
                        
                        {(isPm || isAccountant) && isAwaitingSend(wfState.status) && (
                          <label className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 ml-2">
                            Заменить
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => {
                                if(e.target.files?.[0]) handleFileUpload(supplier, e.target.files[0]);
                              }} 
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {isAccountant && wfState.status === 'pending_director' && (
                      <span className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                        <AlertCircle size={13} className="text-amber-500 dark:text-amber-400" />
                        Ожидает решения директора
                      </span>
                    )}

                    {isDirector && wfState.status === 'pending_director' && (
                      wfState.rejectFormOpen ? (
                        <div className="flex flex-col gap-2 bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-400/25 rounded-lg p-3 w-full sm:w-80">
                          <label className="text-xs font-medium text-red-700 dark:text-red-300">Причина отклонения</label>
                          <textarea
                            value={wfState.rejectDraftReason || ""}
                            onChange={(e) => setRejectDraftReason(supplier, e.target.value)}
                            placeholder="Что нужно исправить в счёте?"
                            rows={2}
                            className="text-sm border border-red-200 dark:border-red-400/25 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => closeRejectForm(supplier)} className="text-xs text-muted-foreground hover:underline">
                              Отмена
                            </button>
                            <button
                              onClick={() => handleDirectorReject(supplier)}
                              disabled={!wfState.rejectDraftReason?.trim() || wfState.actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              <XCircle size={13}/> Отклонить счёт
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => openRejectForm(supplier)}
                            disabled={wfState.actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-card border border-red-200 dark:border-red-400/25 text-destructive text-sm font-medium rounded-lg hover:bg-red-50 dark:bg-red-400/15 transition-colors disabled:opacity-50"
                          >
                            <XCircle size={14}/> Отклонить
                          </button>
                          <button
                            onClick={() => handleDirectorApprove(supplier)}
                            disabled={wfState.actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            <Check size={14}/> Одобрить (Директор)
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-background/40">
                        {["Продукт", "Кол.", "Ед.", "Цена", "Сумма", "Маржа"].map((header) => (
                          <th key={header} className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((item) => {
                        const quantity = toNumber(item.required_quantity ?? item.quantity);
                        const unit = safeTrim(item.product?.unit) || safeTrim(item.unit) || "шт";
                        const costPrice = getPurchasePrice(item);
                        const salePrice = getSalePrice(item);
                        
                        const sum = quantity * costPrice;
                        const marginPercent = salePrice > 0 ? ((salePrice - costPrice) / salePrice) * 100 : 0;

                        return (
                          <tr key={item.id} className="hover:bg-background/30 transition-colors">
                            <td className="px-5 py-3.5 text-sm font-medium text-foreground">
                              {getItemName(item)}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono text-foreground">
                              {quantity}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-muted-foreground">
                              {unit}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono text-foreground">
                              {fmt(costPrice)}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono font-semibold text-foreground">
                              {fmt(sum)}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${marginPercent >= 20 ? "bg-success-muted text-success" : marginPercent > 0 ? "bg-warning-muted text-warning" : marginPercent < 0 ? "bg-destructive-muted text-destructive" : "bg-muted text-muted-foreground"}`}>
                                {marginPercent.toFixed(1)}%
                              </span>
                            </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selectedProject && supplierKeys.length > 0 && (isPm || isAccountant) && (
        <div className="mt-8 mb-10 flex flex-col items-end gap-3 border-t border-border pt-6">
          {allSuppliersIncomed ? (
            <div className="flex items-center gap-2 px-5 py-3 bg-success-muted border border-success/20 text-success rounded-xl text-sm font-medium shadow-sm">
              <PackageCheck size={18} className="text-success" />
              Все закупки проекта отправлены на приход!
            </div>
          ) : (
            <>
              {/* Отправка на проверку директору — доступна и PM, и бухгалтеру,
                  т.к. оба могут загружать счета. */}
              {hasPendingSendSuppliers && (
                <div className="flex flex-col items-end gap-2">
                  {!allPendingSendFilesUploaded && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg">
                      <AlertCircle size={13} className="text-amber-500 dark:text-amber-400" />
                      Загружено {pendingSendSuppliersWithFile.length} из {pendingSendSuppliers.length} счетов, ожидающих отправки.
                    </p>
                  )}

                  <button
                    onClick={handleGlobalSendToCheck}
                    disabled={!allPendingSendFilesUploaded || isSendingToCheck}
                    className={`flex items-center gap-2.5 px-6 py-3 text-sm font-bold rounded-xl shadow-sm transition-all ${
                      allPendingSendFilesUploaded && !isSendingToCheck
                        ? "bg-primary hover:bg-primary/90 text-white cursor-pointer active:scale-[0.97]"
                        : "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                    }`}
                  >
                    {isSendingToCheck ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {hasRejectedPendingSuppliers ? "Отправить заново" : "Отправить на проверку"}
                  </button>
                </div>
              )}

              {/* Отправка на приход — только PM, ровно как раньше. */}
              {!hasPendingSendSuppliers && isPm && (
                <div className="flex flex-col items-end gap-2">
                  {!canGlobalSendToIncome && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg">
                      <AlertCircle size={13} className="text-amber-500 dark:text-amber-400" />
                      Счета отправлены на проверку. Кнопка «Отправить на приход» станет активной после того, как Директор подтвердит всё.
                    </p>
                  )}

                  <button
                    onClick={handleOpenSendToIncomeModal}
                    disabled={!canGlobalSendToIncome}
                    className={`flex items-center gap-2.5 px-6 py-3 text-sm font-bold rounded-xl shadow-sm transition-all ${
                      canGlobalSendToIncome
                        ? "bg-success hover:bg-success/90 text-success-foreground cursor-pointer shadow-success/30 active:scale-[0.97]"
                        : "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                    }`}
                  >
                    <PackageCheck size={18} />
                    Отправить на приход
                  </button>
                </div>
              )}

              {/* Бухгалтер видит статус, но саму отправку на приход
                  делает только PM. */}
              {!hasPendingSendSuppliers && !isPm && isAccountant && (
                <p className="text-xs text-muted-foreground italic flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg">
                  <AlertCircle size={13} className="text-amber-500 dark:text-amber-400" />
                  {canGlobalSendToIncome
                    ? "Директор подтвердил все счета. Отправить на приход может только менеджер проекта."
                    : "Счета отправлены директору на проверку."}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Модальное окно выбора склада для отправки на приход */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-card rounded-xl shadow-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-foreground font-bold">
                <Building2 className="text-blue-600 dark:text-blue-400" size={20} />
                <h3>Выбор склада для поступления</h3>
              </div>
              <button onClick={() => setIsIncomeModalOpen(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              Выберите склад, на который кладовщик будет принимать ожидаемый товар по одобренным счетам:
            </p>

            <div className="space-y-2 mb-6">
              {warehouses.map(wh => (
                <label
                  key={wh.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedWarehouseId === wh.id
                      ? "border-blue-600 bg-blue-50/50 dark:bg-blue-400/25 text-blue-900 dark:text-blue-200 font-medium"
                      : "border-border hover:bg-background text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="warehouse_select"
                      checked={selectedWarehouseId === wh.id}
                      onChange={() => setSelectedWarehouseId(wh.id)}
                      className="text-blue-600 dark:text-blue-400 focus:ring-primary"
                    />
                    <span className="text-sm">{wh.name}</span>
                  </div>
                  {wh.code && <span className="text-xs text-muted-foreground font-mono">[{wh.code}]</span>}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsIncomeModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmGlobalSendToIncome}
                disabled={isSendingToIncome}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSendingToIncome && <Loader2 size={14} className="animate-spin" />}
                Подтвердить и отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}