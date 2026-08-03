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
import { SupplierHistoryPage } from "../../../pages/SupplierHistoryPage";
import ProductsCatalog from '../common/ProductsCatalog';

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

  selectedProjectId: number | string | null;
  setSelectedProjectId: React.Dispatch<
    React.SetStateAction<number | string | null>
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

  const numericProjectId =
    selectedProjectId !== null &&
    Number.isInteger(Number(selectedProjectId)) &&
    Number(selectedProjectId) > 0
      ? Number(selectedProjectId)
      : null;

  // NEW: ядро поиска/выбора проекта, БЕЗ переключения страницы. Раньше это
  // было частью handleFindProject, которая всегда жёстко переключала на
  // "project" в конце — что подходило для сайдбар-поиска, но было неверно
  // для уведомлений про закупки/документы (они должны остаться на своей
  // странице, просто с предзагруженным проектом).
  const resolveAndSelectProject = async (
    searchInput: number | string,
  ): Promise<number | null> => {
    if (!searchInput) {
      setProjectLoadError("Введите ID или название проекта");
      return null;
    }

    try {
      setProjectLoading(true);
      setProjectLoadError(null);

      let finalProjectId: number;

      // 1. Проверяем, ввел ли пользователь число (ID) или текст (Название)
      if (!isNaN(Number(searchInput))) {
        finalProjectId = Number(searchInput);
      } else {
        // 2. Если ввели текст, запрашиваем список всех проектов, чтобы найти нужный ID
        const res = await fetch("http://localhost:8000/api/v1/projects/", {
          credentials: "include",
        });

        if (!res.ok) {
            throw new Error("Не удалось загрузить список проектов для поиска");
        }

        const projects = await res.json();

        // Ищем проект по имени (без учета регистра)
        const foundProject = projects.find((p: any) =>
            p.name?.toLowerCase() === String(searchInput).toLowerCase()
        );

        if (!foundProject) {
          throw new Error(`Проект с названием "${searchInput}" не найден`);
        }

        finalProjectId = foundProject.id;
      }

      // 3. Теперь безопасно передаем ЧИСЛОВОЙ ID в getProjectItems
      const data = await getProjectItems(finalProjectId);

      setProjectItems(data);
      setSelectedProjectId(finalProjectId);

      return finalProjectId;
    } catch (error) {
      console.error("Ошибка загрузки проекта:", error);

      setProjectLoadError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить проект",
      );

      return null;
    } finally {
      setProjectLoading(false);
    }
  };

  // Прежнее поведение — сайдбар-поиск явно хочет попасть на страницу
  // проекта, так что здесь просто резолвим и переключаем страницу.
  const handleFindProject = async (
    searchInput: number | string,
  ) => {
    const id = await resolveAndSelectProject(searchInput);
    if (id !== null) {
      onPage("project");
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
          onOpenProject={handleFindProject}
          onSelectProject={resolveAndSelectProject}
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
            <ContractPage onNavigate={onPage} role={role} />
          )}

          {page === "procurement" && (
            <ProcurementPage
              role={role}
              projectState={projectState}
              initialProjectId={selectedProjectId}
            />
          )}

        {page === "warehouse" && (
            <WarehousePage
            role={role}
            projectState={projectState}
          />  
        )}

          {page === "documents" && (
            <DocumentsPage
              onNavigate={onPage}
              projectState={projectState}
              role={role}
              projectId={numericProjectId}
            />
          )}

          {page === "suppliers" && <SupplierHistoryPage />}
          
          {/* ВСТАВИТЬ ЭТУ СТРОКУ СЮДА: */}
      <ProductsCatalog />
        </main>
      </div>
    </div>
  );
}
