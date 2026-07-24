export type Role = "admin" | "commercial_director" | "pm" | "accountant" | "warehouse";
export type Page = "dashboard" | "project" | "contract" | "procurement" | "warehouse" | "documents" | "upload";
export type ContractStatus = "unsigned" | "pending" | "signed";
export type KPItemStatus = "found" | "history" | "not_found";

export type ProjectState = {
  kpSent: boolean;
  kpApproved: boolean;
  contractGenerated: boolean;
  contractSigned: boolean;
};

export type KPItem = {
  id: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
  total: number;
  priceStatus: KPItemStatus;
};
export type ReceiptStatus = "В обработке" | "Проверен" | "Отклонен";
export type Receipt = {
  id: string;
  project: string;
  fileName: string;
  amount: number;       // KZT ₸
  uploadDate: string;   // ISO yyyy-mm-dd
  uploadedBy: string;
  status: ReceiptStatus;
};
export type BannerVariant = "neutral" | "warning" | "info" | "success";

