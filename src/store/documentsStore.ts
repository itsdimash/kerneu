import type { ProjectDocumentResponse, DocumentReviewResponse, ContractMode } from "../api/api";
import {
  fetchDocumentsReviewStatus,
  submitDocumentsForReview,
  directorApproveDocuments,
  directorRejectDocuments,
  completeProjectOnBackend, // <-- ДОБАВЛЕН ИМПОРТ
} from "../api/api";

export type DocCategory =
  | "kp"
  | "contract"
  | "power_of_attorney"
  | "invoice"
  | "waybill"
  | "payment_invoice"; // счёт на оплату клиенту (не путать с "invoice" — закупочным счётом от поставщика)
// "no_contract" — не статус документа из API (документа в этом случае нет),
// а производное состояние строки «Договор» при project.contract_mode ===
// "no_contract". Из бэкенда не приходит, собирается на странице «Документы».
export type DocStatus = "pending" | "uploaded" | "generated" | "approved" | "rejected" | "no_contract" | "not_required" | "not_uploaded";

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  category: DocCategory;
  status: DocStatus;
  date: string;
  fileName?: string;
  backendDocument?: ProjectDocumentResponse;
  required?: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  contractSigned: boolean;
  statusName: string;
  contractMode?: ContractMode;
  contractModeAt?: string | null;
}

// ИЗМЕНЕНО: шаг бухгалтера убран из цепочки согласования документов —
// теперь единственный согласующий это директор (по аналогии с закупкой).
// "pending_accountant" убран из типа; бэкенд больше никогда его не
// возвращает. rejectedBy может ещё содержать "accountant" в исторических
// данных, поэтому Rejector не трогаем.
export type ReviewStage =
  | "none"
  | "pending_director"
  | "approved"
  | "rejected";

export type Rejector = "accountant" | "commercial_director";

export interface ReviewState {
  stage: ReviewStage;
  rejectedBy?: Rejector;
  rejectReason?: string;
  completed: boolean;
}

type Listener = () => void;

const EMPTY_DOCUMENTS: ProjectDocument[] = [];
const EMPTY_REVIEW: ReviewState = {
  stage: "none",
  completed: false,
};

// Документ, добавленный локально (после загрузки), может ещё не попасть в
// ответ бэкенда от опроса, начатого до загрузки — не удаляем его в этом окне.
const LOCAL_ADD_GRACE_MS = 15_000;

// Договор может сгенерировать и загрузить PM, бухгалтер или директор — см.
// ContractPage (генерация) и DocumentsPage (загрузка/замена финального файла).
// Доверенность и Накладные не сеются заранее: PM добавляет каждую отдельно.
function seedProjectDocs(projectId: string): ProjectDocument[] {
  return [
    {
      id: `${projectId}-contract`,
      projectId,
      name: "Договор",
      category: "contract",
      status: "pending",
      date: "",
      required: true,
    }
  ];
}

class DocumentsStore {
  private documents: Record<string, ProjectDocument[]> = {};
  private reviews: Record<string, ReviewState> = {};
  private listeners = new Set<Listener>();
  private localAddedAt = new Map<string, number>();

  getSnapshot = (projectId: string): ProjectDocument[] => {
    if (!projectId) return EMPTY_DOCUMENTS;

    if (!this.documents[projectId]) {
      this.documents[projectId] = seedProjectDocs(projectId);
    }

    return this.documents[projectId];
  };

