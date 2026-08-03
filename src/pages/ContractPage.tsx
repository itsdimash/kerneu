import { useEffect, useRef, useState } from "react";
import type { Page, Role } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Upload,
} from "lucide-react";
import { documentsStore } from "../store/documentsStore";
import { uploadProjectDocument, fetchProjectDocuments, signProjectContract } from "../api/api";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/*                                                                      */
/* ContractApiProject mirrors ContractProjectResponse from the backend  */
/* (GET /api/v1/projects/contracts). ContractProject is the shape the   */
/* UI below actually renders — contractUploaded/fileName/uploadDate     */
/* stay client-side local state for now since there's no upload         */
/* endpoint/column yet.                                                 */
/* ------------------------------------------------------------------ */

interface ApiProductInfo {
  name: string | null;
  unit: string;
}

interface ApiProjectItem {
  id: number;
  required_quantity: number | null;
  sale_price: string | number;
  product: ApiProductInfo;
}

interface ContractApiProject {
  id: number;
  name: string | null;
  client: { client_name: string } | null;
  items: ApiProjectItem[];
}

interface SpecItem {
  no: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
}

interface ContractProject {
  id: string;
  name: string;
  client: string;
  contractUploaded: boolean;
  fileName?: string;
  uploadDate?: string;
  items: SpecItem[];
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const API_BASE = "http://localhost:8000/api/v1";

function mapApiProject(p: ContractApiProject): ContractProject {
  return {
    id: String(p.id),
    name: p.name ?? `Проект #${p.id}`,
    client: p.client?.client_name ?? "—",
    contractUploaded: false,
    items: p.items.map((item, index) => ({
      no: index + 1,
      name: item.product?.name ?? "—",
      qty: item.required_quantity ?? 0,
      unit: item.product?.unit ?? "шт",
      price: Number(item.sale_price ?? 0),
    })),
  };
}

export function ContractPage({
  onNavigate,
  role,
}: {
  onNavigate: (p: Page) => void;
  role: Role;
}) {
  const [projects, setProjects] = useState<ContractProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Тихое предупреждение вместо блокирующего alert(), если синхронизация
  // статуса проекта после загрузки договора не удалась. Сам факт того, что
  // файл договора загружен, теперь достаточен, чтобы разблокировать
  // доверенности/накладные на странице "Документы" (см. DocumentsPage),
  // поэтому это предупреждение — не критично, просто информирует PM.
  const [statusSyncWarning, setStatusSyncWarning] = useState<string | null>(null);

  const isPm = role === "pm";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const res = await fetch(`${API_BASE}/projects/contracts`, { credentials: "include" });
        if (!res.ok) throw new Error("Не удалось загрузить проекты");

        const data: ContractApiProject[] = await res.json();

        // Check the backend for existing documents for each project
        const projectsWithDocs = await Promise.all(
          data.map(async (apiProject) => {
            const project = mapApiProject(apiProject);

            try {
              // Fetch real documents from the server to check if a contract exists
              const docs = await fetchProjectDocuments(project.id);
              const contractDoc = docs.find((d) => d.category === "contract");

              if (contractDoc) {
                // If it exists on the server, set it as uploaded!
                project.contractUploaded = true;
                project.fileName = contractDoc.file_name;
                project.uploadDate = new Date(contractDoc.created_at).toLocaleDateString("ru-RU");

                // Keep the global Documents store in sync just in case
                documentsStore.updateDocument(project.id, `${project.id}-contract`, {
                  status: "uploaded",
                  date: project.uploadDate,
                  fileName: project.fileName,
                  backendDocument: contractDoc,
                });
              }
            } catch (err) {
              console.error(`Ошибка загрузки документов для проекта ${project.id}`, err);
            }

            return project;
          })
        );

        if (!cancelled) setProjects(projectsWithDocs);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Не удалось загрузить проекты");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const triggerUpload = (projectId: string) => {
    fileInputRefs.current[projectId]?.click();
  };

