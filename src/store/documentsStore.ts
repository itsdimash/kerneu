import type { ProjectDocumentResponse, DocumentReviewResponse } from "../api/api";
import {
  fetchDocumentsReviewStatus,
  submitDocumentsForReview,
  accountantApproveDocuments,
  accountantRejectDocuments,
  directorApproveDocuments,
  directorRejectDocuments,
} from "../api/api";

export type DocCategory = "kp" | "contract" | "power_of_attorney" | "invoice" | "waybill";
export type DocStatus = "pending" | "uploaded" | "generated" | "approved";

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
}

export type ReviewStage =
  | "none"
  | "pending_accountant"
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

// Договор загружает PM (остается без изменений). 
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

  // Применяет ответ бэкенда к локальному стору. "completed" бэкенд пока не
  // возвращает (кнопка "Завершить проект" ещё не подключена к API), поэтому
  // сохраняем текущее локальное значение этого поля.
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

  // Подтягивает актуальный статус согласования с бэкенда. Не бросает
  // исключение — предназначена для фонового опроса (см. loadReview в
  // DocumentsPage), чтобы не ронять интерфейс при временной недоступности сети.
  async loadReview(projectId: string): Promise<void> {
    if (!projectId) return;

    try {
      const response = await fetchDocumentsReviewStatus(projectId);
      this.applyReviewResponse(projectId, response);
    } catch (error) {
      console.error("Не удалось загрузить статус согласования документов", error);
    }
  }

  // PM: отправить / заново отправить документы на проверку бухгалтеру.
  async submitForReview(projectId: string): Promise<void> {
    const response = await submitDocumentsForReview(projectId);
    this.applyReviewResponse(projectId, response);
  }

  // Бухгалтер: принять — документы уходят директору.
  async accountantApprove(projectId: string): Promise<void> {
    const response = await accountantApproveDocuments(projectId);
    this.applyReviewResponse(projectId, response);
  }

  // Бухгалтер: отклонить, с необязательным комментарием для PM.
  async accountantReject(projectId: string, reason?: string): Promise<void> {
    const response = await accountantRejectDocuments(projectId, reason);
    this.applyReviewResponse(projectId, response);
  }

  // Директор: принять — финальное согласование.
  async directorApprove(projectId: string): Promise<void> {
    const response = await directorApproveDocuments(projectId);
    this.applyReviewResponse(projectId, response);
  }

  // Директор: отклонить, с необязательным комментарием для PM.
  async directorReject(projectId: string, reason?: string): Promise<void> {
    const response = await directorRejectDocuments(projectId, reason);
    this.applyReviewResponse(projectId, response);
  }

  // NOTE: "Завершить проект" намеренно оставлено локальным — бэкенд для
  // этой кнопки будет добавлен отдельно (см. договорённость в задаче).
  completeProject(projectId: string) {
    this.setReview(projectId, { completed: true });
  }

  addDocument(
    projectId: string,
    document: Omit<ProjectDocument, "projectId">,
  ) {
    if (!projectId) return;

    const list = this.getSnapshot(projectId);
    this.documents[projectId] = [
      ...list,
      { ...document, projectId },
    ];
    this.emit();
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