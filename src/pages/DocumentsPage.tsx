import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { PageWrap } from "../app/components/common/PageWrap";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import type { Page, ProjectState, Role } from "../types";
import {
  CheckCircle2, Clock, Download, Loader2, Upload, Check, FileCheck,
  FileText, Receipt as ReceiptIcon, ChevronDown, Search, Lock, X,
  Send, AlertTriangle,
} from "lucide-react";
import {
  documentsStore, fetchProjects,
  type ProjectDocument, type DocStatus, type ReviewStage, type Rejector,
  type ProjectSummary,
} from "../store/documentsStore";

// Roles that only ever view/download and approve/reject — never upload.
const REVIEWER_ROLES: Role[] = ["accountant", "commercial_director"];

const ROLE_LABEL: Record<Rejector, string> = {
  accountant: "бухгалтер",
  commercial_director: "коммерческий директор",
};

export function DocumentsPage({
  onNavigate,
  projectState,
  role,
}: {
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  role: Role;
}) {
  // --- Project selection ---------------------------------------------------
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchProjects()
      .then(data => {
        if (cancelled) return;
        setProjects(data);
        if (data.length > 0) setSelectedProjectId(data[0].id);
      })
      .catch(err => {
        if (!cancelled) setProjectsError(err instanceof Error ? err.message : "Не удалось загрузить проекты");
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? projects[0];
  const contractSigned = projects.length > 0 && selectedProjectId === projects[0].id
    ? projectState.contractSigned
    : selectedProject?.contractSigned ?? true;
  const uploadsLocked = !contractSigned;

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectQuery.toLowerCase())
  );

  // --- Shared review + document state (documentsStore) ----------------------
  const review = useSyncExternalStore(
    documentsStore.subscribe,
    () => documentsStore.getReviewSnapshot(selectedProjectId)
  );
  const { stage: reviewStage, rejectedBy, rejectReason, completed } = review;

  const allDocs = useSyncExternalStore(
    documentsStore.subscribe,
    () => documentsStore.getSnapshot(selectedProjectId)
  );

  // Docs can be edited by the PM only while: contract signed, project not completed,
  // and there's no review currently in flight with the accountant/director.
  const reviewInFlight = reviewStage === "pending_accountant" || reviewStage === "pending_director";
  const docsLocked = completed || uploadsLocked || reviewInFlight;

  const closingDocs = allDocs.filter(d => d.category === "closing");
  const receiptDoc  = allDocs.find(d => d.category === "receipt");
  const requiredDocs = allDocs.filter(d => d.required);
  const done        = requiredDocs.filter(d => d.status === "uploaded").length;
  const allUploaded = requiredDocs.length > 0 && done === requiredDocs.length;
  const canComplete = allUploaded && reviewStage === "approved" && !completed;

  const [submittingReview, setSubmittingReview] = useState(false);
  const [decidingReview,   setDecidingReview]   = useState(false);
  const [completing,       setCompleting]       = useState(false);
  const [generatingKp,     setGeneratingKp]     = useState(false);
  const [rejectDraft,      setRejectDraft]      = useState("");
  const [showRejectBox,    setShowRejectBox]    = useState(false);
  const receiptFileRef = useRef<HTMLInputElement>(null);

  if (projectsLoading) {
    return (
      <PageWrap title="Документы" subtitle="Загрузка проектов…">
        <div className="flex items-center gap-2 text-sm text-slate-400 px-1 py-4">
          <Loader2 size={15} className="animate-spin" />Загрузка проектов…
        </div>
      </PageWrap>
    );
  }

  if (projectsError || !selectedProject) {
    return (
      <PageWrap title="Документы" subtitle="Ошибка">
        <div className="flex items-center gap-2 text-sm text-red-600 px-1 py-4">
          <AlertTriangle size={15} />
          {projectsError ?? "Проекты не найдены"}
        </div>
      </PageWrap>
    );
  }

  const today = () => new Date().toLocaleDateString("ru-RU");

  const markUploaded = (docId: string) => {
    documentsStore.updateDocument(selectedProjectId, docId, { status: "uploaded" as DocStatus, date: today() });
  };

  const handleReceiptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (docsLocked || !receiptDoc) return;
    markUploaded(receiptDoc.id);
  };

  const handleReceiptInput = () => {
    if (docsLocked || !receiptDoc) return;
    markUploaded(receiptDoc.id);
  };

  // PM: send the uploaded package off — first stop is the accountant
  const handleSubmitForReview = () => {
    setSubmittingReview(true);
    setTimeout(() => {
      setSubmittingReview(false);
      documentsStore.submitForReview(selectedProjectId);
    }, 1000);
  };

  // Accountant: pass along to the commercial director
  const handleAccountantAccept = () => {
    setDecidingReview(true);
    setTimeout(() => {
      setDecidingReview(false);
      documentsStore.accountantApprove(selectedProjectId);
    }, 900);
  };

  // Accountant: send back to the PM
  const handleAccountantReject = () => {
    setDecidingReview(true);
    setTimeout(() => {
      setDecidingReview(false);
      documentsStore.accountantReject(selectedProjectId, rejectDraft.trim() || undefined);
      setRejectDraft("");
      setShowRejectBox(false);
    }, 900);
  };

  // Commercial director: final approval — PM may now finish the project
  const handleDirectorAccept = () => {
    setDecidingReview(true);
    setTimeout(() => {
      setDecidingReview(false);
      documentsStore.directorApprove(selectedProjectId);
    }, 900);
  };

  // Commercial director: send back to the PM
  const handleDirectorReject = () => {
    setDecidingReview(true);
    setTimeout(() => {
      setDecidingReview(false);
      documentsStore.directorReject(selectedProjectId, rejectDraft.trim() || undefined);
      setRejectDraft("");
      setShowRejectBox(false);
    }, 900);
  };

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => {
      setCompleting(false);
      documentsStore.completeProject(selectedProjectId);
    }, 1600);
  };

  // PM: generate the Commercial Proposal (KP) doc for the current project —
  // adds it to the archive with a "Generated" status.
  const handleGenerateKp = () => {
    setGeneratingKp(true);
    setTimeout(() => {
      setGeneratingKp(false);
      documentsStore.registerGeneratedKP(selectedProjectId);
    }, 900);
  };

  const handleDownload = (doc: ProjectDocument) => {
    const content = `Документ: ${doc.name}\nПроект: ${selectedProject.name}\nСтатус: ${statusLabel(doc.status)}\nДата: ${doc.date || "—"}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${doc.name}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  function statusLabel(status: DocStatus) {
    if (status === "generated") return "Сгенерирован";
    if (status === "uploaded")  return "Загружен";
    return "Ожидается";
  }

  function statusBadge(status: DocStatus) {
    const styles: Record<DocStatus, string> = {
      generated: "bg-blue-50 text-blue-700 border-blue-200",
      uploaded:  "bg-green-50 text-green-700 border-green-200",
      pending:   "bg-slate-50 text-slate-500 border-slate-200",
    };
    return (
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
        {statusLabel(status)}
      </span>
    );
  }

  const categoryIcon = (category: ProjectDocument["category"]) => {
    if (category === "kp")      return <FileText   size={14} className="text-blue-500"   />;
    if (category === "receipt") return <ReceiptIcon size={14} className="text-purple-500" />;
    return <FileCheck size={14} className="text-slate-400" />;
  };

  const tooltipComplete = !allUploaded
    ? `Загрузите все документы (${done}/${requiredDocs.length})`
    : reviewStage !== "approved"
    ? "Ожидается подтверждение бухгалтера и директора"
    : "";

  const projectSelector = (
    <div className="relative mb-4 max-w-sm">
      <button
        onClick={() => setSelectorOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-slate-700 hover:border-[#2563EB]/40 transition-colors"
      >
        <span className="font-medium truncate">{selectedProject.name}</span>
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

  const readOnlyDocList = (
    <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0]">
        <h2 className="text-sm font-semibold text-slate-900">Документы проекта</h2>
        <p className="text-xs text-slate-400 mt-0.5">Только просмотр и скачивание</p>
      </div>
      {allDocs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">Документов пока нет</p>
      ) : (
        <div className="divide-y divide-[#E2E8F0]">
          {allDocs.map(doc => (
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
                  <button
                    onClick={() => handleDownload(doc)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#2563EB] px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    <Download size={12} />Скачать
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ==========================================================================
  // REVIEWER VIEW (accountant / commercial_director) — read-only: see what's
  // uploaded, download it, and approve/reject a pending request addressed to
  // this role. Never uploads, never asks anyone else for permission.
  // ==========================================================================
  if (REVIEWER_ROLES.includes(role)) {
    const myRole = role as Rejector;
    const waitingOnMe =
      (role === "accountant" && reviewStage === "pending_accountant") ||
      (role === "commercial_director" && reviewStage === "pending_director");

    const handleAccept = role === "accountant" ? handleAccountantAccept : handleDirectorAccept;
    const handleReject = role === "accountant" ? handleAccountantReject : handleDirectorReject;

    return (
      <PageWrap title="Документы" subtitle={selectedProject.name}>
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

        {readOnlyDocList}
      </PageWrap>
    );
  }

  // ==========================================================================
  // PM VIEW
  // ==========================================================================
  return (
    <PageWrap
      title="Документы"
      subtitle={`${selectedProject.name}${completed ? " · Архив (только чтение)" : ""}`}
    >
      {projectSelector}

      {/* Status of where the request currently sits */}
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

      {/* Rejection notice — only surfaces when it was sent back */}
      {reviewStage === "rejected" && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700">
              {rejectedBy ? `Отклонено: ${ROLE_LABEL[rejectedBy]}` : "Проверка отклонена"}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {rejectReason ? rejectReason : "Обновите закрывающие документы и отправьте на проверку повторно."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mt-4">
        <div className="col-span-2 space-y-5">

          {/* General document archive */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Все документы проекта</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  КП, закрывающие документы и расписка — в одном месте, доступны для скачивания на любом этапе
                </p>
              </div>
              <button
                onClick={handleGenerateKp}
                disabled={generatingKp}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {generatingKp
                  ? <><Loader2 size={13} className="animate-spin" />Генерация…</>
                  : <><FileText size={13} />Сгенерировать КП</>}
              </button>
            </div>
            {allDocs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">Документов пока нет</p>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {allDocs.map(doc => (
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
                        <button
                          onClick={() => handleDownload(doc)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#2563EB] px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          <Download size={12} />Скачать
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Прогресс загрузки закрывающих документов</h2>
              <span className={`text-sm font-semibold ${allUploaded ? "text-green-600" : "text-slate-600"}`}>
                {done}/{requiredDocs.length}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${allUploaded ? "bg-green-500" : "bg-[#2563EB]"}`}
                style={{ width: `${requiredDocs.length ? (done / requiredDocs.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              {completed
                ? "Проект завершён — документы доступны в архиве."
                : allUploaded
                ? "Все документы загружены."
                : `Осталось ${requiredDocs.length - done} документа`}
            </p>
          </div>

          {/* Closing docs checklist — no drag-and-drop zone */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            <div className="divide-y divide-[#E2E8F0]">
              {closingDocs.map(doc => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between px-5 py-4 transition-colors ${doc.status === "uploaded" ? "bg-green-50/30" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => !docsLocked && markUploaded(doc.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                        doc.status === "uploaded"
                          ? "bg-[#16A34A] border-[#16A34A]"
                          : docsLocked
                          ? "border-slate-200 cursor-not-allowed opacity-50"
                          : "border-[#E2E8F0] hover:border-[#2563EB] cursor-pointer"
                      }`}
                    >
                      {doc.status === "uploaded" && <Check size={11} className="text-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${doc.status === "uploaded" ? "text-slate-500 line-through" : "text-slate-800"}`}>
                        {doc.name}
                      </p>
                      {doc.status === "uploaded" && (
                        <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                          <CheckCircle2 size={10} />Загружен · {doc.date}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.status === "uploaded" ? (
                      reviewStage === "rejected" ? (
                        // Rejected: let the PM replace this file
                        <AppTooltip text="Заменить файл">
                          <button
                            onClick={() => markUploaded(doc.id)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#E2E8F0] text-slate-600 rounded-md hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                          >
                            <Upload size={12} />Заменить
                          </button>
                        </AppTooltip>
                      ) : (
                        <button
                          onClick={() => handleDownload(doc)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                        >
                          <Download size={12} />Скачать
                        </button>
                      )
                    ) : (
                      <AppTooltip text={docsLocked ? (
                        completed ? "Проект завершён"
                        : reviewStage === "pending_accountant" ? "На проверке у бухгалтера"
                        : reviewStage === "pending_director" ? "На проверке у коммерческого директора"
                        : "Доступно после отгрузки товаров клиенту"
                      ) : ""}>
                        <button
                          onClick={() => !docsLocked && markUploaded(doc.id)}
                          disabled={docsLocked}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-md transition-colors ${
                            docsLocked
                              ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50"
                              : "border-[#E2E8F0] text-slate-600 hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-blue-50"
                          }`}
                        >
                          <Upload size={12} />Загрузить
                        </button>
                      </AppTooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Чек от клиента — separate upload area */}
          {receiptDoc && (
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <ReceiptIcon size={14} className="text-purple-500" />Чек от клиента
              </h3>
              {receiptDoc.status === "uploaded" ? (
                <div className="flex items-center justify-between px-4 py-3 bg-green-50/30 border border-green-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-[#16A34A]">
                      <Check size={11} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500 line-through">{receiptDoc.name}</p>
                      <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 size={10} />Загружен · {receiptDoc.date}
                      </p>
                    </div>
                  </div>
                  {reviewStage === "rejected" ? (
                    <button
                      onClick={() => markUploaded(receiptDoc.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#2563EB] px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      <Upload size={12} />Заменить
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownload(receiptDoc)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                    >
                      <Download size={12} />Скачать
                    </button>
                  )}
                </div>
              ) : (
                <div
                  onDragOver={e => { if (!docsLocked) e.preventDefault(); }}
                  onDrop={handleReceiptDrop}
                  onClick={() => !docsLocked && receiptFileRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                    docsLocked
                      ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                      : "border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-blue-50/20 cursor-pointer"
                  }`}
                >
                  <input ref={receiptFileRef} type="file" className="hidden" onChange={handleReceiptInput} />
                  {docsLocked
                    ? <Lock size={18} className="mx-auto mb-1.5 text-slate-400" />
                    : <Upload size={18} className="mx-auto mb-1.5 text-slate-400" />}
                  <p className="text-xs text-slate-500">
                    {docsLocked ? "Недоступно" : <><span className="text-[#2563EB]">Выберите файл</span> или перетащите сюда</>}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Approval chain */}
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

          {/* Summary */}
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

          {/* Complete action / read-only state */}
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
