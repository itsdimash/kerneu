
import { Receipt, ReceiptStatus } from "../types";
import { Upload } from "lucide-react";
import { Plus, FileCheck } from "lucide-react";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { fmt } from "../lib/format";
import { PageWrap } from "../app/components/common/PageWrap";
import { useRef, useState } from "react";


const RECEIPT_STATUSES: ReceiptStatus[] = ["В обработке", "Проверен", "Отклонен"];

const RECEIPT_PROJECTS = [
  "Офисный комплекс «Башня»",
  "ЖК Алтын-Авангард",
  "Реконструкция склада Nord",
  "Торговый центр «Меридиан»",
  "Жилой комплекс «Парковый»",
];

const RECEIPTS_INIT: Receipt[] = [
  { id: "r1", project: "Офисный комплекс «Башня»",  fileName: "check_2406.pdf",     amount: 2_340_000, uploadDate: "2026-06-24", uploadedBy: "Иван ПМ",   status: "Проверен" },
  { id: "r2", project: "Офисный комплекс «Башня»",  fileName: "oplata_beton.pdf",   amount: 1_250_000, uploadDate: "2026-06-23", uploadedBy: "Иван ПМ",   status: "Отклонен" },
  { id: "r3", project: "ЖК Алтын-Авангард",          fileName: "kassa_3204.jpg",     amount:   480_000, uploadDate: "2026-06-22", uploadedBy: "М. Козлова", status: "В обработке" },
  { id: "r4", project: "Торговый центр «Меридиан»",  fileName: "invoice_meridian.pdf", amount: 5_600_000, uploadDate: "2026-06-20", uploadedBy: "И. Волков",  status: "Проверен" },
];

// Project the ПМ currently works in (matches the workspace project header).
const PM_PROJECT = "Офисный комплекс «Башня»";



export function ReceiptStoragePage({ receipts, setReceipts }: {
  receipts: Receipt[];
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
}) {
  const [project, setProject] = useState(RECEIPT_PROJECTS[0]);
  const [amount, setAmount] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSave = project && Number(amount) > 0 && fileName;

  const handleSave = () => {
    if (!canSave) return;
    setReceipts(r => [{
      id: `r${Date.now()}`,
      project,
      fileName,
      amount: Number(amount),
      uploadDate: new Date().toISOString().slice(0, 10),
      uploadedBy: "Бухгалтер",
      status: "В обработке",
    }, ...r]);
    setAmount(""); setFileName("");
  };

  
  const setStatus = (id: string, status: ReceiptStatus) =>
    setReceipts(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files[0]) setFileName(e.dataTransfer.files[0].name);
  };

  const total = receipts.reduce((s, r) => s + r.amount, 0);

  return (
    <PageWrap title="Хранилище чеков" subtitle="Управление, привязка к проектам и архивация финансовых чеков">
      <InfoBanner variant="neutral" text="Загруженные чеки автоматически привязываются к выбранному проекту и попадают в архив для бухгалтерской отчётности. Статус можно изменить прямо в таблице." />

      {/* Upload & meta form */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Загрузить новый чек</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Название проекта</label>
            <select value={project} onChange={e => setProject(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]">
              {RECEIPT_PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Сумма чека (₸)</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-3.5 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" />
          </div>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed px-6 py-7 text-center cursor-pointer transition-all ${isDragOver ? "border-[#2563EB] bg-blue-50" : "border-[#E2E8F0] hover:border-[#2563EB]/50 hover:bg-slate-50"}`}>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
            onChange={e => { if (e.target.files?.[0]) setFileName(e.target.files[0].name); }} />
          <Upload size={20} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">
            {fileName ? fileName : "Выбрать или перетащить файл чека"}
          </p>
          <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG · до 10 МБ</p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {fileName && <button onClick={() => setFileName("")} className="text-xs text-slate-400 hover:text-slate-600">Очистить файл</button>}
          <button onClick={handleSave} disabled={!canSave}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${canSave ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
            <Plus size={14} /> Сохранить чек
          </button>
        </div>
      </div>

      {/* Receipts management table */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Архив чеков ({receipts.length})</h3>
        <p className="text-xs text-slate-500">Итого: <span className="font-semibold text-slate-700">{fmt(total)}</span></p>
      </div>
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["Проект","Файл чека","Загрузил","Дата","Сумма","Статус"].map((h,i) => (
              <th key={h} className={`px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {receipts.map(r => (
              <tr key={r.id} className={`hover:bg-slate-50/50 transition-colors ${r.status === "Отклонен" ? "bg-red-50/20" : ""}`}>
                <td className="px-4 py-3 text-sm text-slate-800">{r.project}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileCheck size={14} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-[#2563EB] hover:underline cursor-pointer">{r.fileName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.uploadedBy}</td>
                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.uploadDate}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center text-sm font-mono font-semibold text-slate-800">{fmt(r.amount)}</span>
                </td>
                <td className="px-4 py-3">
                  <select value={r.status} onChange={e => setStatus(r.id, e.target.value as ReceiptStatus)}
                    className={`text-xs font-medium rounded-md border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 ${
                      r.status === "Проверен" ? "border-green-200 bg-green-50 text-green-700"
                      : r.status === "Отклонен" ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    {RECEIPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}