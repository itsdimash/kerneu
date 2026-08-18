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

type UserData = {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
};

type AppShellProps = {
  role: Role;
  // Настоящая роль из БД (может отличаться от role, если это admin и он
  // переключил "роль для теста" — см. ROLE_SWITCHER_OPTIONS ниже).
  // null, пока /auth/me ещё не ответил.
  realRole: Role | null;
  onRoleChange: (role: Role) => void;
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

// Роли, между которыми admin может переключаться для теста интерфейса.
// Значения — те же строки, что и role_name в БД (см. app/models/roles.py
// на бэке); подписи — то, что видит сам admin в выпадающем списке.
// "admin" намеренно исключён из списка — переключатель используется
// только для просмотра интерфейса под другими ролями, дефолт — "pm"
// (см. useState<Role> в App.tsx).
const ROLE_SWITCHER_OPTIONS: { value: Role; label: string }[] = [
  { value: "pm", label: "Менеджер проекта" },
  { value: "commercial_director", label: "Коммерческий директор" },
  { value: "accountant", label: "Бухгалтер" },
  { value: "warehouse", label: "Кладовщик" },
];

export function AppShell({
  role,
  realRole,
  onRoleChange,
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        const res = await fetch("/api/v1/projects/", {
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

  // На узких экранах сайдбар — это off-canvas drawer, а не всегда видимая
  // колонка, так что переключение страницы из него должно само его закрывать.
  const handlePageFromNav = (p: Page) => {
    onPage(p);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        page={page}
        onPage={handlePageFromNav}
        role={role}
        projectState={projectState}
        onFindProject={handleFindProject}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          role={role}
          user={user}
          onNavigate={onPage}
          onLogout={onLogout}
          onOpenProject={handleFindProject}
          onSelectProject={resolveAndSelectProject}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          {projectLoadError && (
            <div className="mx-6 mt-4 rounded-lg border border-destructive/20 bg-destructive-muted px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                Ошибка загрузки проекта
              </p>

              <p className="mt-1 text-xs text-destructive/80">
                {projectLoadError}
              </p>
            </div>
          )}

          {projectLoading && (
            <div className="mx-6 mt-4 rounded-lg border border-info/20 bg-info-muted px-4 py-3">
              <p className="text-sm text-info">
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
              <div className="m-6 rounded-lg border border-warning/20 bg-warning-muted p-5">
                <p className="text-sm font-semibold text-warning">
                  Проект не выбран
                </p>

                <p className="mt-1 text-sm text-warning/90">
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
        </main>
      </div>

      {/* Переключатель "роли для теста" — виден только реальным admin'ам
          (проверка по realRole, не по role — role сам может быть уже
          переключён на что-то другое). Меняет только то, что видит
          интерфейс (role, проброшенный во все страницы) — бэкенд
          по-прежнему проверяет права по настоящей роли из cookie, так что
          действия, которых admin реально не может делать, останутся
          недоступны на сервере, даже если в UI показались кнопки. */}
      {realRole === "admin" && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border rounded-lg shadow-lg px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Роль для теста:
          </span>
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          >
            {ROLE_SWITCHER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}