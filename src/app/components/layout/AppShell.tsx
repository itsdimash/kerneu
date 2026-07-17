import React, { useState } from "react";
import type { Role, Page, ProjectState, Receipt } from "../../../types";
import { ProjectItem, getProjectItems } from "../../../api/api";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DashboardPage } from "../../../pages/DashboardPage";
import { ProjectPage } from "../../../pages/ProjectPage";
import { ContractPage } from "../../../pages/ContractPage"; 
import { ProcurementPage } from "../../../pages/ProcurementPage";
import { WarehousePage } from "../../../pages/WarehousePage";
import { DocumentsPage } from "../../../pages/DocumentsPage";
import { ReceiptStoragePage } from "../../../pages/ReceiptStoragePage";
import { UploadCenter } from "../screens/UploadCenter";
type UserData = {
    id: number;
    name: string;
    email: string;
    role: string;
    created_at: string;
};


export function AppShell({ role, page, onPage, user, onLogout, projectState, setProjectState, receipts, setReceipts }: {
  role: Role; page: Page; onPage: (p: Page) => void;
  onLogout: () => void;
  user: UserData | null;
  projectState: ProjectState;
  setProjectState: React.Dispatch<React.SetStateAction<ProjectState>>;
  receipts: Receipt[];
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
}) {
    const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
    const handleFindProject = async (projectId: number) => {
    try {
        const data = await getProjectItems(projectId);

        setProjectItems(data);

        onPage("project");
    } catch (error) {
        console.error("Ошибка загрузки проекта:", error);
    }
};
  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Sidebar page={page} onPage={onPage} role={role} projectState={projectState} onFindProject={handleFindProject}/>
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar role={role} user = {user} onNavigate={onPage} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto">
          {page === "dashboard" && <DashboardPage role={role} onNavigate={onPage} receipts={receipts} />}
          {page === "project" && (
            <ProjectPage role={role} onNavigate={onPage} projectState={projectState} receipts={receipts}
                         projectItems={projectItems}
              onKpSent={() => setProjectState(ps => ({ ...ps, kpSent: true }))}
              onKpApproved={() => setProjectState(ps => ({ ...ps, kpApproved: true }))} />
          )}
          {page === "contract" && (
            <ContractPage onNavigate={onPage} projectState={projectState}
              onContractGenerated={() => setProjectState(ps => ({ ...ps, contractGenerated: true }))}
              onContractSigned={() => setProjectState(ps => ({ ...ps, contractSigned: true }))} />
          )}
          {page === "procurement" && <ProcurementPage role={role} projectState={projectState} />}
          {page === "warehouse" && <WarehousePage projectState={projectState} />}
          {page === "documents" && <DocumentsPage onNavigate={onPage} projectState={projectState} />}
          {page === "receipts" && role === "accountant" && <ReceiptStoragePage receipts={receipts} setReceipts={setReceipts} />}
          {page === "upload" && role === "pm" && <UploadCenter />}
        </main>
      </div>
    </div>

  );
}
