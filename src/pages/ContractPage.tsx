import { useRef, useState } from "react";
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

/* ------------------------------------------------------------------ */
/* Types                                                               */
/*                                                                      */
/* These live locally for now — move Project / SpecItem into your      */
/* shared ../types module once the backend shape is finalized, and     */
/* replace MOCK_PROJECTS with real data fetched for the current user.  */
/* ------------------------------------------------------------------ */

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

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MOCK_PROJECTS: ContractProject[] = [
  {
    id: "proj-1",
    name: "Офисный комплекс «Башня»",
    client: "ООО «СтройТех»",
    contractUploaded: true,
    fileName: "dogovor_bashnya_2024.pdf",
    uploadDate: "08.07.2024",
    items: [
      { no: 1, name: "Ноутбук Lenovo / IdeaPad Slim 3 15AMN8 / Ryzen 5 / 16 / 512 / мышь", qty: 20000, unit: "шт", price: 368410 },
      { no: 2, name: "Планшет APPLE 11-inch iPad Wi-Fi 128GB", qty: 20000, unit: "шт", price: 232000 },
      { no: 3, name: "Стилус Apple Pencil USB-C MUWA3ZM/A", qty: 20000, unit: "шт", price: 54990 },
      { no: 4, name: "Ноутбук Asus TUF Gaming F16 FX607VJB-RL204 Core i5-210H 16GB / SSD 512GB / RTX 3050 4GB / 90NR0MZ6-M00AT0", qty: 10000, unit: "шт", price: 459990 },
      { no: 5, name: "Холодильник Samsung / RS80F65J1FWT", qty: 1000, unit: "шт", price: 755410 },
      { no: 6, name: "Ноутбук Asus Vivobook 15 Core i5 120U 16GB / SSD 512GB / Intel Graphics /90NB13Y1-M012J0", qty: 10000, unit: "шт", price: 289000 },
      { no: 7, name: "Встраиваемая посудомоечная машина Samsung / DW60A6092BB/WT", qty: 1000, unit: "шт", price: 285989 },
      { no: 8, name: "Встраиваемая вытяжка Haier / HVX-BI652GB", qty: 2000, unit: "шт", price: 105688 },
    ],
  },
  {
    id: "proj-2",
    name: "ЖК «Северный парк»",
    client: "ТОО «Каспий Девелопмент»",
    contractUploaded: false,
    items: [
      { no: 1, name: "Фасадные панели HPL 8мм", qty: 3200, unit: "м²", price: 12500 },
      { no: 2, name: "Кронштейн крепления фасада, оцинкованный", qty: 9800, unit: "шт", price: 1450 },
      { no: 3, name: "Утеплитель минераловатный 100мм", qty: 4100, unit: "м²", price: 3200 },
    ],
  },
  {
    id: "proj-3",
    name: "Логистический центр «Хаб-7»",
    client: "ООО «ТрансЛогистик»",
    contractUploaded: false,
    items: [
      { no: 1, name: "Металлокаркас складской, оцинкованный", qty: 1, unit: "компл", price: 56000000 },
      { no: 2, name: "Сэндвич-панель кровельная 100мм", qty: 6200, unit: "м²", price: 8900 },
      { no: 3, name: "Ворота секционные промышленные 4×4м", qty: 6, unit: "шт", price: 890000 },
    ],
  },
];

export function ContractPage({
  onNavigate,
  role,
}: {
  onNavigate: (p: Page) => void;
  role: Role;
}) {
  const [projects, setProjects] = useState<ContractProject[]>(MOCK_PROJECTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const isPm = role === "pm";

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const triggerUpload = (projectId: string) => {
    fileInputRefs.current[projectId]?.click();
  };

  const handleFileChosen = (projectId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingId(projectId);
    // TODO: replace with a real upload call to your API/storage.
    setTimeout(() => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, contractUploaded: true, fileName: file.name, uploadDate: new Date().toLocaleDateString("ru-RU") }
        )
      );
      setUploadingId(null);
    }, 1200);
  };

  return (
    <PageWrap title="Договор" subtitle="Все проекты">
      <div className="space-y-3">
        {projects.map((project) => {
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
