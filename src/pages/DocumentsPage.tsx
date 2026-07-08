
import { useState, useRef } from "react";   
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import type { Page, ProjectState, BannerVariant } from "../types";
import { CheckCircle2, Clock, Download, Loader2, Upload, Check ,FileCheck } from "lucide-react";

export function DocumentsPage({ onNavigate, projectState }: { onNavigate: (p: Page) => void; projectState: ProjectState }) {
  const uploadsLocked = !projectState.contractSigned;
  const [docs, setDocs] = useState([
    { id: 1, name: "Акт выполненных работ (КС-2)",   uploaded: false, date: "" },
    { id: 2, name: "Справка о стоимости (КС-3)",      uploaded: false, date: "" },
    { id: 3, name: "Счёт-фактура закрывающая",         uploaded: false, date: "" },
    { id: 4, name: "Гарантийное письмо (18 мес.)",    uploaded: false, date: "" },
  ]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [accountantApproved, setAccountantApproved] = useState(false);
  const [approvingAcc, setApprovingAcc] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = docs.filter(d => d.uploaded).length;
  const allUploaded = done === docs.length;
  const canComplete = allUploaded && accountantApproved;

  const markUploaded = (id: number) => {
    setDocs(d => d.map(doc => doc.id === id ? { ...doc, uploaded: true, date: "17.07.2024" } : doc));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const firstMissing = docs.find(d => !d.uploaded);
    if (firstMissing) markUploaded(firstMissing.id);
  };

  const handleFileInput = () => {
    const firstMissing = docs.find(d => !d.uploaded);
    if (firstMissing) markUploaded(firstMissing.id);
  };

  const handleApproveAcc = () => {
    setApprovingAcc(true);
    setTimeout(() => { setApprovingAcc(false); setAccountantApproved(true); }, 1200);
  };

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => { setCompleting(false); setCompleted(true); }, 1600);
  };

  const tooltipComplete = !allUploaded
    ? `Загрузите все документы (${done}/${docs.length})`
    : !accountantApproved
    ? "Ожидается подтверждение бухгалтера"
    : "";

  if (completed) {
    return (
      <PageWrap title="Закрывающие документы" subtitle="Офисный комплекс «Башня»">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircle2 size={32} className="text-green-600" /></div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Проект завершён!</h2>
          <p className="text-sm text-slate-500 mb-6">Все документы приняты и подтверждены бухгалтером. Офисный комплекс «Башня» успешно закрыт 17.07.2024.</p>
          <button onClick={() => onNavigate("dashboard")} className="px-6 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1d4ed8] transition-colors">Вернуться к дашборду</button>
        </div>
      </PageWrap>
    );
  }

  const docsBanner: { variant: BannerVariant; text: string } = uploadsLocked
    ? { variant: "neutral", text: "Раздел доступен для просмотра. Загрузка документов станет доступна после отгрузки товаров клиенту." }
    : { variant: "info",    text: "Отгрузка подтверждена. Загрузите все закрывающие документы и дождитесь проверки бухгалтера." };

  return (
    <PageWrap title="Закрывающие документы" subtitle="Офисный комплекс «Башня» · Финальный этап">
      <InfoBanner variant={docsBanner.variant} text={docsBanner.text} />
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          {/* Progress */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Прогресс загрузки</h2>
              <span className={`text-sm font-semibold ${allUploaded ? "text-green-600" : "text-slate-600"}`}>{done}/{docs.length}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className={`h-2 rounded-full transition-all duration-500 ${allUploaded ? "bg-green-500" : "bg-[#2563EB]"}`} style={{ width: `${(done / docs.length) * 100}%` }} />
            </div>
            <p className="text-xs text-slate-400">{allUploaded ? "Все документы загружены." : `Осталось ${docs.length - done} документа`}</p>
          </div>

          {/* Drag-and-drop zone */}
          <div
            onDragOver={e => { if (!uploadsLocked) { e.preventDefault(); setIsDragOver(true); } }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={uploadsLocked ? undefined : handleDrop}
            onClick={() => !uploadsLocked && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
              uploadsLocked
                ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                : isDragOver ? "border-[#2563EB] bg-blue-50 cursor-pointer" : "border-[#E2E8F0] hover:border-[#2563EB]/40 hover:bg-blue-50/20 cursor-pointer"
            }`}>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileInput} />
            <Upload size={22} className={`mx-auto mb-2 ${isDragOver ? "text-[#2563EB]" : "text-slate-400"}`} />
            <p className="text-sm text-slate-600 mb-1">Перетащите документы сюда или <span className="text-[#2563EB]">выберите файлы</span></p>
            <p className="text-xs text-slate-400">PDF, DOCX, XLSX до 20 МБ · Файлы автоматически привязываются к позициям</p>
          </div>

          {/* Checklist */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            <div className="divide-y divide-[#E2E8F0]">
              {docs.map(doc => (
                <div key={doc.id} className={`flex items-center justify-between px-5 py-4 transition-colors ${doc.uploaded ? "bg-green-50/30" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div onClick={() => !uploadsLocked && markUploaded(doc.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${doc.uploaded ? "bg-[#16A34A] border-[#16A34A]" : uploadsLocked ? "border-slate-200 cursor-not-allowed opacity-50" : "border-[#E2E8F0] hover:border-[#2563EB] cursor-pointer"}`}>
                      {doc.uploaded && <Check size={11} className="text-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${doc.uploaded ? "text-slate-500 line-through" : "text-slate-800"}`}>{doc.name}</p>
                      {doc.uploaded && <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1"><CheckCircle2 size={10} />Загружен · {doc.date}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.uploaded ? (
                      <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors"><Download size={12} />PDF</button>
                    ) : (
                      <AppTooltip text={uploadsLocked ? "Доступно после отгрузки товаров клиенту" : ""}>
                        <button onClick={() => !uploadsLocked && markUploaded(doc.id)} disabled={uploadsLocked}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-md transition-colors ${uploadsLocked ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50" : "border-[#E2E8F0] text-slate-600 hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-blue-50"}`}>
                          <Upload size={12} />Загрузить
                        </button>
                      </AppTooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Accountant verification */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Проверка бухгалтера</h3>
            {accountantApproved ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700">Бухгалтер подтвердил ✅</p>
                  <p className="text-xs text-green-600 mt-0.5">Оригиналы проверены · 17.07.2024</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 rounded-lg border border-amber-200">
                  <Clock size={14} className="text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700">Ожидается проверка бухгалтера</p>
                </div>
                <AppTooltip text={!allUploaded ? "Загрузите все документы сначала" : ""}>
                  <button onClick={() => allUploaded && handleApproveAcc()} disabled={!allUploaded || approvingAcc}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${allUploaded ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                    {approvingAcc ? <><Loader2 size={13} className="animate-spin" />Проверка…</> : <><FileCheck size={14} />Подтвердить оригиналы</>}
                  </button>
                </AppTooltip>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Статус</h3>
            <div className="space-y-2">
              {[{ label: "Документы загружены", done: allUploaded }, { label: "Бухгалтер подтвердил", done: accountantApproved }].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? "bg-green-500" : "bg-slate-200"}`}>
                    {item.done && <Check size={9} className="text-white" />}
                  </div>
                  <span className={`text-xs ${item.done ? "text-slate-700" : "text-slate-400"}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Complete button */}
          <AppTooltip text={tooltipComplete}>
            <button onClick={() => canComplete && handleComplete()} disabled={!canComplete || completing}
              className={`w-full py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                canComplete ? "bg-[#16A34A] text-white hover:bg-green-700" :
                "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}>
              {completing ? <><Loader2 size={15} className="animate-spin" />Завершение…</> : <><CheckCircle2 size={15} />Завершить проект</>}
            </button>
          </AppTooltip>
          {!canComplete && <p className="text-xs text-slate-400 text-center">{tooltipComplete}</p>}
        </div>
      </div>
    </PageWrap>
  );
}
