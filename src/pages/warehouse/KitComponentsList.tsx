import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../app/components/ui/command";
import { ConfirmDialog } from "../../app/components/modals/ConfirmDialog";
import type { KitComponentValue } from "../../app/components/common/KitComponentsEditor";
import type { ProductInfo } from "../../api/api";

// Редактор состава комплекта для вкладки «Комплекты»: один список (название,
// количество, «Удалить») и кнопка «Добавить компонент». Каталог приходит
// готовым (KitsTab грузит его один раз). Всё меняет только черновик —
// сохраняет его KitsTab по кнопке «Сохранить».
export function KitComponentsList({
  value,
  onChange,
  products,
  kitId,
  disabled,
}: {
  value: KitComponentValue[];
  onChange: (next: KitComponentValue[]) => void;
  products: ProductInfo[];
  kitId: number;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Удаление компонента — только после подтверждения; один диалог на весь список.
  const [pendingRemoveProductId, setPendingRemoveProductId] = useState<number | null>(null);
  const [focusProductId, setFocusProductId] = useState<number | null>(null);
  const qtyRefs = useRef(new Map<number, HTMLInputElement>());

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Нельзя добавить: комплекты, сам комплект и уже добавленные компоненты.
  const options = useMemo(() => {
    const used = new Set(value.map((c) => c.productId));
    return products.filter((p) => !p.is_kit && p.id !== kitId && !used.has(p.id));
  }, [products, kitId, value]);

  // Фокус на количестве только что добавленной строки (после её появления в DOM)
  useEffect(() => {
    if (focusProductId === null) return;
    const el = qtyRefs.current.get(focusProductId);
    if (el) {
      el.focus();
      el.select();
      setFocusProductId(null);
    }
  }, [focusProductId, value]);

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

  const confirmRemove = () => {
    if (pendingRemoveProductId === null) return;
    const productId = pendingRemoveProductId;
    onChange(value.filter((item) => item.productId !== productId));
    setPendingRemoveProductId(null);
  };

  const pendingRemoveName =
    pendingRemoveProductId === null
      ? ""
      : productById.get(pendingRemoveProductId)?.name ?? `Товар #${pendingRemoveProductId}`;

  const add = (productId: number) => {
    if (value.some((item) => item.productId === productId)) return;
    onChange([...value, { productId, quantity: 1 }]);
    setPickerOpen(false);
    setFocusProductId(productId);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          Состав пуст. Добавьте компоненты.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <div className="flex items-center gap-3 border-b border-border bg-background/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="min-w-0 flex-1">Товар</span>
            <span className="w-20 shrink-0 text-right">Кол-во</span>
            <span className="w-24 shrink-0" />
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto">
            {value.map((item) => {
              const product = productById.get(item.productId);
              return (
                <div key={item.productId} className="flex items-center gap-3 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {product?.name ?? `Товар #${item.productId}`}
                    {product?.unit ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{product.unit}</span> : null}
                  </p>
                  <input
                    ref={(el) => {
                      if (el) qtyRefs.current.set(item.productId, el);
                      else qtyRefs.current.delete(item.productId);
                    }}
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
                    onClick={() => setPendingRemoveProductId(item.productId)}
                    className="inline-flex w-24 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-400/20"
                  >
                    <Trash2 size={14} />
                    Удалить
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Plus size={14} />
            Добавить компонент
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command>
            <CommandInput placeholder="Поиск по каталогу…" />
            <CommandList className="max-h-64 overflow-y-auto">
              <CommandEmpty>Ничего не найдено</CommandEmpty>
              <CommandGroup>
                {options.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={`${product.name} ${product.id}`}
                    onSelect={() => add(product.id)}
                  >
                    <span className="truncate">{product.name}</span>
                    {product.unit ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{product.unit}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {pendingRemoveProductId !== null && (
        <ConfirmDialog
          title={`Удалить компонент «${pendingRemoveName}» из комплекта?`}
          description="Изменение применится после нажатия «Сохранить»."
          confirmLabel="Удалить"
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemoveProductId(null)}
        />
      )}
    </div>
  );
}
