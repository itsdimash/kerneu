import { useMemo, useState, useEffect } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { fmt } from "../lib/format";
import type { Role, ProjectState } from "../types";
import { 
  getProjectItems, 
  uploadProjectDocument, 
  fetchProjectDocuments 
} from "../api/api";
import {
  Loader2,
  Download,
  UploadCloud,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Send,
  Check,
  PackageCheck,
  ShoppingCart,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle
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

async function postInvoiceAction(documentId: number, action: string, body?: { reason: string }) {
  const response = await fetch(`${API_BASE_URL}/procurement-invoices/${documentId}/${action}`, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Не удалось выполнить действие");
  }

  return response.json();
}

const sendInvoiceToCheck = (documentId: number) => postInvoiceAction(documentId, "send-to-check");
const accountantApproveInvoice = (documentId: number) => postInvoiceAction(documentId, "accountant-approve");
const accountantRejectInvoice = (documentId: number, reason: string) =>
  postInvoiceAction(documentId, "accountant-reject", { reason });
const directorApproveInvoice = (documentId: number) => postInvoiceAction(documentId, "director-approve");
const directorRejectInvoice = (documentId: number, reason: string) =>
  postInvoiceAction(documentId, "director-reject", { reason });

const PROJECT_WORKFLOW = [
  "Новый проект",
  "В редактировании",
  "На согласовании",
  "Ожидание клиента",
  "Ожидание подписания",
  "Активный закуп", 
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

export function ProcurementPage({ role, projectState }: { role: Role | string; projectState: ProjectState }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  
  const [purchaseItems, setPurchaseItems] = useState<ProcurementProjectItem[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});
  const [supplierWorkflows, setSupplierWorkflows] = useState<Record<string, SupplierWorkflowState>>({});

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

        const filtered = data.filter(p => {
           const statusName = safeTrim(p.status?.status_name) || safeTrim(p.status_name) || "Новый проект";
           const idx = PROJECT_WORKFLOW.indexOf(statusName);
           return idx >= activeIndex;
        });

        if (!cancelled) setProjects(filtered);
      } catch(e) {
        console.error("Ошибка при загрузке проектов:", e);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    fetchProjects();
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

  const handleAccountantApprove = async (supplier: string) => {
    const docId = supplierWorkflows[supplier]?.docId;
    if (!docId) return;
    updateSupplierWorkflow(supplier, { actionLoading: true });
    try {
      await accountantApproveInvoice(docId);
      updateSupplierWorkflow(supplier, { status: 'pending_director', accountantApproved: true, actionLoading: false });
    } catch (error) {
      console.error("Accountant approve failed", error);
      alert("Не удалось подтвердить счёт.");
      updateSupplierWorkflow(supplier, { actionLoading: false });
    }
  };

  const handleAccountantReject = async (supplier: string) => {
    const wf = supplierWorkflows[supplier];
    const reason = wf?.rejectDraftReason?.trim();
    if (!wf?.docId || !reason) return;
    updateSupplierWorkflow(supplier, { actionLoading: true });
    try {
      await accountantRejectInvoice(wf.docId, reason);
      updateSupplierWorkflow(supplier, {
        status: 'rejected_by_accountant',
        accountantApproved: false,
        directorApproved: false,
        rejectionReason: reason,
        rejectFormOpen: false,
        rejectDraftReason: "",
        actionLoading: false,
      });
    } catch (error) {
      console.error("Accountant reject failed", error);
      alert("Не удалось отклонить счёт.");
      updateSupplierWorkflow(supplier, { actionLoading: false });
    }
  };

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

  const handleGlobalSendToIncome = () => {
    setSupplierWorkflows(prev => {
      const next = { ...prev };
      supplierKeys.forEach(sup => {
        if (next[sup] && next[sup].status === 'approved') {
          next[sup] = { ...next[sup], status: 'income' };
        }
      });
      return next;
    });
  };

  return (
    <PageWrap title="Закупки" subtitle="Оформление счетов и отправка на приход">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-sm">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Выберите активный проект</label>
          <div className="flex items-center gap-3">
            <select
              value={selectedProjectId}
              onChange={handleProjectSelect}
              disabled={projectsLoading}
              className="flex-1 max-w-md border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] disabled:bg-slate-50"
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
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#E2E8F0] text-slate-500 hover:bg-slate-50 transition-colors"
                title="Обновить закупку"
              >
                <RefreshCw size={15} className={purchaseLoading ? "animate-spin" : ""} />
              </button>
            )}
          </div>
        </div>
      </div>

      {purchaseError && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg mb-6 text-sm">
          {purchaseError}
        </div>
      )}

      {purchaseLoading && !selectedProject && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin text-[#2563EB]" />
          Загружаем закупку…
        </div>
      )}

      {!selectedProject && !purchaseLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-lg border border-dashed border-[#E2E8F0]">
          <ShoppingCart size={32} className="text-slate-300 mb-3" />
          <p className="text-base font-medium text-slate-700">Проект не выбран</p>
          <p className="text-sm text-slate-500 mt-1">Выберите проект из списка выше, чтобы начать работу с закупками.</p>
        </div>
      )}

      {selectedProject && !purchaseLoading && supplierKeys.length === 0 && (
        <div className="py-16 text-center bg-white rounded-lg border border-[#E2E8F0]">
          <p className="text-sm font-medium text-slate-600">В этом проекте нет товаров к закупке.</p>
        </div>
      )}

      {supplierKeys.map(supplier => {
        const items = groupedItems[supplier];
        const isExpanded = expandedSuppliers[supplier] || false;
        const wfState = supplierWorkflows[supplier] || { file: null, status: 'draft', directorApproved: false, accountantApproved: false };
        const hasFile = !!(wfState.file || wfState.fileName);
        
        return (
          <div key={supplier} className="bg-white rounded-lg border border-[#E2E8F0] mb-5 shadow-sm overflow-hidden transition-all">
            <div 
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-slate-50 cursor-pointer hover:bg-slate-100/50 border-b border-[#E2E8F0]"
              onClick={() => toggleSupplier(supplier)}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <ShoppingCart size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{supplier}</h3>
                  <p className="text-xs text-slate-500">{items.length} позиций</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {wfState.status === 'income' && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                    <PackageCheck size={12}/> Оприходовано
                  </span>
                )}
                {wfState.status === 'approved' && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={12}/> Готово к приходу
                  </span>
                )}

                {(wfState.status === 'rejected_by_accountant' || wfState.status === 'rejected_by_director') && (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                    <XCircle size={12}/> Отклонено {wfState.status === 'rejected_by_director' ? 'директором' : 'бухгалтером'}
                  </span>
                )}

                {(wfState.status === 'pending_accountant' || wfState.status === 'pending_director') && (
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${wfState.accountantApproved ? "bg-green-100 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      {wfState.accountantApproved ? "✓ Бухгалтер" : "⏳ Бухгалтер"}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      wfState.directorApproved
                        ? "bg-green-100 text-green-700"
                        : wfState.status === 'pending_director'
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-400"
                    }`}>
                      {wfState.directorApproved ? "✓ Директор" : wfState.status === 'pending_director' ? "⏳ Директор" : "— Директор"}
                    </span>
                  </div>
                )}

                {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>
            </div>

            {isExpanded && (
              <div className="flex flex-col">
                {(wfState.status === 'rejected_by_accountant' || wfState.status === 'rejected_by_director') && (
                  <div className="mx-5 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                    <XCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">
                        Отклонено {wfState.status === 'rejected_by_director' ? 'директором' : 'бухгалтером'}:
                      </span>{" "}
                      {wfState.rejectionReason}
                      {isPm && (
                        <span className="block mt-1 text-red-600/80">
                          Замените файл счёта и отправьте его на проверку заново.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="px-5 py-4 border-b border-[#E2E8F0] bg-white flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {wfState.isUploading ? (
                       <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-500 text-sm font-medium rounded-lg">
                          <Loader2 size={16} className="animate-spin text-[#2563EB]" /> Загрузка файла...
                       </div>
                    ) : !hasFile ? (
                      isPm ? (
                        <label className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                          <UploadCloud size={16} className="text-[#2563EB]" />
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
                        <p className="text-sm text-slate-500 italic">Счёт на оплату не загружен</p>
                      )
                    ) : (
                      <div className="flex items-center gap-3 bg-blue-50/50 border border-blue-100 px-3 py-2 rounded-lg">
                        <FileText size={16} className="text-blue-600" />
                        <span className="text-sm font-medium text-slate-700 max-w-[200px] truncate" title={wfState.fileName || wfState.file?.name}>
                          {wfState.fileName || wfState.file?.name}
                        </span>
                        
                        <div className="h-4 w-px bg-blue-200 mx-1"></div>
                        
                        <button onClick={() => downloadFile(wfState)} className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
                          <Download size={13}/> Скачать
                        </button>
                        
                        {isPm && isAwaitingSend(wfState.status) && (
                          <label className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1 ml-2">
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
                    {isAccountant && wfState.status === 'pending_accountant' && (
                      wfState.rejectFormOpen ? (
                        <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-lg p-3 w-full sm:w-80">
                          <label className="text-xs font-medium text-red-700">Причина отклонения</label>
                          <textarea
                            value={wfState.rejectDraftReason || ""}
                            onChange={(e) => setRejectDraftReason(supplier, e.target.value)}
                            placeholder="Что нужно исправить в счёте?"
                            rows={2}
                            className="text-sm border border-red-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => closeRejectForm(supplier)} className="text-xs text-slate-500 hover:underline">
                              Отмена
                            </button>
                            <button
                              onClick={() => handleAccountantReject(supplier)}
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
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <XCircle size={14}/> Отклонить
                          </button>
                          <button
                            onClick={() => handleAccountantApprove(supplier)}
                            disabled={wfState.actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            <Check size={14}/> Одобрить (Бухгалтер)
                          </button>
                        </>
                      )
                    )}
                    {isAccountant && (wfState.status === 'pending_director' || wfState.status === 'approved' || wfState.status === 'income') && (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Бухгалтер подтвердил
                      </span>
                    )}
                    {isAccountant && isAwaitingSend(wfState.status) && (
                      <span className="text-xs text-slate-400 italic">Ожидает отправки от менеджера</span>
                    )}

                    {isDirector && wfState.status === 'pending_director' && (
                      wfState.rejectFormOpen ? (
                        <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-lg p-3 w-full sm:w-80">
                          <label className="text-xs font-medium text-red-700">Причина отклонения</label>
                          <textarea
                            value={wfState.rejectDraftReason || ""}
                            onChange={(e) => setRejectDraftReason(supplier, e.target.value)}
                            placeholder="Что нужно исправить в счёте?"
                            rows={2}
                            className="text-sm border border-red-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => closeRejectForm(supplier)} className="text-xs text-slate-500 hover:underline">
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
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
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
                    {isDirector && (wfState.status === 'approved' || wfState.status === 'income') && (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Директор подтвердил
                      </span>
                    )}
                    {isDirector && (isAwaitingSend(wfState.status) || wfState.status === 'pending_accountant') && (
                      <span className="text-xs text-slate-400 italic">Ожидает проверки бухгалтера</span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-slate-50/40">
                        {["Продукт", "Кол.", "Ед.", "Цена", "Сумма", "Маржа"].map((header) => (
                          <th key={header} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {items.map((item) => {
                        const quantity = toNumber(item.required_quantity ?? item.quantity);
                        const unit = safeTrim(item.product?.unit) || safeTrim(item.unit) || "шт";
                        const costPrice = getPurchasePrice(item);
                        const salePrice = getSalePrice(item);
                        
                        const sum = quantity * costPrice;
                        const marginPercent = salePrice > 0 ? ((salePrice - costPrice) / salePrice) * 100 : 0;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                            <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                              {getItemName(item)}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono text-slate-700">
                              {quantity}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate-500">
                              {unit}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono text-slate-700">
                              {fmt(costPrice)}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono font-semibold text-slate-900">
                              {fmt(sum)}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${marginPercent >= 20 ? "bg-green-100 text-green-800" : marginPercent > 0 ? "bg-amber-100 text-amber-800" : marginPercent < 0 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>
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

      {selectedProject && supplierKeys.length > 0 && isPm && (
        <div className="mt-8 mb-10 flex flex-col items-end gap-3 border-t border-[#E2E8F0] pt-6">
          {allSuppliersIncomed ? (
            <div className="flex items-center gap-2 px-5 py-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm font-medium shadow-sm">
              <PackageCheck size={18} className="text-green-600" />
              Все закупки проекта отправлены на приход!
            </div>
          ) : (
            <>
              {hasPendingSendSuppliers && (
                <div className="flex flex-col items-end gap-2">
                  {!allPendingSendFilesUploaded && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg">
                      <AlertCircle size={13} className="text-amber-500" />
                      Загружено {pendingSendSuppliersWithFile.length} из {pendingSendSuppliers.length} счетов, ожидающих отправки. Загрузите счета для всех поставщиков, прежде чем отправлять на проверку.
                    </p>
                  )}

                  <button
                    onClick={handleGlobalSendToCheck}
                    disabled={!allPendingSendFilesUploaded || isSendingToCheck}
                    className={`flex items-center gap-2.5 px-6 py-3 text-sm font-bold rounded-xl shadow-sm transition-all ${
                      allPendingSendFilesUploaded && !isSendingToCheck
                        ? "bg-[#2563EB] hover:bg-[#1d4ed8] text-white cursor-pointer"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                    }`}
                  >
                    {isSendingToCheck ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {hasRejectedPendingSuppliers ? "Отправить заново" : "Отправить на проверку"}
                  </button>
                </div>
              )}

              {!hasPendingSendSuppliers && (
                <div className="flex flex-col items-end gap-2">
                  {!canGlobalSendToIncome && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg">
                      <AlertCircle size={13} className="text-amber-500" />
                      Счета отправлены на проверку. Кнопка «Отправить на приход» станет активной после того, как Бухгалтер и Директор по очереди подтвердят все счёта.
                    </p>
                  )}

                  <button
                    onClick={handleGlobalSendToIncome}
                    disabled={!canGlobalSendToIncome}
                    className={`flex items-center gap-2.5 px-6 py-3 text-sm font-bold rounded-xl shadow-sm transition-all ${
                      canGlobalSendToIncome
                        ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer shadow-green-200"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                    }`}
                  >
                    <PackageCheck size={18} />
                    Отправить на приход
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </PageWrap>
  );
}