  const handleFileChosen = async (projectId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingId(projectId);
    setLoadError(null);

    try {
      // 1. Загружаем сам файл договора на бэкенд
      const uploadedDoc = await uploadProjectDocument(projectId, "contract", file, "Договор");

      // 2. Переводим статус проекта в "Активный закуп" на бэкенде.
      //    Без этого шага DocumentsPage продолжит считать договор
      //    неподписанным и будет блокировать загрузку доверенностей/накладных,
      //    т.к. contractSigned завязан на реальный status_name проекта,
      //    а не на факт наличия файла договора в архиве документов.
      try {
        await signProjectContract(Number(projectId));
        setStatusSyncWarning(null);
      } catch (statusError) {
        console.error("Не удалось обновить статус проекта после подписания договора:", statusError);
        // Не блокируем PM модалкой — файл договора уже загружен и этого
        // достаточно, чтобы работать дальше. Просто мягко подсвечиваем,
        // что фоновая синхронизация статуса не удалась.
        setStatusSyncWarning(
          `Договор по проекту «${projects.find((p) => p.id === projectId)?.name ?? projectId}» загружен, ` +
          "но статус проекта на сервере не обновился. Это не мешает продолжить работу — можно сразу переходить к закупкам."
        );
      }

      // 3. Обновляем локальный state
      const today = new Date().toLocaleDateString("ru-RU");
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, contractUploaded: true, fileName: file.name, uploadDate: today }
        )
      );

      // 4. Обновляем глобальный documentsStore, чтобы статус и скачивание
      //    сразу подхватились на странице "Документы"
      documentsStore.updateDocument(projectId, `${projectId}-contract`, {
        status: "uploaded",
        date: today,
        fileName: file.name,
        backendDocument: uploadedDoc,
      });

    } catch (error) {
      console.error("Upload error:", error);
      alert("Не удалось загрузить договор. Попробуйте снова.");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <PageWrap title="Договор" subtitle="Все проекты">
      {loading && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Loader2 size={14} className="animate-spin" />
          Загружаем проекты…
        </div>
      )}

      {!loading && loadError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {loadError}
        </div>
      )}

      {statusSyncWarning && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <span>{statusSyncWarning}</span>
          <button
            onClick={() => setStatusSyncWarning(null)}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      )}

      {!loading && !loadError && projects.length === 0 && (
        <div className="px-4 py-3 bg-slate-50 border border-[#E2E8F0] rounded-lg text-sm text-slate-500">
          Нет проектов в статусе от «Ожидание подписания» до «Завершен».
        </div>
      )}

      <div className="space-y-3">
        {!loading && !loadError && projects.map((project) => {
          const isOpen = expandedId === project.id;
          const isUploading = uploadingId === project.id;
          const total = project.items.reduce((sum, it) => sum + it.qty * it.price, 0);

          return (
            <div
              key={project.id}
              className={`bg-white rounded-lg border transition-colors overflow-hidden ${isOpen ? "border-[#2563EB]/40" : "border-[#E2E8F0]"}`}
            >
              {/* Header — click to expand/collapse the spec table */}
              <button
                onClick={() => setExpandedId(isOpen ? null : project.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${project.contractUploaded ? "bg-green-50" : "bg-blue-50"}`}>
                    <Building2 size={16} className={project.contractUploaded ? "text-green-600" : "text-[#2563EB]"} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{project.name}</p>
                    <p className="text-xs text-slate-400 truncate">{project.client}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {project.contractUploaded ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 rounded-full">
                      <CheckCircle2 size={13} className="text-green-600" />
                      <span className="text-xs font-medium text-green-700">Договор подписан</span>
                    </span>
                  ) : isPm ? (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        !isUploading && triggerUpload(project.id);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${isUploading ? "bg-slate-100 text-slate-400 cursor-wait" : "bg-[#2563EB] hover:bg-[#1d4ed8] text-white cursor-pointer"}`}
                    >
                      {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {isUploading ? "Загрузка…" : "Загрузить договор"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full">
                      <span className="text-xs font-medium text-slate-500">Договор не загружен</span>
                    </span>
                  )}

                  {project.contractUploaded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate("procurement");
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-50 transition-colors"
                    >
                      <ShoppingCart size={13} className="text-slate-500" />
                      {isPm ? "Перейти к закупкам" : "Посмотреть закупки"}
                    </button>
                  )}

                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>

                <input
                  ref={(el) => { fileInputRefs.current[project.id] = el; }}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    handleFileChosen(project.id, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </button>

              {/* Uploaded-file strip */}
              {project.contractUploaded && (
                <div className="flex items-center justify-between px-5 py-2 bg-green-50/60 border-t border-green-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={13} className="text-green-600 flex-shrink-0" />
                    <span className="text-xs text-green-700 truncate">{project.fileName}</span>
                    <span className="text-xs text-green-500 flex-shrink-0">· {project.uploadDate}</span>
                  </div>
                  {isPm && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => triggerUpload(project.id)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                      >
                        <RefreshCw size={12} />Заменить
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Expandable spec table */}
              {isOpen && (
                <div className="border-t border-[#E2E8F0] overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="w-12 px-3 py-2.5 text-left font-semibold text-slate-600 border-b border-r border-[#E2E8F0]">№</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 border-b border-r border-[#E2E8F0]">Наименование</th>
                        <th className="w-24 px-3 py-2.5 text-right font-semibold text-slate-600 border-b border-r border-[#E2E8F0]">Кол-во</th>
                        <th className="w-16 px-3 py-2.5 text-left font-semibold text-slate-600 border-b border-r border-[#E2E8F0]">Ед.</th>
                        <th className="w-28 px-3 py-2.5 text-right font-semibold text-slate-600 border-b border-r border-[#E2E8F0]">Цена</th>
                        <th className="w-32 px-3 py-2.5 text-right font-semibold text-slate-600 border-b border-[#E2E8F0]">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.items.map((item) => (
                        <tr key={item.no} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2.5 text-slate-500 border-b border-r border-[#E2E8F0] align-top">{item.no}</td>
                          <td className="px-3 py-2.5 text-slate-700 border-b border-r border-[#E2E8F0] align-top">{item.name}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700 border-b border-r border-[#E2E8F0] align-top">{fmt(item.qty)}</td>
                          <td className="px-3 py-2.5 text-slate-500 border-b border-r border-[#E2E8F0] align-top">{item.unit}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700 border-b border-r border-[#E2E8F0] align-top">{fmt(item.price)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700 border-b border-[#E2E8F0] align-top">{fmt(item.qty * item.price)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-right font-semibold text-slate-800 border-t-2 border-[#E2E8F0]">Итого:</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900 border-t-2 border-[#E2E8F0]">{fmt(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageWrap>
  );
}