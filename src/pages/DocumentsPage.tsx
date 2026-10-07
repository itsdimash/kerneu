import { useEffect, useMemo, useState, useRef, useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { PageWrap } from "../app/components/common/PageWrap";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { DocumentDropzone } from "../app/components/common/DocumentDropzone";
import { DocStatusPill, docStatusLabel } from "../app/components/common/DocStatusPill";
import { OnecImportButton } from "../app/components/common/OnecImportButton";
import { NotRequiredMark } from "../app/components/common/NotRequiredMark";
import { useDocumentsState } from "../hooks/useDocumentsState";
import type { Page, ProjectState, Role } from "../types";
import {
  CheckCircle2, Clock, Download, Loader2, Upload, Check, FileCheck,
  FileText, Receipt as ReceiptIcon, ChevronDown, Search, Lock, X,
  Send, AlertTriangle, Trash2, Handshake, RefreshCw
} from "lucide-react";
import {
  documentsStore,
  type DocCategory, type ProjectDocument, type DocStatus,
  type ProjectSummary, type Rejector,
} from "../store/documentsStore";
import {
  downloadProjectDocument,
  uploadProjectDocument,
  deleteProjectDocument,
  markContractUploaded,
  markNoContract,
  type ContractMode,
  type NotRequiredCategory,
  type ProjectDocumentResponse,
} from "../api/api";
import { type OnecDocType } from "../api/onec";
import { OnecDocumentSearchModal } from "./OnecDocumentSearchModal";

const API_BASE = "/api/v1";

// Тот же изгиб, что и --ease-out-strong в theme.css (как в BackgroundJobsToast).
const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const;

type ProjectApiItem = {
  id: number;
  name: string;
  contract_signed?: boolean;
  status_name?: string;
  status?: string | { status_name?: string };
  is_express?: boolean;
  contract_mode?: ContractMode;
  contract_mode_at?: string | null;
};

// ИЗМЕНЕНО: шаг бухгалтера убран из цепочки согласования документов —
// теперь единственный согласующий это директор.
const REVIEWER_ROLES: Role[] = ["commercial_director"];

type StageTone = "info" | "success" | "warning" | "neutral";

// Шесть баннеров состояния на странице были собраны вручную и разъехались:
// разные отступы (items-center/items-start), разные оттенки рамки
// (blue-100 против amber-200), сырые цвета вместо токенов темы. Теперь один
// компонент на токенах — как InfoBanner в common/, но с заголовком и
// подписью, которые здесь нужны.
const STAGE_TONE: Record<StageTone, { box: string; title: string; hint: string; icon: string }> = {
  info:    { box: "bg-info-muted border-info/25",         title: "text-info",    hint: "text-muted-foreground", icon: "text-info" },
  success: { box: "bg-success-muted border-success/25",   title: "text-success", hint: "text-success",         icon: "text-success" },
  warning: { box: "bg-warning-muted border-warning/25",   title: "text-warning", hint: "text-warning",         icon: "text-warning" },
  neutral: { box: "bg-muted border-border",               title: "text-foreground", hint: "text-muted-foreground", icon: "text-muted-foreground" },
};

function StageBanner({
  tone, icon: Icon, title, hint,
}: {
  tone: StageTone;
  icon: typeof Clock;
  title: string;
  hint?: string;
}) {
  const t = STAGE_TONE[tone];
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 mb-4 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-300 ease-out-strong ${t.box}`}>
      <Icon size={16} className={`flex-shrink-0 mt-0.5 ${t.icon}`} />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${t.title}`}>{title}</p>
        {hint && <p className={`text-xs mt-0.5 leading-relaxed ${t.hint}`}>{hint}</p>}
      </div>
    </div>
  );
}

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

function normalizeProject(item: ProjectApiItem): ProjectSummary {
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
    isExpress: item.is_express === true,
    contractMode: item.contract_mode ?? null,
    contractModeAt: item.contract_mode_at ?? null,
  };
}

