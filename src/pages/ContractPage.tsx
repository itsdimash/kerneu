import { useState } from "react";
import type { Page, ProjectState, BannerVariant } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import { InfoBanner } from "../app/components/common/InfoBanner";
import { Tooltip } from "../app/components/common/Tooltip";
import { Check, CheckCircle2, Download, FileText, Loader2, Lock, ShoppingCart, AlertTriangle,} from "lucide-react";

export function ContractPage({ onNavigate, projectState, onContractGenerated, onContractSigned }: {
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  onContractGenerated: () => void;
  onContractSigned: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [signing, setSigning] = useState(false);

  const handleGenerate = () => {
    if (!projectState.kpApproved) return;
    setGenerating(true);
    setTimeout(() => { setGenerating(false); onContractGenerated(); }, 1600);
  };

  const handleSign = () => {
    if (!projectState.contractGenerated) return;
    setSigning(true);
    setTimeout(() => { setSigning(false); onContractSigned(); }, 1200);
  };

  const STAGES = [
    { label: "КП", done: projectState.kpApproved, date: projectState.kpApproved ? "03.07.2024" : undefined },
    { label: "Договор", done: projectState.contractGenerated, date: projectState.contractGenerated ? "08.07.2024" : undefined },
    { label: "Подпись", done: projectState.contractSigned, date: projectState.contractSigned ? "17.07.2024" : undefined },
    { label: "Закупка", done: false },
    { label: "Склад", done: false },
    { label: "Документы", done: false },
  ];

  const contractBanner: { variant: BannerVariant; text: string } = !projectState.kpApproved
    ? { variant: "neutral", text: "Для генерации договора необходимо дождаться утверждения КП коммерческим директором. Вы можете просмотреть реквизиты договора." }
    : !projectState.contractGenerated
      ? { variant: "info", text: "КП утверждён. Нажмите «Генерировать договор» для создания документа." }
      : !projectState.contractSigned
        ? { variant: "warning", text: "Договор сгенерирован. Ожидается подписание клиентом. Отметьте чекбокс после получения подписанного экземпляра." }
        : { variant: "success", text: "Договор подписан. Теперь доступен раздел «Закупки» — создавайте и согласовывайте счета." };

  return (
    <PageWrap title="Договор" subtitle="Офисный комплекс «Башня» · ООО «СтройТех»">
      <InfoBanner variant={contractBanner.variant} text={contractBanner.text} />
      {/* Timeline */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-6">Этапы договора</h2>
        <div className="flex items-start overflow-x-auto">
          {STAGES.map((stage, i) => (
            <div key={stage.label} className="flex items-center">
              <div className="flex flex-col items-center min-w-[80px]">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${stage.done ? "bg-[#2563EB] border-[#2563EB]" : "bg-white border-[#E2E8F0]"}`}>
                  {stage.done ? <Check size={14} className="text-white" /> : <span className="text-xs font-semibold text-slate-400">{i + 1}</span>}
                </div>
                <p className={`text-xs font-medium mt-2 ${stage.done ? "text-[#2563EB]" : "text-slate-400"}`}>{stage.label}</p>
                {stage.date && <p className="text-xs text-slate-400 mt-0.5">{stage.date}</p>}
              </div>
              {i < STAGES.length - 1 && <div className={`h-0.5 w-16 mb-8 mx-1 transition-all ${stage.done ? "bg-[#2563EB]" : "bg-[#E2E8F0]"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Реквизиты договора</h3>
            <div className="grid grid-cols-2 gap-4">
              {[["Номер договора", "ДГ-2024-0041"], ["Дата договора", "08.07.2024"], ["Исполнитель", "ООО «Системы Автоматизации»"], ["Заказчик", "ООО «СтройТех»"], ["Предмет", "Поставка и монтаж оконных конструкций"], ["Сумма договора", "12 500 000 ₸"], ["НДС (20%)", "2 083 333 ₸"], ["Срок исполнения", "90 кал. дней"]].map(([l, v]) => (
                <div key={l}><dt className="text-xs text-slate-400 mb-0.5">{l}</dt><dd className="text-sm font-medium text-slate-800">{v}</dd></div>
              ))}
            </div>
          </div>

          {/* Signature toggle */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Подписание клиентом</h3>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mb-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Подписано клиентом</p>
                <p className="text-xs text-slate-400 mt-0.5">ООО «СтройТех» · Генеральный директор</p>
                {!projectState.contractGenerated && <p className="text-xs text-amber-600 mt-1">Доступно после генерации договора</p>}
              </div>
              <Tooltip text={!projectState.contractGenerated ? "Сначала сгенерируйте договор" : ""}>
                <button onClick={handleSign} disabled={!projectState.contractGenerated || projectState.contractSigned || signing}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${projectState.contractSigned ? "bg-[#16A34A]" : !projectState.contractGenerated ? "bg-slate-200 cursor-not-allowed" : "bg-slate-200 hover:bg-slate-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${projectState.contractSigned ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </Tooltip>
            </div>
            {projectState.contractSigned && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle2 size={16} className="text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700">Договор подписан обеими сторонами · 17.07.2024</p>
                  <p className="text-xs text-green-600 mt-0.5">Раздел «Закупки» разблокирован</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Действия</h3>
            <div className="space-y-2">
              {/* Generate button */}
              <Tooltip text={!projectState.kpApproved ? "Доступно после утверждения КП Комдиром" : ""}>
                <button onClick={handleGenerate} disabled={!projectState.kpApproved || generating || projectState.contractGenerated}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${projectState.contractGenerated ? "bg-green-100 text-green-700 cursor-default" :
                      projectState.kpApproved && !generating ? "bg-[#2563EB] hover:bg-[#1d4ed8] text-white" :
                        "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}>
                  {generating ? <><Loader2 size={14} className="animate-spin" />Генерация…</> :
                    projectState.contractGenerated ? <><CheckCircle2 size={14} />Договор сгенерирован ✅</> :
                      projectState.kpApproved ? <><FileText size={14} />Генерировать договор</> :
                        <><Lock size={14} />Доступно после утверждения КП</>}
                </button>
              </Tooltip>

              {projectState.contractGenerated && (
                <button className="w-full flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 text-sm font-medium rounded-lg border border-[#E2E8F0] hover:bg-slate-50 transition-colors">
                  <Download size={14} className="text-slate-500" />Скачать PDF
                </button>
              )}

              <Tooltip text={!projectState.contractSigned ? "Доступно после подписания договора" : ""}>
                <button onClick={() => projectState.contractSigned && onNavigate("procurement")}
                  disabled={!projectState.contractSigned}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${projectState.contractSigned ? "bg-white text-slate-700 border border-[#E2E8F0] hover:bg-slate-50" : "bg-slate-50 text-slate-400 border border-[#E2E8F0] cursor-not-allowed"}`}>
                  {!projectState.contractSigned && <Lock size={13} />}<ShoppingCart size={14} className={projectState.contractSigned ? "text-slate-500" : "text-slate-300"} />Перейти к закупкам
                </button>
              </Tooltip>
            </div>
          </div>

          {!projectState.kpApproved && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">КП ещё не утверждено Комдиром. Генерация договора будет доступна после утверждения.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrap>
  );
}