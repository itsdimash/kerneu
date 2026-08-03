import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageWrap } from "../app/components/common/PageWrap";
import { fmt } from "../lib/format";
import { SUPPLIERS_INIT } from "../data/suppliers";
import type { Delivery, Supplier } from "../types";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function getLastDeliveryDate(deliveries: Delivery[]): string | null {
  if (deliveries.length === 0) return null;
  return deliveries.reduce((latest, d) => (d.date > latest ? d.date : latest), deliveries[0].date);
}

function sortedDeliveries(deliveries: Delivery[]): Delivery[] {
  return [...deliveries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function SupplierHistoryPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(SUPPLIERS_INIT[0]?.id ?? null);

  // Each result carries the supplier plus, when the match came from a
  // product rather than the supplier name, which product matched — so the
  // list can show *why* that supplier showed up.
  const filteredSuppliers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUPPLIERS_INIT.map((s) => ({ supplier: s, matchedProduct: null as string | null }));

    const results: { supplier: Supplier; matchedProduct: string | null }[] = [];
    for (const s of SUPPLIERS_INIT) {
      const nameMatch = s.name.toLowerCase().includes(q);
      const productMatch = s.deliveries.find((d) => d.product.toLowerCase().includes(q));
      if (nameMatch || productMatch) {
        results.push({ supplier: s, matchedProduct: nameMatch ? null : productMatch!.product });
      }
    }
    return results;
  }, [query]);

  // Detail card always reflects the selected supplier, independent of the
  // current search filter — searching shouldn't clear what's on the right.
  const selectedSupplier = useMemo(
    () => SUPPLIERS_INIT.find((s) => s.id === selectedId) ?? null,
    [selectedId]
  );

  const deliveries = selectedSupplier ? sortedDeliveries(selectedSupplier.deliveries) : [];

  return (
    <PageWrap title="Поставщики" subtitle="Полная история поставок по всем поставщикам">
      <div className="flex gap-4">
        {/* Left: search + supplier list */}
        <div className="flex w-60 flex-shrink-0 flex-col gap-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по поставщику или товару"
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
            />
          </div>

          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {filteredSuppliers.length === 0 ? (
              <div className="rounded-lg border border-[#E2E8F0] bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                Поставщики не найдены
              </div>
            ) : (
              filteredSuppliers.map(({ supplier, matchedProduct }) => {
                const isSelected = supplier.id === selectedId;
                const lastDelivery = getLastDeliveryDate(supplier.deliveries);
                return (
                  <button
                    key={supplier.id}
                    onClick={() => setSelectedId(supplier.id)}
                    className={`flex flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-[#2563EB]/30 bg-[#EFF6FF]"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className={`text-sm font-medium ${isSelected ? "text-[#2563EB]" : "text-slate-900"}`}>
                      {supplier.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {supplier.category} · {supplier.deliveries.length} поставок
                    </span>
                    {matchedProduct ? (
                      <span className="text-xs text-[#2563EB]">Товар: {matchedProduct}</span>
                    ) : (
                      lastDelivery && (
                        <span className="text-xs text-slate-400">Последняя: {formatDate(lastDelivery)}</span>
                      )
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: supplier detail card */}
        <div className="flex-1 rounded-lg border border-[#E2E8F0] bg-white p-5">
          {!selectedSupplier ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Выберите поставщика слева
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900">{selectedSupplier.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{selectedSupplier.category}</p>
              </div>

              <div className="overflow-hidden rounded-md border border-[#E2E8F0]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-slate-50 text-slate-500">
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Товар</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Дата</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Кол-во</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Себестоимость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                          Поставок пока нет
                        </td>
                      </tr>
                    ) : (
                      deliveries.map((d, i) => (
                        <tr
                          key={`${d.product}-${d.date}-${i}`}
                          className={i !== deliveries.length - 1 ? "border-b border-slate-100" : ""}
                        >
                          <td className="px-4 py-2.5 text-slate-900">{d.product}</td>
                          <td className="px-4 py-2.5 text-slate-500">{formatDate(d.date)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{d.qty}</td>
                          <td className="px-4 py-2.5 text-right text-slate-900">{fmt(d.cost)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </PageWrap>
  );
}