// Статус счёта поставщика из «Закупок» (draft → на проверке → одобрен → приход).
// В прогресс идут только «Одобрен» и «В приходе».
const INVOICE_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:                  { label: "Черновик",   cls: "text-muted-foreground bg-muted ring-border" },
  pending_accountant:     { label: "На проверке", cls: "text-info bg-info-muted ring-info/25" },
  pending_director:       { label: "На проверке", cls: "text-info bg-info-muted ring-info/25" },
  rejected_by_accountant: { label: "Отклонён",   cls: "text-destructive bg-destructive-muted ring-destructive/20" },
  rejected_by_director:   { label: "Отклонён",   cls: "text-destructive bg-destructive-muted ring-destructive/20" },
  approved:               { label: "Одобрен",    cls: "text-success bg-success-muted ring-success/25" },
  income:                 { label: "В приходе",  cls: "text-success bg-success-muted ring-success/25" },
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const v = INVOICE_STATUS_LABEL[status] ?? INVOICE_STATUS_LABEL.draft;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${v.cls}`}>
      {v.label}
    </span>
  );
}

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

  const [uploadingPoa, setUploadingPoa] = useState(false);
  const [uploadingWaybill, setUploadingWaybill] = useState(false);
  // Счёт на оплату покупателю — новая, необязательная категория (см.
  // paymentInvoicePlaceholder ниже).
  const [uploadingPaymentInvoice, setUploadingPaymentInvoice] = useState(false);
  // Финальный (проверенный/исправленный) файл договора загружается здесь, а
  // не на странице "Договор". Генерация черновика происходит на странице
  // "Договор" (PM, бухгалтер, директор), а сюда приносят уже готовый,
  // вычитанный файл. Загрузить/заменить может любой, у кого есть доступ к
  // сделке — PM, бухгалтер или директор.
  const [uploadingContract, setUploadingContract] = useState(false);

  // Состояние документов (категории, нужна ли закупка, стадия проверки) —
  // из GET /documents/project/{id}/state. Пока не загружено (null), требуем
  // документы по умолчанию, как раньше, чтобы не мигать UI.
  const { state: docState, refetch: refetchState, setNotRequired, unsetNotRequired } =
    useDocumentsState(selectedProjectId);

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
        const normalizedProjects = data.map(normalizeProject);

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

  const mapBackendDoc = (item: ProjectDocumentResponse): Omit<ProjectDocument, "projectId"> => ({
    id: `backend-${item.id}`,
    name: item.name,
    category: item.category as DocCategory,
    status: "uploaded",
    date: new Date(item.created_at).toLocaleDateString("ru-RU"),
    fileName: item.file_name,
    backendDocument: item,
  });

  const archivedKps = useMemo<ProjectDocument[]>(
    () =>
      (docState?.documents ?? [])
        .filter((item) => item.category === "kp")
        .map((item) => ({
          ...mapBackendDoc(item),
          projectId: String(item.project_id),
          status: (item.status === "approved"
            ? "approved"
            : item.status === "rejected"
            ? "rejected"
            : "generated") as DocStatus,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docState],
  );

  // Каждый ответ /state сверяется со стором: новые документы добавляются,
  // изменившиеся (статус счёта, имя) обновляются, удалённые (например, в
  // «Закупках») пропадают.
  useEffect(() => {
    if (!docState || !selectedProjectId) return;

    const apiContract = docState.documents.find(d => d.category === "contract");
    if (apiContract) {
      documentsStore.updateDocument(selectedProjectId, `${selectedProjectId}-contract`, {
        status: "uploaded",
        date: new Date(apiContract.created_at).toLocaleDateString("ru-RU"),
        fileName: apiContract.file_name,
        backendDocument: apiContract,
      });
    }

    documentsStore.reconcileBackendDocuments(
      selectedProjectId,
      ["power_of_attorney", "waybill", "invoice", "payment_invoice"],
      docState.documents
        .filter(d => ["power_of_attorney", "waybill", "invoice", "payment_invoice"].includes(d.category))
        .map(mapBackendDoc),
    );
    documentsStore.syncReviewStage(selectedProjectId, docState.review_stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docState, selectedProjectId]);

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

  // ИСПРАВЛЕНО: КП требовалось всегда. У экспресс-проекта («Загрузить
  // договор») коммерческого предложения не существует: договор подписан
  // до создания проекта, КП не генерируется и загрузить его на этой
  // странице неоткуда. Прогресс навсегда застревал на 4/5, а «Завершить
  // проект» оставалась заблокированной.
  //
  // Сделано по образцу invoiceRequired ниже: документ не выбрасывается из
  // логики, а исключается из обязательных для тех проектов, где его
  // физически не может быть. Пока список проектов ещё не загружен,
  // selectedProject === undefined, и КП считается обязательным —
  // безопасный дефолт, как и у invoiceRequired.
  const kpRequired = selectedProject?.isExpress !== true;

  // Загружать/заменять финальный файл договора может любой, у кого есть
  // доступ к сделке — не только бухгалтер.
  const canUploadContract =
    role === "pm" ||
    role === "accountant" ||
    role === "director" ||
    role === "commercial_director";

  const contractDoc = allDocs.find(d => d.category === "contract");

  // Состояние категорий приходит из /state: «Загружен» / «Не требуется» /
  // «Пусто». Для прогресса и разблокировки доверенностей/накладных этап
  // договора закрыт в обоих первых случаях; для ВИДА карточки смотрим на
  // contractSkipped / contractHasFile отдельно.
  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");
  const contractState = docState?.categories.contract?.state ?? "empty";
  const poaState = docState?.categories.power_of_attorney?.state ?? "empty";
  const waybillState = docState?.categories.waybill?.state ?? "empty";
  const paymentInvoiceState = docState?.categories.payment_invoice?.state ?? "empty";
  const contractSkipped = contractState === "not_required";
  const contractHasFile = contractState === "uploaded";
  const contractUploaded = contractState !== "empty";
  const contractSkippedDate = fmtDate(docState?.categories.contract?.marked_at);
  const poaDocs     = allDocs.filter(d => d.category === "power_of_attorney");
  const waybillDocs = allDocs.filter(d => d.category === "waybill");
  const invoiceDocs = allDocs.filter(d => d.category === "invoice");
  // Счета на оплату покупателю — необязательный документ (см. комментарий
  // у paymentInvoicePlaceholder), поэтому в отличие от invoiceDocs не
  // участвует ни в invoiceRequired, ни в requiredDocCount/doneDocCount ниже.
  const paymentInvoiceDocs = allDocs.filter(d => d.category === "payment_invoice");

  // ИСПРАВЛЕНО: было ниже, но использовалось выше (displayDocs) — const не
  // хостится в TS/JS, нужно объявить перед первым использованием.
  const invoiceRequired = docState?.procurement_required !== false;


  // Договор считается подписанным, если файл реально загружен и лежит в
  // архиве документов проекта (contractDoc.status === "uploaded") — это
  // надёжный локальный признак. Раньше здесь смотрели только на
  // backend-статус проекта (SIGNED_STATUSES), а он завязан на отдельный
  // вызов синхронизации статуса, который может не срабатывать (см.
  // ContractPage). Из-за этого PM мог загрузить договор, а доверенности и
  // накладные оставались заблокированы навсегда. Теперь достаточно факта
  // загрузки файла; backend-статус остаётся как запасной сигнал.
  const contractSigned =
    contractUploaded ||
    (selectedProject?.contractSigned ?? projectState.contractSigned);
  const uploadsLocked = !contractSigned;

  const reviewInFlight = reviewStage === "pending_director";
  // После полного согласования (approved) PM больше не может редактировать
  // документов — блокировка остаётся навсегда, а не только до завершения проекта.
  const docsLocked = completed || uploadsLocked || reviewInFlight || reviewStage === "approved";

  // Счёт на оплату покупателю доступен ДО подписания договора (в отличие от
  // доверенности и накладной, у которых docsLocked завязан на
  // uploadsLocked/contractSigned) — но так же, как и они, блокируется на
  // этапе проверки документов директором и после завершения проекта.
  const paymentInvoiceLocked = completed || reviewInFlight || reviewStage === "approved";

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
    // ПЕРЕИМЕНОВАНО: было "Счета на оплату" — путалось с новой категорией
    // "payment_invoice" (счёт на оплату ПОКУПАТЕЛЮ, см. paymentInvoicePlaceholder
    // ниже). Этот документ приходит из закупки у поставщика, поэтому теперь
    // явно назван "поставщику".
    name: "Существующий счет на оплату поставщику",
    category: "invoice" as DocCategory,
    status: "pending" as DocStatus,
    date: "",
    required: false,
  };
  // НОВОЕ: счёт на оплату ПОКУПАТЕЛЮ (category="payment_invoice") — в
  // отличие от invoicePlaceholder выше (счёт от поставщика, приходит из
  // закупки автоматически), этот загружается тем же способом, что и
  // доверенность/накладная — вручную или из 1С (Document_СчетНаОплатуПокупателю,
  // см. generator.py/client.py). НЕ входит в requiredDocCount/doneDocCount —
  // необязателен для завершения проекта.
  const paymentInvoicePlaceholder: ProjectDocument = {
    id: "payment-invoice-placeholder",
    projectId: selectedProjectId,
    name: "Счет на оплату",
    category: "payment_invoice" as DocCategory,
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

  // Строка договора при «Без договора»: файла в архиве нет, поэтому в списке
  // остаётся только сеяная запись стора (status "pending") — показываем её как
  // «Без договора» с датой отметки, а не как вечное «Ожидается».
  const displayDocs = allDocs.map(doc =>
    doc.category === "contract" && contractSkipped
      ? { ...doc, status: "no_contract" as DocStatus, date: contractSkippedDate }
      : doc
  );
  // Для категории «Не требуется» вместо «Ожидается» — строка с этим статусом.
  const withNotRequired = (
    placeholder: ProjectDocument,
    state: string,
    category: "power_of_attorney" | "waybill" | "payment_invoice",
  ): ProjectDocument =>
    state === "not_required"
      ? { ...placeholder, status: "not_required", date: fmtDate(docState?.categories[category]?.marked_at) }
      : placeholder;
  if (poaDocs.length === 0) displayDocs.push(withNotRequired(poaPlaceholder, poaState, "power_of_attorney"));
  // ИСПРАВЛЕНО: не показываем "Счета на оплату" как ожидающий документ,
  // если закупка для проекта вообще не нужна (весь товар со склада) —
  // иначе PM видит вечно висящий "Ожидается" пункт, который в принципе
  // никогда не закроется.
  if (invoiceDocs.length === 0 && invoiceRequired) displayDocs.push(invoicePlaceholder);
  if (waybillDocs.length === 0) displayDocs.push(withNotRequired(waybillPlaceholder, waybillState, "waybill"));
  // Показываем строку "Счет на оплату" в общем списке всегда (как
  // накладные/доверенности) — но, в отличие от них, этот документ
  // необязателен, поэтому не участвует в прогрессе/блокировке завершения
  // проекта (см. requiredDocCount/doneDocCount ниже).
  if (paymentInvoiceDocs.length === 0) displayDocs.push(withNotRequired(paymentInvoicePlaceholder, paymentInvoiceState, "payment_invoice"));

  // Пустые слоты в списке: в архиве (проект завершён) и для необязательного
  // счёта покупателю «Ожидается» вводит в заблуждение — показываем «Не загружен».
  // «Не требуется» (выставлено выше) сохраняет приоритет.
  const listDocs = displayDocs.map(doc =>
    doc.status === "pending" && (completed || doc.category === "payment_invoice")
      ? { ...doc, status: "not_uploaded" as DocStatus }
      : doc
  );

  // Доверенность/накладная выполнены, если загружены ИЛИ отмечены «Не
  // требуется». Счёт поставщику считается только после одобрения директором.
  const poaDone          = poaState !== "empty";
  const waybillDone      = waybillState !== "empty";
  const hasInvoice       = invoiceDocs.some(d => d.backendDocument?.status === "approved" || d.backendDocument?.status === "income");

  // ИСПРАВЛЕНО: requiredDocCount был всегда захардкожен в 5, включая
  // "Счета на оплату" — но если у проекта ВСЕ позиции покрыты складом
  // (procurement_required === false), закупки не было и счёта неоткуда
  // взяться, документ никогда не появится, и "Завершить проект" был бы
  // заблокирован навсегда. Пока /state ещё не загружен,
  // ведём себя как раньше — требуем 5 (безопасный дефолт).
  const requiredDocCount =
    3 + (invoiceRequired ? 1 : 0) + (kpRequired ? 1 : 0);
  const doneDocCount = [
    ...(kpRequired ? [hasApprovedKp] : []),
    contractUploaded,
    poaDone,
    ...(invoiceRequired ? [hasInvoice] : []),
    waybillDone,
  ].filter(Boolean).length;
  const allUploaded = doneDocCount === requiredDocCount;
  const remainingDocCount = Math.max(requiredDocCount - doneDocCount, 0);
  // Доверенность/накладную нельзя ни загрузить, ни заменить, пока документы
  // на проверке, после согласования и после завершения проекта — зоны
  // загрузки в этих состояниях просто не показываем (как и раньше).
  const showManualUploadZones = !reviewInFlight && reviewStage !== "approved" && !completed;
  const canComplete = allUploaded && reviewStage === "approved" && !completed;

  // РЕСТРИКЦИЯ ПО СТАТУСУ ВОЗВРАЩЕНА (2026-09-26, по итогам разговора с
  // Dimash): выше раньше был комментарий про то, что привязку к статусу
  // «Ожидание документов» сознательно убрали, потому что она блокировала PM
  // до полного прохождения склада. Обсудили это решение — прежняя причина
  // больше не считается достаточной, и ограничение возвращено сознательно,
  // а не по недосмотру. Если кто-то снова захочет убрать эту привязку —
  // сначала сверьтесь с историей, не повторяйте цикл добавил/убрал молча.
  const isDocsReviewStatus = selectedProject?.statusName === "Ожидание документов";
  const tooltipReview = !allUploaded
    ? "Загрузите все документы сначала"
    : !isDocsReviewStatus
    ? "Отправка доступна только на этапе «Ожидание документов»"
    : "";

  // Чек-лист справа: те же три шага, что были инлайном в разметке, но
  // вынесены, чтобы рядом с ними считался прогресс (doneStepCount) для
  // счётчика и success-подсветки карточки.
  const reviewSteps = [
    { label: "Документы загружены", done: allUploaded },
    { label: "Директор подтвердил", done: reviewStage === "approved" },
    { label: "Проект завершён",     done: completed },
  ];
  const doneStepCount = reviewSteps.filter(step => step.done).length;
  const allStepsDone = doneStepCount === reviewSteps.length;

  const [submittingReview, setSubmittingReview] = useState(false);
  const [decidingReview,   setDecidingReview]   = useState(false);
  const [completing,       setCompleting]       = useState(false);
  const [rejectDraft,      setRejectDraft]      = useState("");
  const [showRejectBox,    setShowRejectBox]    = useState(false);

  const contractFileRef = useRef<HTMLInputElement>(null);

  const today = () => new Date().toLocaleDateString("ru-RU");

  // Кастомное модальное окно подтверждения удаления (вместо window.confirm)
  const [docToDelete, setDocToDelete] = useState<ProjectDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  // Модалка «Загрузить из 1С» — общая для накладной/доверенности/счёта,
  // тип и подпись передаются при открытии в зависимости от того, какую
  // карточку нажали.
  const [onecModal, setOnecModal] = useState<{ docType: OnecDocType; docLabel: string } | null>(null);

  // Подсказки-напоминания после загрузки доверенности/накладной — 1С не
  // передаёт часть реквизитов бланка (см. generator.py:
  // _build_power_of_attorney_context — паспорт получателя вписывается от
  // руки; _build_waybill_context — "По доверенности"/"выданной" тоже TODO,
  // реального поля в 1С не нашли), поэтому эти строки в загруженном файле
  // остаются пустыми и PM должен вписать их сам. Показываем один раз сразу
  // после успешной загрузки — неважно, вручную или через «Из 1С», отсюда
  // проверка стоит и в handleDocUpload, и в handleOnecDocumentLinked.
  const [showPoaReminder, setShowPoaReminder] = useState(false);
  const [showWaybillReminder, setShowWaybillReminder] = useState(false);

  const handleOnecDocumentLinked = (docType: OnecDocType, doc: ProjectDocumentResponse) => {
    documentsStore.addDocument(selectedProjectId, {
      id: `backend-${doc.id}`,
      name: doc.name,
      category: docType as DocCategory,
      status: "uploaded",
      date: today(),
      fileName: doc.file_name,
      backendDocument: doc,
    });
    if (docType === "power_of_attorney") setShowPoaReminder(true);
    if (docType === "waybill") setShowWaybillReminder(true);
    void refetchState();
  };

  const handleDeleteDoc = (doc: ProjectDocument) => {
    // См. paymentInvoiceLocked выше — у счёта на оплату покупателю своё,
    // более раннее условие разблокировки, отдельное от остальных категорий.
    const locked = doc.category === "payment_invoice" ? paymentInvoiceLocked : docsLocked;
    if (locked) return;
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
      void refetchState();
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
      // См. комментарий у showPoaReminder/showWaybillReminder выше — то же
      // напоминание нужно и при обычной ручной загрузке, не только «Из 1С».
      if (category === "power_of_attorney") setShowPoaReminder(true);
      if (category === "waybill") setShowWaybillReminder(true);
      void refetchState();
    } catch (error) {
      console.error(error);
      alert(`Не удалось загрузить документ. Попробуйте еще раз.`);
    } finally {
      setLoading(false);
    }
  };

  // DocumentDropzone сам разбирает drop/клик/клавиатуру и отдаёт готовый
  // файл — здесь остаётся только та же проверка блокировки, что была в
  // handlePoaDrop/handlePoaInput, и вызов загрузки.
  const handlePoaFile = (file: File) => {
    if (docsLocked || uploadingPoa || poaState === "not_required") return;
    void handleDocUpload(file, "power_of_attorney", "Доверенность", poaDocs.length, setUploadingPoa);
  };

  const handleWaybillFile = (file: File) => {
    if (docsLocked || uploadingWaybill || waybillState === "not_required") return;
    void handleDocUpload(file, "waybill", "Накладная", waybillDocs.length, setUploadingWaybill);
  };

  const handlePaymentInvoiceFile = (file: File) => {
    if (paymentInvoiceLocked || uploadingPaymentInvoice || paymentInvoiceState === "not_required") return;
    void handleDocUpload(file, "payment_invoice", "Счет на оплату", paymentInvoiceDocs.length, setUploadingPaymentInvoice);
  };

  // Точечно обновляет один проект в списке — без перезагрузки всего списка и
  // без сброса выбранного проекта. Берём только те поля, которые могут
  // поменяться после действий с договором (статус проекта и contract_mode);
  // остальное (имя, isExpress) остаётся как было. Ошибка не фатальна: до
  // ответа уже применён оптимистичный патч, а на следующий заход на страницу
  // список перезагрузится целиком.
  const patchProject = (id: string, patch: Partial<ProjectSummary>) => {
    setProjects(list => list.map(p => (p.id === id ? { ...p, ...patch } : p)));
  };

  const refreshProject = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Не удалось обновить проект");
      const fresh = normalizeProject((await response.json()) as ProjectApiItem);
      patchProject(id, {
        statusName: fresh.statusName,
        contractSigned: fresh.contractSigned,
        contractMode: fresh.contractMode,
        contractModeAt: fresh.contractModeAt,
      });
    } catch (error) {
      console.error(error);
    }
  };

  // Финальный (проверенный/отредактированный) файл договора загружается
  // сюда после того, как черновик сгенерирован на странице "Договор".
  // Повторный вызов с новым файлом работает как "заменить" — бэкенд просто
  // перезаписывает документ категории "contract" и сам переводит
  // contract_mode из "no_contract" обратно в "uploaded". После успешной
  // загрузки переводим проект из "Ожидание подписания" в "Активный закуп"
  // через markContractUploaded (мягко: если это не удастся, сам факт
  // загрузки файла всё равно достаточен для contractSigned выше, а можно
  // попробовать снова).
  const handleContractUpload = async (file: File | undefined) => {
    if (!file || !selectedProjectId) return;
    const projectIdAtStart = selectedProjectId;
    setUploadingContract(true);
    try {
      const uploadedDoc = await uploadProjectDocument(projectIdAtStart, "contract", file, "Договор");

      documentsStore.updateDocument(projectIdAtStart, `${projectIdAtStart}-contract`, {
        status: "uploaded",
        date: today(),
        fileName: file.name,
        backendDocument: uploadedDoc,
      });
      // Бэкенд сам переводит contract в «uploaded» — подтягиваем /state.
      await refetchState();

      try {
        await markContractUploaded(projectIdAtStart);
      } catch (statusError) {
        console.error("Не удалось обновить статус проекта после загрузки договора:", statusError);
      }
      void refreshProject(projectIdAtStart);
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
      void refetchState();
    } catch (error) {
      console.error(error);
      alert("Не удалось отправить документы на проверку. Проверьте соединение с сервером.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDirectorAccept = async () => {
    setDecidingReview(true);
    try {
      await documentsStore.directorApprove(selectedProjectId);
      void refetchState();
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
      void refetchState();
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
      void refetchState();
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
    const content = `Документ: ${doc.name}\nПроект: ${selectedProjectName}\nСтатус: ${docStatusLabel(doc.status)}\nДата: ${doc.date || "—"}`;
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

  const categoryIcon = (category: ProjectDocument["category"]) => {
    if (category === "kp")                return <FileText   size={14} className="text-blue-500 dark:text-blue-400"   />;
    if (category === "contract")          return <Handshake  size={14} className="text-emerald-500 dark:text-emerald-400"/>;
    if (category === "invoice")           return <FileCheck  size={14} className="text-amber-500 dark:text-amber-400"  />;
    if (category === "waybill")           return <ReceiptIcon size={14} className="text-purple-500 dark:text-purple-400" />;
    if (category === "payment_invoice")   return <FileCheck  size={14} className="text-teal-500 dark:text-teal-400"   />;
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
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground shadow-card transition-[border-color,box-shadow] duration-150 ease-out-strong hover:border-primary/40 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="font-medium truncate">{selectedProjectName}</span>
        <ChevronDown size={15} className={`text-muted-foreground flex-shrink-0 transition-transform duration-200 ease-out-strong ${selectorOpen ? "rotate-180" : ""}`} />
      </button>
      {selectorOpen && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-elevated overflow-hidden origin-top animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 ease-out-strong">
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
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-accent/60 ${p.id === selectedProjectId ? "bg-accent text-accent-foreground font-medium" : "text-foreground"}`}
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
    <div className="bg-card rounded-lg border border-border shadow-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Все документы проекта</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            КП, договор, доверенность, счета и накладные — в одном месте, доступны для скачивания на любом этапе
          </p>
        </div>
        <span className="flex-shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {listDocs.length}
        </span>
      </div>
      {listDocs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground text-center">Документов пока нет</p>
      ) : (
        <div className="divide-y divide-border">
          {listDocs.map((doc, index) => (
            <div
              key={doc.id}
              // Stagger появления строк при открытии страницы/смене проекта:
              // ключи — id документов, поэтому пятисекундный опрос бэкенда
              // не перезапускает анимацию, а потолок в 8 шагов держит
              // задержку последней строки в пределах ~280ms.
              style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
              className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-muted/40 animate-in fade-in slide-in-from-bottom-1 animation-duration-300 fill-mode-both"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted transition-colors duration-150 group-hover:bg-card">
                  {categoryIcon(doc.category)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{doc.date || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {doc.category === "invoice" && doc.backendDocument ? (
                  <InvoiceStatusBadge status={doc.backendDocument.status} />
                ) : (
                  <DocStatusPill status={doc.status} />
                )}
                {doc.status !== "pending" && doc.status !== "no_contract" && doc.status !== "not_required" && doc.status !== "not_uploaded" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-[color,background-color] duration-150 hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Download size={13} />Скачать
                    </button>
                    {(doc.category === "payment_invoice" ? !paymentInvoiceLocked : !docsLocked) &&
                      !doc.id.includes("placeholder") &&
                      !['kp', 'contract', 'invoice'].includes(doc.category) && (
                      <AppTooltip text="Удалить документ">
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          aria-label="Удалить документ"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-destructive-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <Trash2 size={13} />
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

  // «Не требуется» для доверенностей/накладных/счёта покупателю. Доступно по
  // тому же правилу, что и загрузка доверенности/накладной (договор подписан,
  // нет проверки/согласования/завершения) — иначе бэкенд отклонит вызов.
  const renderNotRequiredMark = (
    docLabel: string,
    buttonLabel: string,
    category: NotRequiredCategory,
    state: "uploaded" | "not_required" | "empty",
  ) => (
    <NotRequiredMark
      docLabel={docLabel}
      buttonLabel={buttonLabel}
      state={state}
      markedAt={docState?.categories[category]?.marked_at}
      allowUndo
      disabled={!docState || docsLocked}
      disabledHint={uploadsLocked ? "Доступно только после подписания договора" : "Недоступно на этапе проверки документов"}
      onSet={() => setNotRequired(category)}
      onUnset={() => unsetNotRequired(category)}
    />
  );

  // Карточка загрузки/замены финального договора — общая для страницы
  // ревьюера (бухгалтер/директор) и страницы PM. Кнопка меняет подпись в
  // зависимости от того, загружен ли уже файл ("Загрузить" / "Заменить
  // файл"), чтобы можно было исправить ошибочно загруженный договор без
  // обращения к разработчику.
  const renderContractCard = () => {
    if (!canUploadContract) return null;

    return (
      <div className="bg-card rounded-lg border border-border shadow-card p-5 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Handshake size={16} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Договор</p>
              <p className="text-xs text-muted-foreground">
                {contractSkipped
                  ? `Отмечено вручную · ${contractSkippedDate || "—"}`
                  : contractHasFile
                  ? `Загружен · ${contractDoc?.date || "—"}`
                  : "Сгенерируйте на странице «Договор», проверьте и загрузите готовый файл сюда — либо отметьте «Без договора», если файла не будет."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {contractSkipped ? (
              <span className="animate-in fade-in zoom-in-95 duration-200 ease-out-strong">
                <DocStatusPill status="no_contract" />
              </span>
            ) : contractHasFile && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success-muted ring-1 ring-success/25 animate-in fade-in zoom-in-95 duration-200 ease-out-strong">
                <CheckCircle2 size={13} className="text-success" />
                <span className="text-xs font-medium text-success">Загружен</span>
              </span>
            )}

            {/* «Без договора» — только пока этап договора ещё не закрыт (ни
                файл, ни отметка). Отметка необратима: снять её можно только
                загрузкой настоящего договора. */}
            {!completed && contractState === "empty" && (
              <NotRequiredMark
                docLabel="Договор"
                buttonLabel="Без договора"
                state="empty"
                allowUndo={false}
                disabled={!docState || uploadingContract || reviewInFlight || reviewStage === "approved"}
                disabledHint="Недоступно на этапе проверки документов"
                confirmText="Отметить проект как «Без договора»? Договор будет считаться не требуемым. Снять отметку можно только загрузкой договора."
                onSet={async () => {
                  await markNoContract(selectedProjectId);
                  await refetchState();
                  void refreshProject(selectedProjectId);
                }}
              />
            )}

            {!completed && (
              <button
                onClick={() => !uploadingContract && contractFileRef.current?.click()}
                disabled={uploadingContract}
                className={`flex h-9 items-center gap-1.5 px-3 text-xs font-medium rounded-lg transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out-strong flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  uploadingContract
                    ? "bg-muted text-muted-foreground cursor-wait"
                    : contractHasFile
                    ? "bg-card text-foreground border border-border shadow-card hover:border-primary/40 hover:bg-accent hover:shadow-elevated active:scale-[0.97] cursor-pointer"
                    : "bg-primary text-primary-foreground shadow-card hover:bg-primary/90 hover:shadow-elevated active:scale-[0.97] cursor-pointer"
                }`}
              >
                {uploadingContract ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : contractHasFile ? (
                  <RefreshCw size={13} />
                ) : (
                  <Upload size={13} />
                )}
                {uploadingContract ? "Загрузка…" : contractHasFile ? "Заменить файл" : "Загрузить договор"}
              </button>
            )}
          </div>
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
    );
  };

  if (REVIEWER_ROLES.includes(role)) {
    const myRole = role as Rejector;
    const waitingOnMe = reviewStage === "pending_director";

    const handleAccept = handleDirectorAccept;
    const handleReject = handleDirectorReject;

    return (
      <PageWrap title="Документы" subtitle={selectedProjectName}>
        {projectSelector}
        {waitingOnMe && (
          <div className="bg-card rounded-lg border border-primary/30 shadow-card p-5 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out-strong">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Менеджер запросил проверку файлов
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
                  className="w-full text-sm bg-input-background border border-border rounded-lg px-3 py-2 outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:ring-2 focus:ring-ring/20"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReject}
                    disabled={decidingReview}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg bg-destructive text-destructive-foreground shadow-card transition-[color,background-color,box-shadow,transform] duration-150 ease-out-strong hover:bg-destructive/90 hover:shadow-elevated active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
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
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg bg-success text-success-foreground shadow-card transition-[color,background-color,box-shadow,transform] duration-150 ease-out-strong hover:bg-success/90 hover:shadow-elevated active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
                >
                  {decidingReview ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}Принять
                </button>
                <button
                  onClick={() => setShowRejectBox(true)}
                  disabled={decidingReview}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border border-destructive/25 text-destructive transition-[color,background-color,border-color] duration-150 ease-out-strong hover:bg-destructive-muted hover:border-destructive/40 disabled:opacity-60"
                >
                  <X size={14} />Отклонить
                </button>
              </div>
            )}
          </div>
        )}
        {reviewStage === "approved" && (
          <StageBanner
            tone="success"
            icon={CheckCircle2}
            title="Файлы подтверждены по всей цепочке согласования."
          />
        )}
        {reviewStage === "rejected" && (
          <StageBanner
            tone="warning"
            icon={AlertTriangle}
            title={rejectedBy === myRole
              ? "Вы отклонили проверку. Ожидается повторная загрузка от менеджера."
              : `Отклонено (${rejectedBy ? ROLE_LABEL[rejectedBy] : "—"}). Ожидается повторная загрузка от менеджера.`}
          />
        )}
        {reviewStage === "none" && (
          <StageBanner
            tone="neutral"
            icon={Clock}
            title="Менеджер ещё не отправил документы на проверку."
          />
        )}

        {/* Загрузка/замена финального договора — доступна PM, бухгалтеру и
            директору. Черновик генерируется на странице "Договор"; сюда
            попадает уже проверенный/исправленный файл. */}
        {renderContractCard()}

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
      {reviewStage === "pending_director" && (
        <StageBanner
          tone="info"
          icon={Clock}
          title="Ожидается решение коммерческого директора"
          hint="Пока проверка идёт, документы недоступны для изменения."
        />
      )}
      {reviewStage === "rejected" && (
        <StageBanner
          tone="warning"
          icon={AlertTriangle}
          title={rejectedBy ? `Отклонено: ${ROLE_LABEL[rejectedBy]}` : "Проверка отклонена"}
          hint={rejectReason ? rejectReason : "Обновите документы и отправьте на проверку повторно."}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="col-span-2 space-y-5">
          {renderSharedDocumentList()}

          {renderContractCard()}

          <div className="bg-card rounded-lg border border-border shadow-card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-foreground">Прогресс загрузки документов</h2>
              <span
                // key по значению: счётчик меняется редко (раз на документ),
                // поэтому короткий zoom-in уместен и подсказывает, что цифра
                // изменилась именно сейчас.
                key={doneDocCount}
                className={`text-sm font-semibold tabular-nums animate-in fade-in zoom-in-95 duration-200 ease-out-strong ${
                  allUploaded ? "text-success" : "text-muted-foreground"
                }`}
              >
                {doneDocCount}/{requiredDocCount}
              </span>
            </div>
            {/* Заполнение — через transform: scaleX, а не width: width на
                каждом кадре пересчитывает layout. 400ms (а не обычные для UI
                150–250ms) взяты осознанно: шаг прогресса — всего 1/5 полосы,
                на более коротком отрезке движение просто не успеваешь
                заметить. Цвет переезжает вместе с заливкой, когда прогресс
                закрывается полностью. */}
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted mb-2">
              <div
                style={{ transform: `scaleX(${requiredDocCount > 0 ? doneDocCount / requiredDocCount : 0})` }}
                className={`h-full w-full origin-left rounded-full transition-[transform,background-color] duration-[400ms] ease-out-strong ${
                  allUploaded ? "bg-success" : "bg-primary"
                }`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {completed
                ? "Проект завершён — документы доступны в архиве."
                : allUploaded
                ? "Все документы готовы."
                : `Осталось ${remainingDocCount} ${remainingDocCount === 1 ? "документ" : remainingDocCount < 5 ? "документа" : "документов"}`}
            </p>
          </div>

          {/* Зоны ручной загрузки (доверенности, накладные, счёт покупателю)
              показываются только пока документы можно менять: не на проверке,
              не после согласования и не после завершения. Иначе блок целиком
              скрыт, без пустой обёртки. Необязательный счёт покупателю в
              прогресс и блокировку завершения не входит. */}
          {showManualUploadZones && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <DocumentDropzone
                  title="Доверенности"
                  icon={<Lock size={14} className="text-destructive flex-shrink-0" />}
                  locked={docsLocked}
                  uploading={uploadingPoa}
                  lockedHint={uploadsLocked ? "до подписания договора" : "проверка документов"}
                  hoverTooltip={uploadsLocked ? "Доступно только после подписания договора" : undefined}
                  onFile={handlePoaFile}
                  notRequired={poaState === "not_required" ? { date: fmtDate(docState?.categories.power_of_attorney?.marked_at) } : undefined}
                  footer={renderNotRequiredMark("Доверенности", "Без доверенностей", "power_of_attorney", poaState)}
                  action={!docsLocked && (
                    <OnecImportButton
                      tooltip="Импортировать доверенность из 1С"
                      onClick={() => setOnecModal({ docType: "power_of_attorney", docLabel: "Доверенность" })}
                    />
                  )}
                />

                <DocumentDropzone
                  title="Накладные"
                  icon={<ReceiptIcon size={14} className="text-purple-500 dark:text-purple-400 flex-shrink-0" />}
                  locked={docsLocked}
                  uploading={uploadingWaybill}
                  lockedHint={uploadsLocked ? "до подписания договора" : "проверка документов"}
                  hoverTooltip={uploadsLocked ? "Доступно только после подписания договора" : undefined}
                  onFile={handleWaybillFile}
                  enterDelayMs={45}
                  notRequired={waybillState === "not_required" ? { date: fmtDate(docState?.categories.waybill?.marked_at) } : undefined}
                  footer={renderNotRequiredMark("Накладные", "Без накладных", "waybill", waybillState)}
                  action={!docsLocked && (
                    <OnecImportButton
                      tooltip="Импортировать накладную из 1С"
                      onClick={() => setOnecModal({ docType: "waybill", docLabel: "Накладная" })}
                    />
                  )}
                />

            <DocumentDropzone
              title="Счет на оплату покупателю"
              icon={<FileCheck size={14} className="text-teal-500 dark:text-teal-400 flex-shrink-0" />}
              locked={false}
              uploading={uploadingPaymentInvoice}
              onFile={handlePaymentInvoiceFile}
              enterDelayMs={90}
              notRequired={paymentInvoiceState === "not_required" ? { date: fmtDate(docState?.categories.payment_invoice?.marked_at) } : undefined}
              footer={renderNotRequiredMark("Счет на оплату покупателю", "Без счёта", "payment_invoice", paymentInvoiceState)}
              action={(
                <OnecImportButton
                  tooltip="Импортировать счёт на оплату из 1С"
                  onClick={() => setOnecModal({ docType: "payment_invoice", docLabel: "Счет на оплату покупателю" })}
                />
              )}
            />
          </div>
          )}

        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* reducedMotion="user": при «уменьшить движение» от смены этапа
              остаётся только фейд — та же политика, что в BackgroundJobsToast. */}
          <MotionConfig reducedMotion="user">
          <div className="bg-card rounded-lg border border-border shadow-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Согласование</h3>
            {/* Этап приезжает с опроса бэкенда, то есть меняется без участия
                пользователя — поэтому не подменяем блок мгновенно, а
                перекрёстно гасим: так видно, что состояние изменилось, и
                текст не «телепортируется». */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={reviewStage}
                initial={{ opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transform: "translateY(-6px)" }}
                transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}
              >
                {reviewStage === "approved" && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-success-muted rounded-lg border border-success/25">
                    <CheckCircle2 size={16} className="text-success flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-success">Согласовано</p>
                      <p className="text-xs text-success mt-0.5">Директор подтвердил файлы</p>
                    </div>
                  </div>
                )}
                {reviewStage === "pending_director" && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-info-muted rounded-lg border border-info/25">
                    <Clock size={16} className="text-info flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-info">На проверке у директора</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Ожидаем решение</p>
                    </div>
                  </div>
                )}
                {(reviewStage === "none" || reviewStage === "rejected") && (
                  <div className="space-y-2">
                    {reviewStage === "rejected" && (
                      <p className="text-xs text-warning mb-1 leading-relaxed">
                        Отклонено{rejectedBy ? ` (${ROLE_LABEL[rejectedBy]})` : ""}{rejectReason ? `: ${rejectReason}` : ""}. Обновите файлы и отправьте повторно.
                      </p>
                    )}

                    {/* ОБНОВЛЕНО: Используем новый тултип и блокируем кнопку */}
                    <AppTooltip text={tooltipReview}>
                      <button
                        onClick={() => allUploaded && isDocsReviewStatus && handleSubmitForReview()}
                        disabled={!allUploaded || !isDocsReviewStatus || submittingReview}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out ${
                          allUploaded && isDocsReviewStatus
                            ? "bg-primary text-primary-foreground shadow-card hover:bg-primary/90 hover:shadow-elevated active:scale-[0.97]"
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
              </motion.div>
            </AnimatePresence>
          </div>
          </MotionConfig>

          {/* Чек-лист этапов. Шаги закрываются по одному и не по клику
              пользователя (последний — вообще с бэкенда), поэтому и точка, и
              соединительная линия доезжают transition-ом: так заметно, какой
              шаг только что закрылся. Галочка появляется zoom-in-ом, вся
              карточка при полном прохождении подсвечивается success-рамкой. */}
          <div
            className={`bg-card rounded-lg border shadow-card p-5 transition-[border-color] duration-300 ease-out-strong ${
              allStepsDone ? "border-success/30" : "border-border"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Статус</h3>
              <span
                className={`text-xs font-medium tabular-nums transition-colors duration-[250ms] ${
                  allStepsDone ? "text-success" : "text-muted-foreground"
                }`}
              >
                {doneStepCount}/{reviewSteps.length}
              </span>
            </div>
            <div>
              {reviewSteps.map((item, index) => (
                <div key={item.label} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-[250ms] ease-out-strong ${
                        item.done ? "bg-success ring-4 ring-success/15" : "bg-muted"
                      }`}
                    >
                      {item.done && (
                        <Check
                          size={11}
                          strokeWidth={3}
                          className="text-success-foreground animate-in fade-in zoom-in-90 duration-200 ease-out-strong"
                        />
                      )}
                    </span>
                    {index < reviewSteps.length - 1 && (
                      <span className="relative my-1 h-4 w-0.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className={`absolute inset-0 origin-top rounded-full bg-success transition-transform duration-300 ease-out-strong ${
                            item.done ? "scale-y-100" : "scale-y-0"
                          }`}
                        />
                      </span>
                    )}
                  </div>
                  <span
                    className={`flex min-h-5 items-center text-xs transition-colors duration-[250ms] ${
                      item.done ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {completed ? (
            <div className="space-y-2">
              <div className="w-full py-3 rounded-lg text-sm font-semibold bg-success-muted border border-success/25 text-success flex items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-300 ease-out-strong">
                <CheckCircle2 size={15} />Проект завершён · архив
              </div>
              <button
                onClick={() => onNavigate("dashboard")}
                className="w-full py-2 text-xs text-muted-foreground hover:text-primary transition-colors duration-150"
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
                  className={`w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-[color,background-color,box-shadow,transform] duration-150 ease-out ${
                    canComplete
                      ? "bg-success text-success-foreground shadow-card hover:bg-success/90 hover:shadow-elevated active:scale-[0.98]"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {completing
                    ? <><Loader2 size={15} className="animate-spin" />Завершение…</>
                    : <><CheckCircle2 size={15} />Завершить проект</>}
                </button>
              </AppTooltip>
              {!canComplete && (
                <p className="text-xs text-muted-foreground text-center leading-relaxed">{tooltipComplete}</p>
              )}
            </>
          )}

        </div>
      </div>
    </PageWrap>

    {docToDelete && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-in fade-in duration-200"
        onClick={() => !deletingDoc && setDocToDelete(null)}
      >
        <div
          className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong"
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

    {showPoaReminder && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-in fade-in duration-200"
        onClick={() => setShowPoaReminder(false)}
      >
        <div
          className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-400/15">
              <FileCheck size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Не забудьте про удостоверение личности
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                1С не передаёт данные удостоверения личности получателя — впишите их
                в загруженную доверенность от руки (серия, номер, кем и когда выдано).
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPoaReminder(false)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Понятно
            </button>
          </div>
        </div>
      </div>
    )}

    {showWaybillReminder && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-in fade-in duration-200"
        onClick={() => setShowWaybillReminder(false)}
      >
        <div
          className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-400/15">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Проверьте доверенность в накладной
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                В накладной остаются пустыми поля «По доверенности» (номер) и «выдана»
                (кому) — 1С их не передаёт. Впишите вручную в загруженный файл, кем и
                по какому номеру выдана доверенность на получение груза.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setShowWaybillReminder(false)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Понятно
            </button>
          </div>
        </div>
      </div>
    )}

    {onecModal && (
      <OnecDocumentSearchModal
        open
        onClose={() => setOnecModal(null)}
        docType={onecModal.docType}
        docLabel={onecModal.docLabel}
        projectId={selectedProjectId}
        // БИН клиента нигде не доступен на фронте прямо сейчас (project.name —
        // это имя проекта, не БИН). ПМ вводит вручную, пока не появится
        // источник (см. design doc, п.1 — модель Project/Client).
        defaultBinIin=""
        onLinked={(doc) => {
          handleOnecDocumentLinked(onecModal.docType, doc);
          setOnecModal(null);
        }}
      />
    )}
    </>
  );
}