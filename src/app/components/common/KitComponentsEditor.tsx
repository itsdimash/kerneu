import { useEffect, useMemo, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { MultiSelectCombobox } from "../ui/multi-select";
import { fetchProducts, type ProductInfo } from "../../../api/api";

export type KitComponentValue = { productId: number; quantity: number };

/**
 * Выбор состава комплекта: товары каталога (кроме комплектов и самого
 * товара) с количеством на один комплект. Без себестоимости и остатков.
 */
export function KitComponentsEditor({
  value,
  onChange,
  excludeProductId,
  disabled,
  title = "Состав комплекта",
  products: providedProducts,
}: {
  value: KitComponentValue[];
  onChange: (next: KitComponentValue[]) => void;
  excludeProductId?: number;
  disabled?: boolean;
  title?: string;
  /** Каталог уже загружен снаружи (вкладка «Комплекты») — тогда fetchProducts() не вызывается */
  products?: ProductInfo[];
}) {
  const [fetchedProducts, setFetchedProducts] = useState<ProductInfo[]>([]);
  const [fetching, setFetching] = useState(providedProducts === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const products = providedProducts ?? fetchedProducts;
  const loading = providedProducts === undefined && fetching;

  // Каталог грузим один раз при монтировании (если не передан снаружи)
  useEffect(() => {
    if (providedProducts !== undefined) return;
    let cancelled = false;
    fetchProducts()
      .then((list) => {
        if (!cancelled) setFetchedProducts(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Не удалось загрузить каталог товаров");
        }
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providedProducts]);

  const options = useMemo(
    () =>
      products
        .filter((product) => !product.is_kit && product.id !== excludeProductId)
        .map((product) => ({ value: String(product.id), label: product.name })),
    [products, excludeProductId],
  );

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    products.forEach((product) => map.set(product.id, product.name));
    return map;
  }, [products]);

  const selectedIds = value.map((item) => String(item.productId));

  const handleSelect = (ids: string[]) => {
    onChange(
      Array.from(new Set(ids)).map((id) => {
        const existing = value.find((item) => String(item.productId) === id);
        return { productId: Number(id), quantity: existing?.quantity ?? 1 };
      }),
    );
  };

  const setQuantity = (productId: number, raw: string) => {
    const qty = Number(raw);
    onChange(
      value.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 1 }
          : item,
      ),
    );
  };

  const remove = (productId: number) => {
    onChange(value.filter((item) => item.productId !== productId));
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-foreground">{title}</span>

      {loadError && <p className="text-xs text-destructive">{loadError}</p>}

      <MultiSelectCombobox
        options={options}
        selected={selectedIds}
        onChange={handleSelect}
        placeholder="Выберите товары комплекта…"
        searchPlaceholder="Поиск по каталогу…"
        emptyText={loading ? "Загрузка каталога…" : "Ничего не найдено"}
        disabled={disabled || loading}
      />

      {loading && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Загрузка каталога…
        </span>
      )}

      {value.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {value.map((item) => (
            <div key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {nameById.get(item.productId) ?? `Товар #${item.productId}`}
              </p>
              <input
                type="number"
                min={1}
                step="1"
                aria-label="Количество в комплекте"
                disabled={disabled}
                value={item.quantity}
                onChange={(event) => setQuantity(item.productId, event.target.value)}
                className="w-20 shrink-0 rounded-md border border-border bg-card px-2 py-1 text-right text-sm focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(item.productId)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                aria-label="Убрать из комплекта"
                title="Убрать из комплекта"
              >
                <XCircle size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
