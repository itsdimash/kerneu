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
  markContractUploaded,
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

// ИЗМЕНЕНО: раньше здесь сравнивалось только с "Активный закуп" / "Завершен".
// Но статусы проекта идут по цепочке дальше: Активный закуп -> На отгрузке ->
// На приходе -> Ожидание клиента -> Завершен. Договор подписан на шаге
// "Активный закуп" и остаётся подписанным на всех последующих статусах,
// поэтому сравниваем не с двумя конкретными строками, а со списком всех
// статусов, которые наступают ПОСЛЕ подписания договора.
const SIGNED_STATUSES = [
  "Активный закуп",
  "На отгрузке",
  "На приходе",
  "Ожидание клиента",
  "Завершен",
];

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
  // Финальный (проверенный/исправленный бухгалтером) файл договора — теперь
  // загружается здесь, а не на странице "Договор". Генерация происходит на
  // странице "Договор" (только бухгалтер), а сюда бухгалтер приносит уже
  // готовый, вычитанный файл.
  const [uploadingContract, setUploadingContract] = useState(false);

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
            // ИЗМЕНЕНО: было
            //   contractSigned:
            //     item.contract_signed === true ||
            //     statusName === "Активный закуп" ||
            //     statusName === "Завершен",
            // Стало — проверяем вхождение в список всех статусов "после подписания":
            contractSigned:
              item.contract_signed === true ||
              SIGNED_STATUSES.includes(statusName),
          };
        });

        if (cancelled) return;

        setProjects(normalizedProjects);
        setSelectedProjectId((currentId) => {
          const requestedId = projectId ? String(projectId) : "";
          if (requestedId && normalizedProjects.some((project) => project.id === requestedId)) return requestedId;
          if (currentId && normalizedProjects.some((project) => project.id === currentId)) return currentId;
          
          // При начальной загрузке выбираем первый попавшийся активный проект (если есть).
          // "Договор расторгнут" пропускаем — такие проекты не должны попадать
          // на страницу документов вообще.
          const firstActive = normalizedProjects.find(
            p => p.statusName !== "Завершен" && p.statusName !== "Договор расторгнут"
          );
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

  // ОБНОВЛЕННАЯ ЛОГИКА ФИЛЬТРАЦИИ
  // "Договор расторгнут" скрывается всегда, независимо от showAllProjects —
  // такие проекты не должны попадать на страницу документов вообще.
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(projectQuery.toLowerCase());
    const isTerminated = p.statusName === "Договор расторгнут";
    const matchesStatus = showAllProjects || p.statusName !== "Завершен";
    return matchesSearch && matchesStatus && !isTerminated;
  });

  const review = useSyncExternalStore(
    documentsStore.subscribe,
    () => documentsStore.getReviewSnapshot(selectedProjectId)
  );
  const { stage: reviewStage, rejectedBy, rejectReason, completed: reviewCompleted } = review;
  // ИСПРАВЛЕНО: review.completed живёт только в памяти (documentsStore —
  // обычный JS-синглтон), поэтому после F5 он всегда сбрасывается в false,
  // даже если бэкенд уже реально перевёл проект в статус "Завершен" —
  // кнопка "Завершить проект" снова становилась активной. Берём "Завершен"
  // и из selectedProject.statusName (грузится заново из /projects/ при
  // каждой загрузке страницы) как источник правды в дополнение к
  // локальному флагу.
  const completed = reviewCompleted || selectedProject?.statusName === "Завершен";

  const localDocs = useSyncExternalStore(
    documentsStore.subscribe,
    () => documentsStore.getSnapshot(selectedProjectId)
  );
  const allDocs = [...archivedKps, ...localDocs.filter((document) => document.category !== "kp")];
  const hasApprovedKp = archivedKps.some((document) => document.status === "approved");

  const contractDoc = allDocs.find(d => d.category === "contract");
  const poaDocs     = allDocs.filter(d => d.category === "power_of_attorney");
  const waybillDocs = allDocs.filter(d => d.category === "waybill");
  const invoiceDocs = allDocs.filter(d => d.category === "invoice");

  // Договор считается подписанным, если файл реально загружен и лежит в
  // архиве документов проекта (contractDoc.status === "uploaded") — это
  // надёжный локальный признак. Раньше здесь смотрели только на
  // backend-статус проекта (SIGNED_STATUSES), а он завязан на отдельный
  // вызов синхронизации статуса, который может не срабатывать (см.
  // ContractPage). Из-за этого PM мог загрузить договор, а доверенности и
  // накладные оставались заблокированы навсегда. Теперь достаточно факта
  // загрузки файла; backend-статус остаётся как запасной сигнал.
  const contractSigned =
    contractDoc?.status === "uploaded" ||
    (selectedProject?.contractSigned ?? projectState.contractSigned);
  const uploadsLocked = !contractSigned;

  const reviewInFlight = reviewStage === "pending_accountant" || reviewStage === "pending_director";
  // После полного согласования (approved) PM больше не может редактировать
  // документов — блокировка остаётся навсегда, а не только до завершения проекта.
  const docsLocked = completed || uploadsLocked || reviewInFlight || reviewStage === "approved";

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

  // Кнопка «Отправить на проверку» доступна PM в любой момент после
  // подписания договора, как только все обязательные документы загружены —
  // без привязки к статусу склада (раньше требовался статус «Ожидание
  // документов», из-за чего PM не мог отправить пакет на проверку, пока
  // склад полностью не пройдёт закуп/приход/отгрузку).
  const tooltipReview = !allUploaded
    ? "Загрузите все документы сначала"
    : "";

  const [submittingReview, setSubmittingReview] = useState(false);
  const [decidingReview,   setDecidingReview]   = useState(false);
  const [completing,       setCompleting]       = useState(false);
  const [rejectDraft,      setRejectDraft]      = useState("");
  const [showRejectBox,    setShowRejectBox]    = useState(false);
  
  const poaFileRef = useRef<HTMLInputElement>(null);
  const waybillFileRef = useRef<HTMLInputElement>(null);
  const contractFileRef = useRef<HTMLInputElement>(null);

  const today = () => new Date().toLocaleDateString("ru-RU");

  // Кастомное модальное окно подтверждения удаления (вместо window.confirm)
  const [docToDelete, setDocToDelete] = useState<ProjectDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  const handleDeleteDoc = (doc: ProjectDocument) => {
    if (docsLocked) return;
    setDocToDelete(doc);
  };

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return;
    setDeletingDoc(true);
    try {
      if (docToDelete.backendDocument?.id) {
        await deleteProjectDocument(docToDelete.backendDocument.id);
      }
      documentsStore.removeDocument(selectedProjectId, docToDelete.id);
      setDocToDelete(null);
    } catch (e) {
      console.error(e);
      alert("Не удалось удалить документ. Проверьте соединение с сервером.");
    } finally {
      setDeletingDoc(false);
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

  // Бухгалтер загружает финальный (проверенный/отредактированный) файл
  // договора сюда после того, как сгенерировал черновик на странице
  // "Договор". После успешной загрузки переводим проект из "Ожидание
  // подписания" в "Активный закуп" через markContractUploaded (мягко: если
  // это не удастся, сам факт загрузки файла всё равно достаточен для
  // contractSigned выше, а PM всегда может попробовать снова).
  const handleContractUpload = async (file: File | undefined) => {
    if (!file || !selectedProjectId) return;
    setUploadingContract(true);
    try {
      const uploadedDoc = await uploadProjectDocument(selectedProjectId, "contract", file, "Договор");

      documentsStore.updateDocument(selectedProjectId, `${selectedProjectId}-contract`, {
        status: "uploaded",
        date: today(),
        fileName: file.name,
        backendDocument: uploadedDoc,
      });

      try {
        await markContractUploaded(selectedProjectId);
      } catch (statusError) {
        console.error("Не удалось обновить статус проекта после загрузки договора:", statusError);
      }
    } catch (error) {
      console.error(error);
      alert("Не удалось загрузить договор. Попробуйте еще раз.");
    } finally {
      setUploadingContract(false);
    }
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

  // ОБНОВЛЕНО: Делаем запрос к бэкенду для смены статуса проекта на Завершен
  const handleComplete = async () => {
    setCompleting(true);
    try {
      await documentsStore.completeProject(selectedProjectId);
    } catch (error) {
      console.error(error);
      alert("Не удалось завершить проект. Проверьте соединение с сервером.");
    } finally {
      setCompleting(false);
    }
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
      generated: "bg-blue-50 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-400/25",
      approved:  "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-400/25",
      uploaded:  "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-400/25",
      pending:   "bg-orange-50 dark:bg-orange-400/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-400/25",
    };
    return (
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
        {statusLabel(status)}
      </span>
    );
  }

  const categoryIcon = (category: ProjectDocument["category"]) => {
    if (category === "kp")                return <FileText   size={14} className="text-blue-500 dark:text-blue-400"   />;
    if (category === "contract")          return <Handshake  size={14} className="text-emerald-500 dark:text-emerald-400"/>;
    if (category === "invoice")           return <FileCheck  size={14} className="text-amber-500 dark:text-amber-400"  />;
    if (category === "waybill")           return <ReceiptIcon size={14} className="text-purple-500 dark:text-purple-400" />;
    if (category === "power_of_attorney") return <Lock       size={14} className="text-destructive"    />;
    return <FileText size={14} className="text-muted-foreground" />;
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
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground hover:border-primary/40 transition-colors"
      >
        <span className="font-medium truncate">{selectedProjectName}</span>
        <ChevronDown size={15} className={`text-muted-foreground flex-shrink-0 transition-transform ${selectorOpen ? "rotate-180" : ""}`} />
      </button>
      {selectorOpen && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search size={13} className="text-muted-foreground" />
            <input
              autoFocus
              value={projectQuery}
              onChange={e => setProjectQuery(e.target.value)}
              placeholder="Поиск проекта…"
              className="w-full text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
          
          {/* НОВЫЙ БЛОК С ЧЕКБОКСОМ */}
          <div className="px-3 py-2 border-b border-border bg-background">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAllProjects}
                onChange={(e) => setShowAllProjects(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary cursor-pointer"
              />
              Показывать завершенные проекты
            </label>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filteredProjects.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedProjectId(p.id); setSelectorOpen(false); setProjectQuery(""); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 transition-colors ${p.id === selectedProjectId ? "bg-blue-50 dark:bg-blue-400/15 text-primary font-medium" : "text-foreground"}`}
              >
                {p.name}
              </button>
            ))}
            {filteredProjects.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground">Ничего не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderSharedDocumentList = () => (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Все документы проекта</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          КП, договор, доверенность, счета и накладные — в одном месте, доступны для скачивания на любом этапе
        </p>
      </div>
      {displayDocs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground text-center">Документов пока нет</p>
      ) : (
        <div className="divide-y divide-border">
          {displayDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {categoryIcon(doc.category)}
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{doc.date || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {statusBadge(doc.status)}
                {doc.status !== "pending" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded hover:bg-accent transition-colors"
                    >
                      <Download size={12} />Скачать
                    </button>
                    {!docsLocked && !doc.id.includes("placeholder") && !['kp', 'contract', 'invoice'].includes(doc.category) && (
                      <AppTooltip text="Удалить документ">
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          className="flex items-center justify-center text-muted-foreground hover:text-destructive p-1.5 rounded hover:bg-red-50 dark:bg-red-400/15 transition-colors"
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
          <div className="bg-card rounded-lg border border-primary/30 p-5 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                {role === "accountant"
                  ? "Менеджер запросил проверку файлов"
                  : "Бухгалтер подтвердил файлы — требуется ваше решение"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Проверьте документы ниже и примите решение.</p>

            {showRejectBox ? (
              <div className="space-y-2">
                <textarea
                  value={rejectDraft}
                  onChange={e => setRejectDraft(e.target.value)}
                  placeholder="Комментарий для менеджера (необязательно)…"
                  rows={2}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-primary/50"
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
                    className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
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
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-success text-success-foreground hover:bg-success/90 transition-colors disabled:opacity-60"
                >
                  {decidingReview ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}Принять
                </button>
                <button
                  onClick={() => setShowRejectBox(true)}
                  disabled={decidingReview}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-400/25 text-destructive hover:bg-red-50 dark:bg-red-400/15 transition-colors disabled:opacity-60"
                >
                  <X size={14} />Отклонить
                </button>
              </div>
            )}
          </div>
        )}
        {!waitingOnMe && reviewStage === "pending_accountant" && role === "commercial_director" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-background rounded-lg border border-border mb-4">
            <Clock size={16} className="text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground">Ожидается проверка бухгалтера, затем запрос поступит вам.</p>
          </div>
        )}
        {!waitingOnMe && reviewStage === "pending_director" && role === "accountant" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-400/15 rounded-lg border border-green-200 dark:border-green-400/25 mb-4">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Вы подтвердили файлы. Сейчас на проверке у коммерческого директора.</p>
          </div>
        )}
        {reviewStage === "approved" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-400/15 rounded-lg border border-green-200 dark:border-green-400/25 mb-4">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Файлы подтверждены по всей цепочке согласования.</p>
          </div>
        )}
        {reviewStage === "rejected" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-400/15 rounded-lg border border-amber-200 dark:border-amber-400/25 mb-4">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {rejectedBy === myRole
                ? "Вы отклонили проверку. Ожидается повторная загрузка от менеджера."
                : `Отклонено (${rejectedBy ? ROLE_LABEL[rejectedBy] : "—"}). Ожидается повторная загрузка от менеджера.`}
            </p>
          </div>
        )}
        {reviewStage === "none" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-background rounded-lg border border-border mb-4">
            <Clock size={16} className="text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground">Менеджер ещё не отправил документы на проверку.</p>
          </div>
        )}

        {/* Загрузка финального договора — только бухгалтер. Черновик
            генерируется на странице "Договор"; сюда попадает уже
            проверенный/исправленный файл. */}
        {role === "accountant" && (
          <div className="bg-card rounded-lg border border-border p-5 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Handshake size={16} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Договор</p>
                  <p className="text-xs text-muted-foreground">
                    {contractUploaded
                      ? `Загружен · ${contractDoc?.date || "—"}`
                      : "Сгенерируйте на странице «Договор», проверьте и загрузите готовый файл сюда."}
                  </p>
                </div>
              </div>

              {contractUploaded ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-400/20 rounded-full flex-shrink-0">
                  <CheckCircle2 size={13} className="text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Загружен</span>
                </span>
              ) : (
                <button
                  onClick={() => !uploadingContract && contractFileRef.current?.click()}
                  disabled={uploadingContract}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex-shrink-0 ${
                    uploadingContract
                      ? "bg-muted text-muted-foreground cursor-wait"
                      : "bg-primary hover:bg-primary/90 text-white cursor-pointer"
                  }`}
                >
                  {uploadingContract ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploadingContract ? "Загрузка…" : "Загрузить договор"}
                </button>
              )}
            </div>

            <input
              ref={contractFileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleContractUpload(file);
                e.target.value = "";
              }}
            />
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
    <>
    <PageWrap
      title="Документы"
      subtitle={`${selectedProjectName}${completed ? " · Архив (только чтение)" : ""}`}
    >
      {projectSelector}
      {reviewStage === "pending_accountant" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-400/15 rounded-lg border border-blue-100 dark:border-blue-400/20 mb-4">
          <Clock size={16} className="text-primary flex-shrink-0" />
          <p className="text-sm font-medium text-primary">Ожидается проверка бухгалтера</p>
        </div>
      )}
      {reviewStage === "pending_director" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-400/15 rounded-lg border border-blue-100 dark:border-blue-400/20 mb-4">
          <Clock size={16} className="text-primary flex-shrink-0" />
          <p className="text-sm font-medium text-primary">Бухгалтер подтвердил — ожидается решение коммерческого директора</p>
        </div>
      )}
      {reviewStage === "rejected" && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-400/15 rounded-lg border border-amber-200 dark:border-amber-400/25 mb-4">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {rejectedBy ? `Отклонено: ${ROLE_LABEL[rejectedBy]}` : "Проверка отклонена"}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {rejectReason ? rejectReason : "Обновите документы и отправьте на проверку повторно."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="col-span-2 space-y-5">
          {renderSharedDocumentList()}

          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Прогресс загрузки документов</h2>
              <span className={`text-sm font-semibold ${allUploaded ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                {doneDocCount}/{requiredDocCount}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${allUploaded ? "bg-green-500" : "bg-primary"}`}
                style={{ width: `${(doneDocCount / requiredDocCount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {completed
                ? "Проект завершён — документы доступны в архиве."
                : allUploaded
                ? "Все документы загружены."
                : `Осталось ${requiredDocCount - doneDocCount} документа`}
            </p>
          </div>

          {!reviewInFlight && reviewStage !== "approved" && !completed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Доверенность: Dropzone */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lock size={14} className="text-destructive" />Доверенности
              </h3>
              <div className="relative w-full group">
              <div
                onDragOver={e => { if (!docsLocked) e.preventDefault(); }}
                onDrop={handlePoaDrop}
                onClick={() => !docsLocked && poaFileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-1.5 min-h-[112px] w-full px-4 rounded-lg border-2 border-dashed text-center transition-all ${
                  docsLocked || uploadingPoa
                    ? "border-border bg-background cursor-not-allowed"
                    : "border-border hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <input ref={poaFileRef} type="file" className="hidden" onChange={handlePoaInput} />
                {docsLocked || uploadingPoa
                  ? (uploadingPoa ? <Loader2 size={18} className="text-blue-500 dark:text-blue-400 animate-spin" /> : <Lock size={18} className="text-muted-foreground" />)
                  : <Upload size={18} className="text-muted-foreground" />}
                {docsLocked ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-muted-foreground">Недоступно</span>
                    <br />
                    {uploadsLocked ? "до подписания договора" : "проверка документов"}
                  </p>
                ) : uploadingPoa ? (
                  <p className="text-xs text-muted-foreground">Загрузка...</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-primary">Выберите файл</span>
                    <br />
                    или перетащите — можно несколько
                  </p>
                )}
              </div>
              {uploadsLocked && (
                <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-10">
                  Доступно только после подписания договора
                </div>
              )}
              </div>
            </div>

            {/* Накладные: Dropzone */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ReceiptIcon size={14} className="text-purple-500 dark:text-purple-400" />Накладные
              </h3>
              <div className="relative w-full group">
              <div
                onDragOver={e => { if (!docsLocked) e.preventDefault(); }}
                onDrop={handleWaybillDrop}
                onClick={() => !docsLocked && waybillFileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-1.5 min-h-[112px] w-full px-4 rounded-lg border-2 border-dashed text-center transition-all ${
                  docsLocked || uploadingWaybill
                    ? "border-border bg-background cursor-not-allowed"
                    : "border-border hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                }`}
              >
                <input ref={waybillFileRef} type="file" className="hidden" onChange={handleWaybillInput} />
                {docsLocked || uploadingWaybill
                  ? (uploadingWaybill ? <Loader2 size={18} className="text-blue-500 dark:text-blue-400 animate-spin" /> : <Lock size={18} className="text-muted-foreground" />)
                  : <Upload size={18} className="text-muted-foreground" />}
                {docsLocked ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-muted-foreground">Недоступно</span>
                    <br />
                    {uploadsLocked ? "до подписания договора" : "проверка документов"}
                  </p>
                ) : uploadingWaybill ? (
                  <p className="text-xs text-muted-foreground">Загрузка...</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-primary">Выберите файл</span>
                    <br />
                    или перетащите — можно несколько
                  </p>
                )}
              </div>
              {uploadsLocked && (
                <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-10">
                  Доступно только после подписания договора
                </div>
              )}
              </div>
            </div>
          </div>
          )}

        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Согласование</h3>
            {reviewStage === "approved" && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-400/15 rounded-lg border border-green-200 dark:border-green-400/25">
                <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">Согласовано ✅</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Бухгалтер и директор подтвердили файлы</p>
                </div>
              </div>
            )}
            {(reviewStage === "pending_accountant" || reviewStage === "pending_director") && (
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-400/15 rounded-lg border border-blue-100 dark:border-blue-400/20">
                <Clock size={16} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">
                    {reviewStage === "pending_accountant" ? "На проверке у бухгалтера" : "На проверке у директора"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ожидаем решение</p>
                </div>
              </div>
            )}
            {(reviewStage === "none" || reviewStage === "rejected") && (
              <div className="space-y-2">
                {reviewStage === "rejected" && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                    Отклонено{rejectedBy ? ` (${ROLE_LABEL[rejectedBy]})` : ""}{rejectReason ? `: ${rejectReason}` : ""}. Обновите файлы и отправьте повторно.
                  </p>
                )}
                
                {/* ОБНОВЛЕНО: Используем новый тултип и блокируем кнопку */}
                <AppTooltip text={tooltipReview}>
                  <button
                    onClick={() => allUploaded && handleSubmitForReview()}
                    disabled={!allUploaded || submittingReview}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      allUploaded
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
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

          <div className="bg-card rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Статус</h3>
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
                  <span className={`text-xs ${item.done ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {completed ? (
            <div className="space-y-2">
              <div className="w-full py-3 rounded-lg text-sm font-semibold bg-green-50 dark:bg-green-400/15 border border-green-200 dark:border-green-400/25 text-green-700 dark:text-green-300 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} />Проект завершён · архив
              </div>
              <button
                onClick={() => onNavigate("dashboard")}
                className="w-full py-2 text-xs text-muted-foreground hover:text-primary transition-colors"
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
                      ? "bg-success text-success-foreground hover:bg-success/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {completing
                    ? <><Loader2 size={15} className="animate-spin" />Завершение…</>
                    : <><CheckCircle2 size={15} />Завершить проект</>}
                </button>
              </AppTooltip>
              {!canComplete && (
                <p className="text-xs text-muted-foreground text-center">{tooltipComplete}</p>
              )}
            </>
          )}

        </div>
      </div>
    </PageWrap>

    {docToDelete && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
        onClick={() => !deletingDoc && setDocToDelete(null)}
      >
        <div
          className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-400/15">
              <Trash2 size={18} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Удалить документ?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Вы точно уверены, что хотите удалить «{docToDelete.name}»?
                Это действие нельзя отменить.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={deletingDoc}
              onClick={() => setDocToDelete(null)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={deletingDoc}
              onClick={confirmDeleteDoc}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deletingDoc ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Удаление…
                </>
              ) : (
                "Удалить"
              )}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}