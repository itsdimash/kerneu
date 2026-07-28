// Локальное состояние закрывающих документов и их согласования.
//
// Утверждённые КП здесь не хранятся: DocumentsPage получает их из backend
// после события «Одобрено клиентом». Поэтому после перезагрузки страницы
// архивное КП не пропадает и доступно другим ролям, включая комдира.

import type { ProjectDocumentResponse } from "../api/api";

export type DocCategory = "kp" | "closing" | "receipt";
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

// PM -> Бухгалтер -> Коммерческий директор.
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

function seedClosingDocs(projectId: string): ProjectDocument[] {
  return [
    {
      id: `${projectId}-ks2`,
      projectId,
      name: "Акт выполненных работ (КС-2)",
      category: "closing",
      status: "pending",
      date: "",
      required: true,
    },
    {
      id: `${projectId}-ks3`,
      projectId,
      name: "Справка о стоимости (КС-3)",
      category: "closing",
      status: "pending",
      date: "",
      required: true,
    },
    {
      id: `${projectId}-invoice`,
      projectId,
      name: "Счёт-фактура закрывающая",
      category: "closing",
      status: "pending",
      date: "",
      required: true,
    },
    {
      id: `${projectId}-warranty`,
      projectId,
      name: "Гарантийное письмо (18 мес.)",
      category: "closing",
      status: "pending",
      date: "",
      required: true,
    },
    {
      id: `${projectId}-receipt`,
      projectId,
      name: "Чек от клиента",
      category: "receipt",
      status: "pending",
      date: "",
      required: true,
    },
  ];
}

class DocumentsStore {
  private documents: Record<string, ProjectDocument[]> = {};
  private reviews: Record<string, ReviewState> = {};
  private listeners = new Set<Listener>();

  /**
   * Возвращает одну и ту же ссылку, пока список проекта не изменился.
   * Это требуется для useSyncExternalStore.
   */
  getSnapshot = (projectId: string): ProjectDocument[] => {
    if (!projectId) return EMPTY_DOCUMENTS;

    if (!this.documents[projectId]) {
      this.documents[projectId] = seedClosingDocs(projectId);
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
}

export const documentsStore = new DocumentsStore();