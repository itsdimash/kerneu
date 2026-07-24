import React, { useState } from "react";
import type {
  Role,
  Page,
  ProjectState,
  Receipt,
} from "../../../types";

import {
  type ProjectItem,
  getProjectItems,
} from "../../../api/api";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DashboardPage } from "../../../pages/DashboardPage";
import { ProjectPage } from "../../../pages/ProjectPage";
import { ContractPage } from "../../../pages/ContractPage";
import { ProcurementPage } from "../../../pages/ProcurementPage";
import { WarehousePage } from "../../../pages/WarehousePage";
import { DocumentsPage } from "../../../pages/DocumentsPage";

type UserData = {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
};

type AppShellProps = {
  role: Role;
  page: Page;
  onPage: (p: Page) => void;
  onLogout: () => void;
  user: UserData | null;

  projectState: ProjectState;
  setProjectState: React.Dispatch<
    React.SetStateAction<ProjectState>
  >;

  receipts: Receipt[];
  setReceipts: React.Dispatch<
    React.SetStateAction<Receipt[]>
  >;

  selectedProjectId: number | null;
  setSelectedProjectId: React.Dispatch<
    React.SetStateAction<number | null>
  >;
};

export function AppShell({
  role,
  page,
  onPage,
  user,
  onLogout,
  projectState,
  setProjectState,
  selectedProjectId,
  setSelectedProjectId,
  receipts,
  setReceipts,
}: AppShellProps) {
  const [projectItems, setProjectItems] =
    useState<ProjectItem[]>([]);

  const [projectLoading, setProjectLoading] =
    useState(false);

  const [projectLoadError, setProjectLoadError] =
    useState<string | null>(null);

  const handleFindProject = async (
    projectId: number,
  ) => {
    if (
      !Number.isInteger(projectId) ||
      projectId <= 0
    ) {
      setProjectLoadError(
        `Некорректный ID проекта: ${String(projectId)}`,
      );

      return;
    }

    try {
      setProjectLoading(true);
      setProjectLoadError(null);

      const data = await getProjectItems(projectId);

      setProjectItems(data);
      setSelectedProjectId(projectId);

      onPage("project");
    } catch (error) {
      console.error(
        "Ошибка загрузки проекта:",
        error,
      );

      setProjectLoadError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить проект",
      );
    } finally {
      setProjectLoading(false);
    }
  };

  return (
    <div
      className="flex h-screen bg-[#F8FAFC] overflow-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <Sidebar
        page={page}
        onPage={onPage}
        role={role}
        projectState={projectState}
        onFindProject={handleFindProject}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          role={role}
          user={user}
          onNavigate={onPage}
          onLogout={onLogout}
        />

        <main className="flex-1 overflow-y-auto">
          {projectLoadError && (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-700">
                Ошибка загрузки проекта
              </p>

              <p className="mt-1 text-xs text-red-600">
                {projectLoadError}
              </p>
            </div>
          )}

          {projectLoading && (
            <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm text-blue-700">
                Загружаем проект…
              </p>
            </div>
          )}

          {page === "dashboard" && (
            <DashboardPage
              role={role}
              onNavigate={onPage}
              receipts={receipts}
              onOpenProject={handleFindProject}
            />
          )}

          {page === "project" &&
            selectedProjectId !== null && (
              <ProjectPage
                role={role}
                onNavigate={onPage}
                projectState={projectState}
                receipts={receipts}
                projectItems={projectItems}
                onOpenProject={handleFindProject}
                projectId={selectedProjectId}
                onKpSent={() =>
                  setProjectState((previousState) => ({
                    ...previousState,
                    kpSent: true,
                  }))
                }
                onKpApproved={() =>
                  setProjectState((previousState) => ({
                    ...previousState,
                    kpApproved: true,
                  }))
                }
              />
            )}

          {page === "project" &&
            selectedProjectId === null &&
            !projectLoading && (
              <div className="m-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
                <p className="text-sm font-semibold text-amber-800">
                  Проект не выбран
                </p>

                <p className="mt-1 text-sm text-amber-700">
                  Вернитесь на главную страницу и
                  откройте нужный проект.
                </p>
              </div>
            )}

          {page === "contract" && (
            <ContractPage
              onNavigate={onPage}
              projectState={projectState}
              onContractGenerated={() =>
                setProjectState((previousState) => ({
                  ...previousState,
                  contractGenerated: true,
                }))
              }
              onContractSigned={() =>
                setProjectState((previousState) => ({
                  ...previousState,
                  contractSigned: true,
                }))
              }
            />
          )}

          {page === "procurement" && (
            <ProcurementPage
              role={role}
              projectState={projectState}
            />
          )}

          {page === "warehouse" && (
            <WarehousePage
              projectState={projectState}
            />
          )}

          {page === "documents" && (
            <DocumentsPage
              onNavigate={onPage}
              projectState={projectState}
            />
          )}
        </main>
      </div>
    </div>
  );
}