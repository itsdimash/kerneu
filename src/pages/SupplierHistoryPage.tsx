import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageWrap } from "../app/components/common/PageWrap";
import { fmt } from "../lib/format";

type SupplierListItem = {
  supplier_key: string;
  supplier_kind: "registered" | "raw";
  supplier_id: number | null;
  name: string;
  purchases_count: number;
  products_count: number;
  last_purchase_at: string;
};

type SupplierProduct = {
  product_id: number;
  product_name: string;
  unit: string;
  purchases_count: number;
  total_quantity: number;
  last_purchase_at: string;
  latest_cost_price: string;
  current_sale_price: string | null;
};

type SupplierDetail = {
  supplier_key: string;
  supplier_kind: "registered" | "raw";
  supplier_id: number | null;
  name: string;
  contact_phone: string | null;
  supplier_url: string | null;
  products: SupplierProduct[];
};

type PriceHistory = {
  supplier_key: string;
  supplier_name: string;
  product_id: number;
  product_name: string;
  unit: string;
  latest_cost_price: string;
  current_sale_price: string | null;
  history: {
    id: number;
    receipt_id: number | null;
    receipt_number: string | null;
    cost_price: string;
    purchased_at: string;
    quantity: number | null;
    offer_url: string | null;
  }[];
};
const API = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");
const formatDate = (value: string) => new Date(value).toLocaleDateString("ru-RU");

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Ошибка загрузки данных");
  }
  return response.json() as Promise<T>;
}

export function SupplierHistoryPage() {
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingList(true);
      try {
        const params = query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
        const data = await requestJson<SupplierListItem[]>(
          `${API}/supplier-history${params}`,
          controller.signal,
        );
        setSuppliers(data);
        setSelectedKey((current) => current ?? data[0]?.supplier_key ?? null);
        setError(null);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Ошибка загрузки");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingList(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!selectedKey) {
      setSupplier(null);
      setPriceHistory(null);
      return;
    }
    const controller = new AbortController();
    setLoadingDetail(true);
    setPriceHistory(null);
    requestJson<SupplierDetail>(
      `${API}/supplier-history/${encodeURIComponent(selectedKey)}`,
      controller.signal,
    )
      .then((data) => {
        setSupplier(data);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить поставщика");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDetail(false);
      });
    return () => controller.abort();
  }, [selectedKey]);

  const openProduct = async (productId: number) => {
    if (!selectedKey) return;
    try {
      const data = await requestJson<PriceHistory>(
        `${API}/supplier-history/${encodeURIComponent(selectedKey)}/products/${productId}`,
      );
      setPriceHistory(data);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю цен");
    }
  };

  return (
    <PageWrap title="Поставщики" subtitle="История поставок и закупочных цен">
      <div className="flex gap-4">
        <aside className="flex w-64 flex-shrink-0 flex-col gap-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поставщик или товар"
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto">
            {loadingList ? (
              <p className="px-3 py-4 text-sm text-slate-400">Загрузка…</p>
            ) : suppliers.length === 0 ? (
              <p className="rounded-md border bg-background px-3 py-5 text-center text-sm text-slate-400">
                Поставщики не найдены
              </p>
            ) : (
              suppliers.map((item) => (
                <button
                  key={item.supplier_key}
                  onClick={() => setSelectedKey(item.supplier_key)}
                  className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                    item.supplier_key === selectedKey
                      ? "border-primary/30 bg-accent"
                      : "border-transparent hover:bg-background"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        item.supplier_key === selectedKey ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {item.name}
                    </span>
                    {item.supplier_kind === "raw" && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                        вручную
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {item.products_count} товаров · {item.purchases_count} закупок
                  </div>
                  <div className="text-xs text-slate-400">
                    Последняя: {formatDate(item.last_purchase_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 rounded-lg border border-border bg-card p-5">
          {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {loadingDetail ? (
            <p className="py-8 text-center text-sm text-slate-400">Загрузка…</p>
          ) : !supplier ? (
            <p className="py-8 text-center text-sm text-slate-400">Выберите поставщика слева</p>
          ) : (
            <>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">{supplier.name}</h3>
                {supplier.contact_phone && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{supplier.contact_phone}</p>
                )}
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-background text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">ТОВАР</th>
                      <th className="px-4 py-2.5 text-left font-medium">ПОСЛЕДНЯЯ ЗАКУПКА</th>
                      <th className="px-4 py-2.5 text-right font-medium">КОЛ-ВО</th>
                      <th className="px-4 py-2.5 text-right font-medium">СЕБЕСТОИМОСТЬ</th>
                      <th className="px-4 py-2.5 text-right font-medium">ЦЕНА ПРОДАЖИ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                          Закупок пока нет
                        </td>
                      </tr>
                    ) : (
                      supplier.products.map((product) => (
                        <tr
                          key={product.product_id}
                          onClick={() => openProduct(product.product_id)}
                          className="cursor-pointer border-b border-slate-100 hover:bg-background"
                        >
                          <td className="px-4 py-3 font-medium text-primary">
                            {product.product_name}{" "}
                            <span className="font-normal text-slate-400">({product.unit})</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(product.last_purchase_at)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {product.total_quantity || "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {fmt(Number(product.latest_cost_price))}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {product.current_sale_price
                              ? fmt(Number(product.current_sale_price))
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {priceHistory && (
            <section className="mt-6 overflow-hidden rounded-md border border-border">
              <div className="flex items-start justify-between bg-background px-4 py-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    История цен: {priceHistory.product_name}
                  </h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Себестоимость: {fmt(Number(priceHistory.latest_cost_price))} · Продажа:{" "}
                    {priceHistory.current_sale_price
                      ? fmt(Number(priceHistory.current_sale_price))
                      : "—"}
                  </p>
                </div>
                <button
                  onClick={() => setPriceHistory(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Закрыть
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">ДАТА</th>
                    <th className="px-4 py-2 text-left font-medium">ПРИХОД</th>
                    <th className="px-4 py-2 text-right font-medium">КОЛ-ВО</th>
                    <th className="px-4 py-2 text-right font-medium">СЕБЕСТОИМОСТЬ</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.history.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(item.purchased_at)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.receipt_number ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{item.quantity ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-foreground">
                        {fmt(Number(item.cost_price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>
    </PageWrap>
  );
}

