import type { ProjectDocumentResponse } from "../api/api";

export type DocCategory = "kp" | "contract" | "power_of_attorney" | "invoice";
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

  submitForReview(projectId: string) {
    this.setReview(projectId, {
      stage: "pending_accountant",
      rejectedBy: undefined,
      rejectReason: undefined,
      completed: false,
    });
  }

  accountantApprove(projectId: string) {
    this.setReview(projectId, {
      stage: "pending_director",
      rejectedBy: undefined,
      rejectReason: undefined,
    });
  }

  accountantReject(projectId: string, reason?: string) {
    this.setReview(projectId, {
      stage: "rejected",
      rejectedBy: "accountant",
      rejectReason: reason,
    });
  }

  directorApprove(projectId: string) {
    this.setReview(projectId, {
      stage: "approved",
      rejectedBy: undefined,
      rejectReason: undefined,
    });
  }

  directorReject(projectId: string, reason?: string) {
    this.setReview(projectId, {
      stage: "rejected",
      rejectedBy: "commercial_director",
      rejectReason: reason,
    });
  }

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