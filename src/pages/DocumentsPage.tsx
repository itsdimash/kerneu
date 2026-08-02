import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import type { Page, ProjectState, Role } from "../types";
import {
  CheckCircle2, Clock, Download, Loader2, Upload, Check, FileCheck,
  FileText, Receipt as ReceiptIcon, ChevronDown, Search, Lock, X,
  Send, AlertTriangle, Trash2, Handshake
} from "lucide-react";
import {
  documentsStore,
  type DocCategory, type ProjectDocument, type DocStatus,
  type ProjectSummary, type Rejector,
} from "../store/documentsStore";
import {
  downloadProjectDocument,
  fetchProjectDocuments,
  uploadProjectDocument,
  deleteProjectDocument,
} from "../api/api";

const API_BASE = "http://localhost:8000/api/v1";

type ProjectApiItem = {
  id: number;
  name: string;
  contract_signed?: boolean;
  status_name?: string;
  status?: string | { status_name?: string };
};

const REVIEWER_ROLES: Role[] = ["accountant", "commercial_director"];

const ROLE_LABEL: Record<Rejector, string> = {
  accountant: "бухгалтер",
  commercial_director: "коммерческий директор",
};

export function DocumentsPage({
  onNavigate,
  projectState,
  role,
  projectId,
}: {
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  role: Role;
  projectId?: number | null;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  
  // НОВОЕ СОСТОЯНИЕ: Показывать ли завершенные проекты
  const [showAllProjects, setShowAllProjects] = useState(false);

  const [archivedKps, setArchivedKps] = useState<ProjectDocument[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [uploadingPoa, setUploadingPoa] = useState(false);
  const [uploadingWaybill, setUploadingWaybill] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      try {
        const response = await fetch(`${API_BASE}/projects/`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить проекты");
        }

        const data = (await response.json()) as ProjectApiItem[];
        const normalizedProjects = data.map((item) => {
          const statusName =
            typeof item.status === "string"
              ? item.status
              : item.status?.status_name ?? item.status_name ?? "";

          return {
            id: String(item.id),
            name: item.name,
            statusName,
            contractSigned:
              item.contract_signed === true ||
              statusName === "Активный закуп" ||
              statusName === "Завершен",
          };
        });

        if (cancelled) return;

        setProjects(normalizedProjects);
        setSelectedProjectId((currentId) => {
          const requestedId = projectId ? String(projectId) : "";
          if (requestedId && normalizedProjects.some((project) => project.id === requestedId)) return requestedId;
          if (currentId && normalizedProjects.some((project) => project.id === currentId)) return currentId;
          
          // При начальной загрузке выбираем первый попавшийся активный проект (если есть)
          const firstActive = normalizedProjects.find(p => p.statusName !== "Завершен");
          return firstActive?.id ?? normalizedProjects[0]?.id ?? "";
        });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setProjects([]);
          setSelectedProjectId("");
        }
      }
    };

    void loadProjects();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    const loadArchivedKps = async (showLoading = false) => {
      if (!selectedProjectId) {
        setArchivedKps([]);
        setArchiveError(null);
        return;
      }

      try {
        if (showLoading) {
          setArchiveLoading(true);
          setArchivedKps([]);
          setArchiveError(null);
        }
        
        const data = await fetchProjectDocuments(selectedProjectId);
        
        const kpDocs = data
          .filter((item) => item.category === "kp")
          .map<ProjectDocument>((item) => ({
            id: `backend-${item.id}`,
            projectId: String(item.project_id),
            name: item.name,
            category: item.category as DocCategory,
            status: item.status === "approved" ? "approved" : "generated",
            date: new Date(item.created_at).toLocaleDateString("ru-RU"),
            fileName: item.file_name,
            backendDocument: item,
          }));

        if (!cancelled) {
          setArchivedKps(kpDocs);
          setArchiveError(null);

          const apiContract = data.find(d => d.category === "contract");
          if (apiContract) {
            documentsStore.updateDocument(selectedProjectId, `${selectedProjectId}-contract`, {
              status: "uploaded",
              date: new Date(apiContract.created_at).toLocaleDateString("ru-RU"),
              fileName: apiContract.file_name,
              backendDocument: apiContract,
            });
          }
          
          const localDocs = documentsStore.getSnapshot(selectedProjectId);
          const otherDocs = data.filter(
            item => 
              item.category === "power_of_attorney" || 
              item.category === "waybill" ||
              (item.category === "invoice" && (item.status === "approved" || item.status === "income"))
          );
          
          otherDocs.forEach(apiDoc => {
            const storeId = `backend-${apiDoc.id}`;
            if (!localDocs.some(d => d.id === storeId)) {
              documentsStore.addDocument(selectedProjectId, {
                id: storeId,
                name: apiDoc.name,
                category: apiDoc.category as DocCategory,
                status: "uploaded",
                date: new Date(apiDoc.created_at).toLocaleDateString("ru-RU"),
                fileName: apiDoc.file_name,
                backendDocument: apiDoc,
              });
            }
          });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setArchiveError(error instanceof Error ? error.message : "Не удалось загрузить архив документов");
        }
      } finally {
        if (!cancelled && showLoading) setArchiveLoading(false);
      }
    };

    void loadArchivedKps(true);

    const intervalId = window.setInterval(() => { void loadArchivedKps(); }, 5000);
    const handleFocus = () => { void loadArchivedKps(); };
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [selectedProjectId]);

  // Статус согласования документов (бухгалтер -> директор) теперь живёт на
  // бэкенде — подгружаем его при выборе проекта и опрашиваем, пока страница
  // открыта, чтобы PM/бухгалтер/директор видели решения друг друга без перезагрузки.
  useEffect(() => {
    if (!selectedProjectId) return;

    void documentsStore.loadReview(selectedProjectId);

    const intervalId = window.setInterval(() => {
      void documentsStore.loadReview(selectedProjectId);
    }, 5000);
    const handleFocus = () => { void documentsStore.loadReview(selectedProjectId); };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [selectedProjectId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedProjectName = selectedProject?.name ?? "Проект не выбран";
  const contractSigned = selectedProject?.contractSigned ?? projectState.contractSigned;
  const uploadsLocked = !contractSigned;

  // ОБНОВЛЕННАЯ ЛОГИКА ФИЛЬТРАЦИИ
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(projectQuery.toLowerCase());
    const matchesStatus = showAllProjects || p.statusName !== "Завершен";
    return matchesSearch && matchesStatus;
  });

  const review = useSyncExternalStore(
    documentsStore.subscribe,
    () => documentsStore.getReviewSnapshot(selectedProjectId)
  );
  const { stage: reviewStage, rejectedBy, rejectReason, completed } = review;

  const localDocs = useSyncExternalStore(
    documentsStore.subscribe,
    () => documentsStore.getSnapshot(selectedProjectId)
  );
  const allDocs = [...archivedKps, ...localDocs.filter((document) => document.category !== "kp")];
  const hasApprovedKp = archivedKps.some((document) => document.status === "approved");

  const reviewInFlight = reviewStage === "pending_accountant" || reviewStage === "pending_director";
  const docsLocked = completed || uploadsLocked || reviewInFlight;

  const contractDoc = allDocs.find(d => d.category === "contract");
  const poaDocs     = allDocs.filter(d => d.category === "power_of_attorney");
  const waybillDocs = allDocs.filter(d => d.category === "waybill");
  const invoiceDocs = allDocs.filter(d => d.category === "invoice");

  const poaPlaceholder: ProjectDocument = {
    id: "poa-placeholder",
    projectId: selectedProjectId,
    name: "Доверенность",
    category: "power_of_attorney" as DocCategory,
    status: "pending" as DocStatus,
    date: "",
    required: false,
  };
  const invoicePlaceholder: ProjectDocument = {
    id: "invoice-placeholder",
    projectId: selectedProjectId,
    name: "Счета на оплату",
    category: "invoice" as DocCategory,
    status: "pending" as DocStatus,
    date: "",
    required: false,
  };
  const waybillPlaceholder: ProjectDocument = {
    id: "waybill-placeholder",
    projectId: selectedProjectId,
    name: "Накладные",
    category: "waybill" as DocCategory,
    status: "pending" as DocStatus,
    date: "",
    required: false,
  };

  const displayDocs = [...allDocs];
  if (poaDocs.length === 0) displayDocs.push(poaPlaceholder);
  if (invoiceDocs.length === 0) displayDocs.push(invoicePlaceholder);
  if (waybillDocs.length === 0) displayDocs.push(waybillPlaceholder);

  const contractUploaded = contractDoc?.status === "uploaded";
  const poaUploaded      = poaDocs.some(d => d.status === "uploaded");
  const hasWaybill       = waybillDocs.some(d => d.status === "uploaded");
  const hasInvoice       = invoiceDocs.some(d => d.status === "uploaded"); 

  const requiredDocCount = 5;
  const doneDocCount = [hasApprovedKp, contractUploaded, poaUploaded, hasInvoice, hasWaybill].filter(Boolean).length;
  const allUploaded = doneDocCount === requiredDocCount;
  const canComplete = allUploaded && reviewStage === "approved" && !completed;

  const [submittingReview, setSubmittingReview] = useState(false);
  const [decidingReview,   setDecidingReview]   = useState(false);
  const [completing,       setCompleting]       = useState(false);
  const [rejectDraft,      setRejectDraft]      = useState("");
  const [showRejectBox,    setShowRejectBox]    = useState(false);
  
  const poaFileRef = useRef<HTMLInputElement>(null);
  const waybillFileRef = useRef<HTMLInputElement>(null);

  const today = () => new Date().toLocaleDateString("ru-RU");

  const handleDeleteDoc = async (doc: ProjectDocument) => {
    if (docsLocked) return;
    if (!window.confirm(`Удалить «${doc.name}»?`)) return;
    
    try {
      if (doc.backendDocument?.id) {
        await deleteProjectDocument(doc.backendDocument.id);
      }
      documentsStore.removeDocument(selectedProjectId, doc.id);
    } catch (e) {
      console.error(e);
      alert("Не удалось удалить документ. Проверьте соединение с сервером.");
    }
  };

  const handleDocUpload = async (
    file: File, 
    category: DocCategory, 
    prefix: string, 
    count: number, 
    setLoading: (v: boolean) => void
  ) => {
    setLoading(true);
    try {
      const docName = `${prefix} ${count + 1}`;
      const uploadedDoc = await uploadProjectDocument(selectedProjectId, category, file, docName);
      
      documentsStore.addDocument(selectedProjectId, {
        id: `backend-${uploadedDoc.id}`,
        name: docName,
        category: category,
        status: "uploaded",
        date: today(),
        fileName: file.name,
        backendDocument: uploadedDoc,
      });
    } catch (error) {
      console.error(error);
      alert(`Не удалось загрузить документ. Попробуйте еще раз.`);
    } finally {
      setLoading(false);
    }
  };

  const handlePoaDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (docsLocked || uploadingPoa) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await handleDocUpload(file, "power_of_attorney", "Доверенность", poaDocs.length, setUploadingPoa);
  };
  const handlePoaInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (docsLocked || uploadingPoa) return;
    const file = e.target.files?.[0];
    if (file) await handleDocUpload(file, "power_of_attorney", "Доверенность", poaDocs.length, setUploadingPoa);
    if (poaFileRef.current) poaFileRef.current.value = "";
  };

  const handleWaybillDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (docsLocked || uploadingWaybill) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await handleDocUpload(file, "waybill", "Накладная", waybillDocs.length, setUploadingWaybill);
  };
  const handleWaybillInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (docsLocked || uploadingWaybill) return;
    const file = e.target.files?.[0];
    if (file) await handleDocUpload(file, "waybill", "Накладная", waybillDocs.length, setUploadingWaybill);
    if (waybillFileRef.current) waybillFileRef.current.value = "";
  };

  const handleSubmitForReview = async () => {
    setSubmittingReview(true);
    try {
      await documentsStore.submitForReview(selectedProjectId);
    } catch (error) {
      console.error(error);
      alert("Не удалось отправить документы на проверку. Проверьте соединение с сервером.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAccountantAccept = async () => {
    setDecidingReview(true);
    try {
      await documentsStore.accountantApprove(selectedProjectId);
    } catch (error) {
      console.error(error);
      alert("Не удалось подтвердить документы. Проверьте соединение с сервером.");
    } finally {
      setDecidingReview(false);
    }
  };

  const handleAccountantReject = async () => {
    setDecidingReview(true);
    try {
      await documentsStore.accountantReject(selectedProjectId, rejectDraft.trim() || undefined);
      setRejectDraft("");
      setShowRejectBox(false);
    } catch (error) {
      console.error(error);
      alert("Не удалось отклонить документы. Проверьте соединение с сервером.");
    } finally {
      setDecidingReview(false);
    }
  };

  const handleDirectorAccept = async () => {
    setDecidingReview(true);
    try {
      await documentsStore.directorApprove(selectedProjectId);
    } catch (error) {
      console.error(error);
      alert("Не удалось подтвердить документы. Проверьте соединение с сервером.");
    } finally {
      setDecidingReview(false);
    }
  };

  const handleDirectorReject = async () => {
    setDecidingReview(true);
    try {
      await documentsStore.directorReject(selectedProjectId, rejectDraft.trim() || undefined);
      setRejectDraft("");
      setShowRejectBox(false);
    } catch (error) {
      console.error(error);
      alert("Не удалось отклонить документы. Проверьте соединение с сервером.");
    } finally {
      setDecidingReview(false);
    }
  };

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => { setCompleting(false); documentsStore.completeProject(selectedProjectId); }, 1600);
  };

  const handleDownload = async (doc: ProjectDocument) => {
    if (doc.backendDocument) {
      try {
        await downloadProjectDocument(doc.backendDocument, selectedProjectName);
        return;
      } catch (error) {
        console.error(error);
        alert("Не удалось скачать документ");
        return;
      }
    }
    const content = `Документ: ${doc.name}\nПроект: ${selectedProjectName}\nСтатус: ${statusLabel(doc.status)}\nДата: ${doc.date || "—"}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; 
    const safeProjectName = selectedProjectName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ _-]/g, "").trim();
    a.download = `${doc.name}_${safeProjectName}.txt`;
    document.body.appendChild(a); 
    a.click(); 
    a.remove();
    URL.revokeObjectURL(url);
  };

  function statusLabel(status: DocStatus) {
    if (status === "approved")  return "Одобрено клиентом";
    if (status === "generated") return "Сгенерирован";
    if (status === "uploaded")  return "Загружен";
    return "Ожидается";
  }

  function statusBadge(status: DocStatus) {
    const styles: Record<DocStatus, string> = {
      generated: "bg-blue-50 text-blue-700 border-blue-200",
      approved:  "bg-green-50 text-green-700 border-green-200",
      uploaded:  "bg-green-50 text-green-700 border-green-200",
      pending:   "bg-orange-50 text-orange-700 border-orange-200",
    };
    return (
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
        {statusLabel(status)}
      </span>
    );
  }

  const categoryIcon = (category: ProjectDocument["category"]) => {
    if (category === "kp")                return <FileText   size={14} className="text-blue-500"   />;
    if (category === "contract")          return <Handshake  size={14} className="text-emerald-500"/>;
    if (category === "invoice")           return <FileCheck  size={14} className="text-amber-500"  />;
    if (category === "waybill")           return <ReceiptIcon size={14} className="text-purple-500" />;
    if (category === "power_of_attorney") return <Lock       size={14} className="text-red-500"    />;
    return <FileText size={14} className="text-slate-400" />;
  };

  const tooltipComplete = !allUploaded
    ? `Загрузите все документы (${doneDocCount}/${requiredDocCount})`
    : reviewStage !== "approved"
    ? "Ожидается подтверждение бухгалтера и директора"
    : "";

  const projectSelector = (
    <div className="relative mb-4 max-w-sm">
      <button
        onClick={() => setSelectorOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-slate-700 hover:border-[#2563EB]/40 transition-colors"
      >
        <span className="font-medium truncate">{selectedProjectName}</span>
        <ChevronDown size={15} className={`text-slate-400 flex-shrink-0 transition-transform ${selectorOpen ? "rotate-180" : ""}`} />
      </button>
      {selectorOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-[#E2E8F0] rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E2E8F0]">
            <Search size={13} className="text-slate-400" />
            <input
              autoFocus
              value={projectQuery}
              onChange={e => setProjectQuery(e.target.value)}
              placeholder="Поиск проекта…"
              className="w-full text-sm outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          
          {/* НОВЫЙ БЛОК С ЧЕКБОКСОМ */}
          <div className="px-3 py-2 border-b border-[#E2E8F0] bg-slate-50">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAllProjects}
                onChange={(e) => setShowAllProjects(e.target.checked)}
                className="rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
              />
              Показывать завершенные проекты
            </label>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filteredProjects.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedProjectId(p.id); setSelectorOpen(false); setProjectQuery(""); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50/50 transition-colors ${p.id === selectedProjectId ? "bg-blue-50 text-[#2563EB] font-medium" : "text-slate-700"}`}
              >
                {p.name}
              </button>
            ))}
            {filteredProjects.length === 0 && (
              <p className="px-4 py-3 text-xs text-slate-400">Ничего не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderSharedDocumentList = () => (
    <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0]">
        <h2 className="text-sm font-semibold text-slate-900">Все документы проекта</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          КП, договор, доверенность, счета и накладные — в одном месте, доступны для скачивания на любом этапе
        </p>
      </div>
      {displayDocs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">Документов пока нет</p>
      ) : (
        <div className="divide-y divide-[#E2E8F0]">
          {displayDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {categoryIcon(doc.category)}
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-400">{doc.date || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {statusBadge(doc.status)}
                {doc.status !== "pending" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#2563EB] px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      <Download size={12} />Скачать
                    </button>
                    {!docsLocked && !doc.id.includes("placeholder") && !['kp', 'contract', 'invoice'].includes(doc.category) && (
                      <AppTooltip text="Удалить документ">
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          className="flex items-center justify-center text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </AppTooltip>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (REVIEWER_ROLES.includes(role)) {
    const myRole = role as Rejector;
    const waitingOnMe =
      (role === "accountant" && reviewStage === "pending_accountant") ||
      (role === "commercial_director" && reviewStage === "pending_director");

    const handleAccept = role === "accountant" ? handleAccountantAccept : handleDirectorAccept;
    const handleReject = role === "accountant" ? handleAccountantReject : handleDirectorReject;

    return (
      <PageWrap title="Документы" subtitle={selectedProjectName}>
        {projectSelector}
        {waitingOnMe && (
          <div className="bg-white rounded-lg border border-[#2563EB]/30 p-5 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={15} className="text-[#2563EB]" />
              <h3 className="text-sm font-semibold text-slate-900">
                {role === "accountant"
                  ? "Менеджер запросил проверку файлов"
                  : "Бухгалтер подтвердил файлы — требуется ваше решение"}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">Проверьте документы ниже и примите решение.</p>

            {showRejectBox ? (
              <div className="space-y-2">
                <textarea
                  value={rejectDraft}
                  onChange={e => setRejectDraft(e.target.value)}
                  placeholder="Комментарий для менеджера (необязательно)…"
                  rows={2}
                  className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 outline-none focus:border-[#2563EB]/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReject}
                    disabled={decidingReview}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    {decidingReview ? <Loader2 size={13} className="animate-spin" /> : <X size={14} />}Отклонить
                  </button>
                  <button
                    onClick={() => { setShowRejectBox(false); setRejectDraft(""); }}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleAccept}
                  disabled={decidingReview}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[#16A34A] text-white hover:bg-green-700 transition-colors disabled:opacity-60"
                >
                  {decidingReview ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}Принять
                </button>
                <button
                  onClick={() => setShowRejectBox(true)}
                  disabled={decidingReview}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  <X size={14} />Отклонить
                </button>
              </div>
            )}
          </div>
        )}
        {!waitingOnMe && reviewStage === "pending_accountant" && role === "commercial_director" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
            <Clock size={16} className="text-slate-400 flex-shrink-0" />
            <p className="text-sm text-slate-500">Ожидается проверка бухгалтера, затем запрос поступит вам.</p>
          </div>
        )}
        {!waitingOnMe && reviewStage === "pending_director" && role === "accountant" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200 mb-4">
            <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700">Вы подтвердили файлы. Сейчас на проверке у коммерческого директора.</p>
          </div>
        )}
        {reviewStage === "approved" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200 mb-4">
            <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700">Файлы подтверждены по всей цепочке согласования.</p>
          </div>
        )}
        {reviewStage === "rejected" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-700">
              {rejectedBy === myRole
                ? "Вы отклонили проверку. Ожидается повторная загрузка от менеджера."
                : `Отклонено (${rejectedBy ? ROLE_LABEL[rejectedBy] : "—"}). Ожидается повторная загрузка от менеджера.`}
            </p>
          </div>
        )}
        {reviewStage === "none" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
            <Clock size={16} className="text-slate-400 flex-shrink-0" />
            <p className="text-sm text-slate-500">Менеджер ещё не отправил документы на проверку.</p>
          </div>
        )}
        {renderSharedDocumentList()}
      </PageWrap>
    );
  }

  // ==========================================================================
  // PM VIEW
  // ==========================================================================
  return (
    <PageWrap
      title="Документы"
      subtitle={`${selectedProjectName}${completed ? " · Архив (только чтение)" : ""}`}
    >
      {projectSelector}
      {reviewStage === "pending_accountant" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
          <Clock size={16} className="text-[#2563EB] flex-shrink-0" />
          <p className="text-sm font-medium text-[#2563EB]">Ожидается проверка бухгалтера</p>
        </div>
      )}
      {reviewStage === "pending_director" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
          <Clock size={16} className="text-[#2563EB] flex-shrink-0" />
          <p className="text-sm font-medium text-[#2563EB]">Бухгалтер подтвердил — ожидается решение коммерческого директора</p>
        </div>
      )}
      {reviewStage === "rejected" && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700">
              {rejectedBy ? `Отклонено: ${ROLE_LABEL[rejectedBy]}` : "Проверка отклонена"}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {rejectReason ? rejectReason : "Обновите документы и отправьте на проверку повторно."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mt-4">
        <div className="col-span-2 space-y-5">
          {renderSharedDocumentList()}

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Прогресс загрузки документов</h2>
              <span className={`text-sm font-semibold ${allUploaded ? "text-green-600" : "text-slate-600"}`}>
                {doneDocCount}/{requiredDocCount}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${allUploaded ? "bg-green-500" : "bg-[#2563EB]"}`}
                style={{ width: `${(doneDocCount / requiredDocCount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              {completed
                ? "Проект завершён — документы доступны в архиве."
                : allUploaded
                ? "Все документы загружены."
                : `Осталось ${requiredDocCount - doneDocCount} документа`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Доверенность: Dropzone */}
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Lock size={14} className="text-red-500" />Доверенности
              </h3>
              <div
                onDragOver={e => { if (!docsLocked) e.preventDefault(); }}
                onDrop={handlePoaDrop}
                onClick={() => !docsLocked && poaFileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                  docsLocked || uploadingPoa
                    ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                    : "border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-blue-50/20 cursor-pointer"
                }`}
              >
                <input ref={poaFileRef} type="file" className="hidden" onChange={handlePoaInput} />
                {docsLocked || uploadingPoa
                  ? (uploadingPoa ? <Loader2 size={18} className="mx-auto mb-1.5 text-blue-500 animate-spin" /> : <Lock size={18} className="mx-auto mb-1.5 text-slate-400" />)
                  : <Upload size={18} className="mx-auto mb-1.5 text-slate-400" />}
                <p className="text-xs text-slate-500">
                  {docsLocked ? "Недоступно" : uploadingPoa ? "Загрузка..." : <><span className="text-[#2563EB]">Выберите файл</span><br/>или перетащите — можно несколько</>}
                </p>
              </div>
            </div>

            {/* Накладные: Dropzone */}
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <ReceiptIcon size={14} className="text-purple-500" />Накладные
              </h3>
              <div
                onDragOver={e => { if (!docsLocked) e.preventDefault(); }}
                onDrop={handleWaybillDrop}
                onClick={() => !docsLocked && waybillFileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                  docsLocked || uploadingWaybill
                    ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                    : "border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-blue-50/20 cursor-pointer"
                }`}
              >
                <input ref={waybillFileRef} type="file" className="hidden" onChange={handleWaybillInput} />
                {docsLocked || uploadingWaybill
                  ? (uploadingWaybill ? <Loader2 size={18} className="mx-auto mb-1.5 text-blue-500 animate-spin" /> : <Lock size={18} className="mx-auto mb-1.5 text-slate-400" />)
                  : <Upload size={18} className="mx-auto mb-1.5 text-slate-400" />}
                <p className="text-xs text-slate-500">
                  {docsLocked ? "Недоступно" : uploadingWaybill ? "Загрузка..." : <><span className="text-[#2563EB]">Выберите файл</span><br/>или перетащите — можно несколько</>}
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Согласование</h3>
            {reviewStage === "approved" && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700">Согласовано ✅</p>
                  <p className="text-xs text-green-600 mt-0.5">Бухгалтер и директор подтвердили файлы</p>
                </div>
              </div>
            )}
            {(reviewStage === "pending_accountant" || reviewStage === "pending_director") && (
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg border border-blue-100">
                <Clock size={16} className="text-[#2563EB] flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#2563EB]">
                    {reviewStage === "pending_accountant" ? "На проверке у бухгалтера" : "На проверке у директора"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Ожидаем решение</p>
                </div>
              </div>
            )}
            {(reviewStage === "none" || reviewStage === "rejected") && (
              <div className="space-y-2">
                {reviewStage === "rejected" && (
                  <p className="text-xs text-amber-600 mb-1">
                    Отклонено{rejectedBy ? ` (${ROLE_LABEL[rejectedBy]})` : ""}{rejectReason ? `: ${rejectReason}` : ""}. Обновите файлы и отправьте повторно.
                  </p>
                )}
                <AppTooltip text={!allUploaded ? "Загрузите все документы сначала" : ""}>
                  <button
                    onClick={() => allUploaded && handleSubmitForReview()}
                    disabled={!allUploaded || submittingReview}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      allUploaded
                        ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    {submittingReview
                      ? <><Loader2 size={13} className="animate-spin" />Отправка…</>
                      : <><Send size={14} />{reviewStage === "rejected" ? "Отправить повторно" : "Отправить на проверку"}</>}
                  </button>
                </AppTooltip>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Статус</h3>
            <div className="space-y-2">
              {[
                { label: "Документы загружены",  done: allUploaded },
                { label: "Бухгалтер подтвердил", done: reviewStage === "pending_director" || reviewStage === "approved" },
                { label: "Директор подтвердил",  done: reviewStage === "approved" },
                { label: "Проект завершён",       done: completed },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? "bg-green-500" : "bg-slate-200"}`}>
                    {item.done && <Check size={9} className="text-white" />}
                  </div>
                  <span className={`text-xs ${item.done ? "text-slate-700" : "text-slate-400"}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {completed ? (
            <div className="space-y-2">
              <div className="w-full py-3 rounded-lg text-sm font-semibold bg-green-50 border border-green-200 text-green-700 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} />Проект завершён · архив
              </div>
              <button
                onClick={() => onNavigate("dashboard")}
                className="w-full py-2 text-xs text-slate-500 hover:text-[#2563EB] transition-colors"
              >
                Вернуться к дашборду
              </button>
            </div>
          ) : (
            <>
              <AppTooltip text={tooltipComplete}>
                <button
                  onClick={() => canComplete && handleComplete()}
                  disabled={!canComplete || completing}
                  className={`w-full py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    canComplete
                      ? "bg-[#16A34A] text-white hover:bg-green-700"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {completing
                    ? <><Loader2 size={15} className="animate-spin" />Завершение…</>
                    : <><CheckCircle2 size={15} />Завершить проект</>}
                </button>
              </AppTooltip>
              {!canComplete && (
                <p className="text-xs text-slate-400 text-center">{tooltipComplete}</p>
              )}
            </>
          )}

        </div>
      </div>
    </PageWrap>
  );
}