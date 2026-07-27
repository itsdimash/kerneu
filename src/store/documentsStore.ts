// Локальное состояние закрывающих документов и их согласования.
// Утверждённые КП сюда не записываются: DocumentsPage получает их из backend
// после события «Одобрено клиентом».

import type { ProjectDocumentResponse } from "../api/api";

export type DocCategory = "kp" | "closing" | "receipt";
export type DocStatus = "pending" | "uploaded" | "generated" | "approved";

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  category: DocCategory;
  status: DocStatus;
  date: string; // dd.mm.yyyy, "" if pending
  fileName?: string;
  backendDocument?: ProjectDocumentResponse;
  required?: boolean; // must be uploaded before the project can be completed
}

export interface ProjectSummary {
  id: string;
  name: string;
  contractSigned: boolean;
  statusName: string;
}

// --- PM -> Accountant -> Commercial Director approval chain -----------------
//
// none               PM hasn't requested a review yet (or resubmitting after edits)
// pending_accountant  Waiting on the accountant's decision
// pending_director     Accountant approved; waiting on the commercial director
// approved             Director approved; PM may finish the project
// rejected              Accountant or director sent it back; see rejectedBy/rejectReason
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

function seedClosingDocs(projectId: string): ProjectDocument[] {
  return [
    { id: `${projectId}-ks2`, projectId, name: "Акт выполненных работ (КС-2)", category: "closing", status: "pending", date: "", required: true },
    { id: `${projectId}-ks3`, projectId, name: "Справка о стоимости (КС-3)", category: "closing", status: "pending", date: "", required: true },
    { id: `${projectId}-invoice`, projectId, name: "Счёт-фактура закрывающая", category: "closing", status: "pending", date: "", required: true },
    { id: `${projectId}-warranty`, projectId, name: "Гарантийное письмо (18 мес.)", category: "closing", status: "pending", date: "", required: true },
    { id: `${projectId}-receipt`, projectId, name: "Чек от клиента", category: "receipt", status: "pending", date: "", required: true },
  ];
}

// Replace with your real project list / API call.
export const MOCK_PROJECTS: ProjectSummary[] = [
  { id: "tower", name: "Офисный комплекс «Башня»", contractSigned: true, statusName: "Активный закуп" },
  { id: "north-lc", name: "ЖК «Северный»", contractSigned: true, statusName: "Завершен" },
  { id: "warehouse", name: "Склад «Логистик-Центр»", contractSigned: false, statusName: "В редактировании" },
];

class DocumentsStore {
  private documents: Record<string, ProjectDocument[]>;
  private reviews: Record<string, ReviewState> = {};
  private listeners = new Set<Listener>();

  constructor(seed: Record<string, ProjectDocument[]>, reviewSeed: Record<string, ReviewState> = {}) {
    this.documents = seed;
    this.reviews = reviewSeed;
  }

  /** Stable reference per projectId unless the list actually changes — required for useSyncExternalStore. */
  getSnapshot = (projectId: string): ProjectDocument[] => {
    if (!projectId) return EMPTY_DOCUMENTS;
    if (!this.documents[projectId]) {
      this.documents[projectId] = seedClosingDocs(projectId);
    }
    return this.documents[projectId];
  };

  /** Same stability contract as getSnapshot: same reference until the review state actually changes. */
  getReviewSnapshot = (projectId: string): ReviewState => {
    if (!this.reviews[projectId]) {
      this.reviews[projectId] = { stage: "none", completed: false };
    }
    return this.reviews[projectId];
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.listeners.forEach(listener => listener());
  }

  private setReview(projectId: string, patch: Partial<ReviewState>) {
    const current = this.getReviewSnapshot(projectId);
    this.reviews[projectId] = { ...current, ...patch };
    this.emit();
  }

  /** PM: send uploaded closing docs off for review (first time or after fixing a rejection). */
  submitForReview(projectId: string) {
    this.setReview(projectId, { stage: "pending_accountant", rejectedBy: undefined, rejectReason: undefined });
  }

  /** Accountant: pass the request along to the commercial director. */
  accountantApprove(projectId: string) {
    this.setReview(projectId, { stage: "pending_director" });
  }

  /** Accountant: send it back to the PM. */
  accountantReject(projectId: string, reason?: string) {
    this.setReview(projectId, { stage: "rejected", rejectedBy: "accountant", rejectReason: reason });
  }

  /** Commercial director: final approval — PM may now finish the project. */
  directorApprove(projectId: string) {
    this.setReview(projectId, { stage: "approved" });
  }

  /** Commercial director: send it back to the PM. */
  directorReject(projectId: string, reason?: string) {
    this.setReview(projectId, { stage: "rejected", rejectedBy: "commercial_director", rejectReason: reason });
  }

  /** PM: mark the project fully complete. Only meaningful once stage === "approved". */
  completeProject(projectId: string) {
    this.setReview(projectId, { completed: true });
  }

  addDocument(projectId: string, doc: Omit<ProjectDocument, "projectId">) {
    const list = this.getSnapshot(projectId);
    this.documents[projectId] = [...list, { ...doc, projectId }];
    this.emit();
  }

  updateDocument(projectId: string, docId: string, patch: Partial<ProjectDocument>) {
    const list = this.getSnapshot(projectId);
    this.documents[projectId] = list.map(d => (d.id === docId ? { ...d, ...patch } : d));
    this.emit();
  }

}

export const documentsStore = new DocumentsStore({
  tower: seedClosingDocs("tower"),
  "north-lc": seedClosingDocs("north-lc").map(d => ({ ...d, status: "uploaded" as DocStatus, date: "15.06.2024" })),
  warehouse: seedClosingDocs("warehouse"),
}, {
  "north-lc": { stage: "approved", completed: true },
});
