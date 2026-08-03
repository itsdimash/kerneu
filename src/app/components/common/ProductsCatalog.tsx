import React, { useState } from "react";
import { Package, X, ExternalLink, Loader2, TrendingUp, TrendingDown, Minus, Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

// --- Типы данных (соответствуют backend-модели) ---
type Product = {
  id: number;
  name: string;
  description: string | null;
};

type ProductHistory = {
  id: number;
  product_id: number;
  purchase_price: number | string; // Numeric(15,2) с бэка может прийти строкой
  supplier_raw_name: string | null;
  offer_url: string | null;
  price_date: string;
};

const API_BASE = "http://localhost:8000/api/v1";

// ==========================================
// Лёгкий SVG-график динамики цены — без сторонних библиотек.
// Показывает линию по точкам (даты по возрастанию), точки мин/макс
// подсвечены, заливка градиентом под линией для объёма.
// ==========================================
function PriceTrendChart({
  points,
}: {
  points: { date: string; price: number }[];
}) {
  if (points.length < 2) return null;

  const width = 680;
  const height = 190;
  const paddingX = 36;
  const paddingY = 22;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const stepX = (width - paddingX * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = paddingX + i * stepX;
    const y = paddingY + (1 - (p.price - min) / range) * (height - paddingY * 2);
    return { x, y, price: p.price, date: p.date };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`;

  const monthShort = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "");

  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-4 mb-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="priceTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Заливка под линией */}
        <path d={areaPath} fill="url(#priceTrendFill)" />

        {/* Линия тренда */}
        <path d={linePath} fill="none" stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Точки: мин — зелёная, макс — красная, остальные — синие */}
        {coords.map((c, i) => {
          const isMin = c.price === min;
          const isMax = c.price === max;
          const color = isMin ? "#16a34a" : isMax ? "#dc2626" : "#2563EB";
          return (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={isMin || isMax ? 5 : 3.5} fill="white" stroke={color} strokeWidth={2} />
              <text x={c.x} y={height - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
                {monthShort(c.date)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ProductsCatalog() {
  const [isMainModalOpen, setIsMainModalOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const [search, setSearch] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<ProductHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatPrice = (price: number | string) => {
    const num = typeof price === "string" ? parseFloat(price) : price;
    return num.toLocaleString("ru-RU");
  };

  const toNum = (price: number | string) =>
    typeof price === "string" ? parseFloat(price) : price;

  const formatDelta = (diff: number, percent: number) => {
    if (diff === 0) return { text: "0", cls: "text-slate-400" };
    const sign = diff > 0 ? "+" : "";
    const arrow = diff > 0 ? "🔺" : "🔻";
    return {
      text: `${arrow} ${sign}${diff.toLocaleString("ru-RU")} (${sign}${percent.toFixed(1)}%)`,
      cls: diff > 0 ? "text-red-600" : "text-green-600",
    };
  };

  // История с бэка приходит в неизвестном порядке — сортируем сами:
  // по возрастанию даты, чтобы Δ считался относительно предыдущей по
  // времени записи, а не относительно случайного соседа в массиве.
  const historyAsc = [...history].sort(
    (a, b) => new Date(a.price_date).getTime() - new Date(b.price_date).getTime()
  );

  const prices = historyAsc.map((h) => toNum(h.purchase_price));

  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const currentPrice = prices.length ? prices[prices.length - 1] : null;
  const oldestPrice = prices.length ? prices[0] : null;
  const overallChangePercent =
    currentPrice !== null && oldestPrice !== null && oldestPrice !== 0
      ? ((currentPrice - oldestPrice) / oldestPrice) * 100
      : null;

  // Δ к предыдущей (по времени) записи — храним по id, чтобы не потерять
  // привязку при развороте порядка для отображения (новые сверху).
  const deltaById = new Map<number, { diff: number; percent: number } | null>();
  historyAsc.forEach((item, index) => {
    if (index === 0) {
      deltaById.set(item.id, null);
      return;
    }
    const prevPrice = toNum(historyAsc[index - 1].purchase_price);
    const curPrice = toNum(item.purchase_price);
    const diff = curPrice - prevPrice;
    const percent = prevPrice !== 0 ? (diff / prevPrice) * 100 : 0;
    deltaById.set(item.id, { diff, percent });
  });

  const historyDesc = [...historyAsc].reverse();

  const loadProducts = async () => {
    try {
      setProductsLoading(true);
      setProductsError(null);

      const res = await fetch(`${API_BASE}/products/`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Не удалось загрузить список товаров");
      }

      const data = await res.json();
      setProducts(data);
      setProductsLoaded(true);
    } catch (error) {
      setProductsError(
        error instanceof Error ? error.message : "Ошибка загрузки товаров",
      );
    } finally {
      setProductsLoading(false);
    }
  };

  const openCatalog = () => {
    setIsMainModalOpen(true);
    if (!productsLoaded) {
      loadProducts();
    }
  };

  const openProductDetails = async (product: Product) => {
    setSelectedProduct(product);
    setHistory([]);
    setHistoryError(null);

    try {
      setHistoryLoading(true);

      const res = await fetch(
        `${API_BASE}/products/${product.id}/history`,
        { credentials: "include" },
      );

      if (!res.ok) {
        throw new Error("Не удалось загрузить историю цен");
      }

      const data = await res.json();
      setHistory(data);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Ошибка загрузки истории",
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      {/* --- Кнопка --- */}
      <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={openCatalog}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-md transition-colors"
        >
          <Package size={18} />
          Каталог товаров
        </button>
      </div>

      {/* --- Список товаров --- */}
      {isMainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[75vh] flex flex-col border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">
                Товары
              </h2>
              <button
                onClick={() => setIsMainModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="overflow-y-auto p-5">
              {productsLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Загрузка товаров...
                </div>
              )}

              {productsError && (
                <div className="text-sm text-red-600 py-4 text-center">
                  {productsError}
                </div>
              )}

              {!productsLoading && !productsError && (
                <div className="flex flex-col divide-y divide-slate-100">
                  {filteredProducts.length === 0 && (
                    <div className="text-sm text-slate-400 text-center py-8">
                      Ничего не найдено
                    </div>
                  )}

                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => openProductDetails(product)}
                      className="flex items-center justify-between w-full text-left py-3 px-1 hover:bg-slate-50 transition-colors rounded-md"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {product.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          ID: {product.id}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">Подробнее →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Детали товара + история цен --- */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">
                  ID: {selectedProduct.id}
                </div>
                <h3 className="text-base font-semibold text-slate-800">
                  {selectedProduct.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">
              {selectedProduct.description && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  {selectedProduct.description}
                </p>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  История цен
                </h4>

                {historyLoading && (
                  <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Загрузка истории...
                  </div>
                )}

                {historyError && (
                  <div className="text-sm text-red-600 py-4 text-center">
                    {historyError}
                  </div>
                )}

                {!historyLoading && !historyError && history.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Wallet size={13} />
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-normal mb-0.5 leading-tight">Текущая</div>
                        <div className="text-xs font-bold text-slate-800">{formatPrice(currentPrice as number)} ₸</div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                        <ArrowDownCircle size={13} />
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-normal mb-0.5 leading-tight">Минимальная</div>
                        <div className="text-xs font-bold text-green-600">{formatPrice(minPrice as number)} ₸</div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                        <ArrowUpCircle size={13} />
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-normal mb-0.5 leading-tight">Максимальная</div>
                        <div className="text-xs font-bold text-red-600">{formatPrice(maxPrice as number)} ₸</div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Minus size={13} />
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-normal mb-0.5 leading-tight">Средняя</div>
                        <div className="text-xs font-bold text-slate-800">{formatPrice(Math.round(avgPrice as number))} ₸</div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-start gap-2 col-span-2 sm:col-span-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          overallChangePercent !== null && overallChangePercent > 0
                            ? "bg-red-50 text-red-600"
                            : overallChangePercent !== null && overallChangePercent < 0
                            ? "bg-green-50 text-green-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {overallChangePercent !== null && overallChangePercent > 0 ? (
                          <TrendingUp size={13} />
                        ) : overallChangePercent !== null && overallChangePercent < 0 ? (
                          <TrendingDown size={13} />
                        ) : (
                          <Minus size={13} />
                        )}
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-normal mb-0.5 leading-tight">Изменение</div>
                        <div
                          className={`text-xs font-bold ${
                            overallChangePercent !== null && overallChangePercent > 0
                              ? "text-red-600"
                              : overallChangePercent !== null && overallChangePercent < 0
                              ? "text-green-600"
                              : "text-slate-800"
                          }`}
                        >
                          {overallChangePercent === null
                            ? "—"
                            : `${overallChangePercent > 0 ? "+" : ""}${overallChangePercent.toFixed(1)}%`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!historyLoading && !historyError && historyAsc.length >= 2 && (
                  <PriceTrendChart
                    points={historyAsc.map((h) => ({ date: h.price_date, price: toNum(h.purchase_price) }))}
                  />
                )}

                {!historyLoading && !historyError && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-400 uppercase">
                        <tr>
                          <th className="p-2.5 font-medium">Дата</th>
                          <th className="p-2.5 font-medium">Цена</th>
                          <th className="p-2.5 font-medium">Δ</th>
                          <th className="p-2.5 font-medium">Поставщик</th>
                          <th className="p-2.5 font-medium text-center">Ссылка</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyDesc.length > 0 ? (
                          historyDesc.map((item) => {
                            const priceNum = toNum(item.purchase_price);
                            const isMin = priceNum === minPrice;
                            const isMax = priceNum === maxPrice;
                            const delta = deltaById.get(item.id) ?? null;
                            const deltaView = delta ? formatDelta(delta.diff, delta.percent) : null;

                            return (
                              <tr key={item.id}>
                                <td className="p-2.5 text-slate-600 whitespace-nowrap">
                                  {formatDate(item.price_date)}
                                </td>
                                <td
                                  className={`p-2.5 font-medium whitespace-nowrap ${
                                    isMin ? "text-green-600" : isMax ? "text-red-600" : "text-slate-800"
                                  }`}
                                >
                                  {formatPrice(item.purchase_price)} ₸
                                  {isMin && " 🟢"}
                                  {isMax && " 🔴"}
                                </td>
                                <td className={`p-2.5 whitespace-nowrap text-xs ${deltaView?.cls || "text-slate-300"}`}>
                                  {deltaView ? deltaView.text : "—"}
                                </td>
                                <td className="p-2.5 text-slate-600">
                                  {item.supplier_raw_name || (
                                    <span className="text-slate-300 italic">
                                      Не указан
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-center">
                                  {item.offer_url ? (
                                    <a
                                      href={item.offer_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex text-slate-500 hover:text-slate-800 transition-colors"
                                    >
                                      <ExternalLink size={14} />
                                    </a>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400">
                              История пуста
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}