  getReviewSnapshot = (projectId: string): ReviewState => {
    if (!projectId) return EMPTY_REVIEW;

    if (!this.reviews[projectId]) {
      this.reviews[projectId] = {
        stage: "none",
        completed: false,
      };
    }

    return this.reviews[projectId];
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private setReview(projectId: string, patch: Partial<ReviewState>) {
    if (!projectId) return;

    const current = this.getReviewSnapshot(projectId);
    this.reviews[projectId] = { ...current, ...patch };
    this.emit();
  }

  private applyReviewResponse(projectId: string, response: DocumentReviewResponse) {
    if (!projectId) return;

    const current = this.getReviewSnapshot(projectId);
    this.reviews[projectId] = {
      stage: response.stage,
      rejectedBy: response.rejected_by ?? undefined,
      rejectReason: response.reject_reason ?? undefined,
      completed: current.completed,
    };
    this.emit();
  }

  async loadReview(projectId: string): Promise<void> {
    if (!projectId) return;

    try {
      const response = await fetchDocumentsReviewStatus(projectId);
      this.applyReviewResponse(projectId, response);
    } catch (error) {
      console.error("Не удалось загрузить статус согласования документов", error);
    }
  }

  async submitForReview(projectId: string): Promise<void> {
    const response = await submitDocumentsForReview(projectId);
    this.applyReviewResponse(projectId, response);
  }

  async directorApprove(projectId: string): Promise<void> {
    const response = await directorApproveDocuments(projectId);
    this.applyReviewResponse(projectId, response);
  }

  async directorReject(projectId: string, reason?: string): Promise<void> {
    const response = await directorRejectDocuments(projectId, reason);
    this.applyReviewResponse(projectId, response);
  }

  // ОБНОВЛЕНО: Теперь метод асинхронный и работает с бэкендом
  async completeProject(projectId: string): Promise<void> {
    if (!projectId) return;
    
    // 1. Отправляем запрос на сервер
    await completeProjectOnBackend(projectId);
    
    // 2. Обновляем локальный стейт
    this.setReview(projectId, { completed: true });
  }

  addDocument(
    projectId: string,
    document: Omit<ProjectDocument, "projectId">,
  ) {
    if (!projectId) return;

    const list = this.getSnapshot(projectId);
    this.localAddedAt.set(`${projectId}:${document.id}`, Date.now());
    this.documents[projectId] = [
      ...list,
      { ...document, projectId },
    ];
    this.emit();
  }

  // Сверка с ответом бэкенда: добавляет новые, обновляет изменившиеся и
  // удаляет пропавшие документы заданных категорий (только `backend-*`;
  // сеяная запись договора и КП не трогаются).
  reconcileBackendDocuments(
    projectId: string,
    categories: DocCategory[],
    incoming: Omit<ProjectDocument, "projectId">[],
  ) {
    if (!projectId) return;

    const pending = new Map(incoming.map((doc) => [doc.id, doc]));
    const now = Date.now();
    let changed = false;
    const next: ProjectDocument[] = [];

    for (const doc of this.getSnapshot(projectId)) {
      if (!categories.includes(doc.category) || !doc.id.startsWith("backend-")) {
        next.push(doc);
        continue;
      }
      const fresh = pending.get(doc.id);
      if (!fresh) {
        const addedAt = this.localAddedAt.get(`${projectId}:${doc.id}`) ?? 0;
        if (now - addedAt < LOCAL_ADD_GRACE_MS) next.push(doc);
        else changed = true;
        continue;
      }
      pending.delete(doc.id);
      const same =
        doc.name === fresh.name &&
        doc.fileName === fresh.fileName &&
        doc.backendDocument?.status === fresh.backendDocument?.status;
      if (same) {
        next.push(doc);
      } else {
        next.push({ ...doc, name: fresh.name, fileName: fresh.fileName, backendDocument: fresh.backendDocument });
        changed = true;
      }
    }

    pending.forEach((doc) => {
      next.push({ ...doc, projectId });
      changed = true;
    });

    if (changed) {
      this.documents[projectId] = next;
      this.emit();
    }
  }

  // Стадию проверки из /state подставляем в общий стор; причина отклонения
  // и «кем» приходят из loadReview и тут не трогаются.
  syncReviewStage(projectId: string, stage: ReviewStage) {
    if (!projectId) return;
    const current = this.getReviewSnapshot(projectId);
    if (current.stage === stage) return;
    this.setReview(projectId, {
      stage,
      ...(stage === "rejected" ? {} : { rejectedBy: undefined, rejectReason: undefined }),
    });
  }

  updateDocument(
    projectId: string,
    documentId: string,
    patch: Partial<ProjectDocument>,
  ) {
    if (!projectId) return;

    const list = this.getSnapshot(projectId);
    this.documents[projectId] = list.map((document) =>
      document.id === documentId
        ? { ...document, ...patch }
        : document,
    );
    this.emit();
  }

  removeDocument(projectId: string, documentId: string) {
    if (!projectId) return;

    const list = this.getSnapshot(projectId);
    this.documents[projectId] = list.filter(
      (document) => document.id !== documentId,
    );
    this.emit();
  }
}

export const documentsStore = new DocumentsStore();