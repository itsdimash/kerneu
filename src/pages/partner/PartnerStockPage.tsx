import { ArrowRight, ClipboardList } from "lucide-react";
import { PartnerCatalog } from "./PartnerCatalog";
import type { PartnerDraft } from "./usePartnerDraft";
import { BRAND_GRADIENT, FOCUS_RING, PageHeader } from "./partnerUi";

// Страница «Склад»: каталог остатков на всю ширину. Выбранные позиции
// оформляются на отдельной странице «Заявка», сюда приходит липкая плашка-переход.
export function PartnerStockPage({
  draft,
  onGoRequest,
  onNoCompany,
}: {
  draft: PartnerDraft;
  onGoRequest: () => void;
  onNoCompany: () => void;
}) {
  const count = draft.lines.length;

  return (
    <div className={count > 0 ? "pb-20" : ""}>
      <PageHeader title="Склад" subtitle="Актуальные остатки. Добавьте нужные товары в заявку." />

      <PartnerCatalog
        draft={draft.quantities}
        limitReached={draft.limitReached}
        submitting={draft.submitting}
        onAdd={draft.add}
        onSetQuantity={draft.setQuantity}
        onRemove={draft.remove}
        onStockLoaded={draft.syncStock}
        refreshKey={draft.stockRefreshKey}
        onNoCompany={onNoCompany}
      />

      {count > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6 lg:left-[288px]">
          <button
            type="button"
            onClick={onGoRequest}
            className={`pointer-events-auto animate-in fade-in slide-in-from-bottom-2 flex h-12 w-full max-w-md items-center justify-between gap-3 rounded-2xl px-5 text-sm font-semibold text-white shadow-[var(--elevation-raised)] transition-transform duration-150 active:scale-[0.98] hover:brightness-110 ${BRAND_GRADIENT} ${FOCUS_RING}`}
          >
            <span className="flex items-center gap-2.5">
              <ClipboardList size={17} />
              В заявке: {count} поз.
            </span>
            <span className="flex items-center gap-1.5">
              Оформить заявку <ArrowRight size={15} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
