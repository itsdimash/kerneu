import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  ProductSearchCombobox,
  type ProductSearchValue,
} from "../ui/product-search-combobox";
import { updateProjectItemProduct, type ProjectItemResponse } from "../../../api/api";

interface FixProductButtonProps {
  projectId: number | string;
  itemId: number;
  currentProductId: number | null;
  currentProductName: string;
  currentUnit: string | null;
  onUpdated: (updated: ProjectItemResponse) => void;
}

// "Исправить товар" (Variant C) — точечная правка привязки позиции к товару
// каталога независимо от статуса проекта: для ошибок сопоставления,
// найденных уже после подтверждения ML-импорта, когда обычное поле
// названия уже задизейблено (см. mlImport.status/is_confirmed в
// ProjectPage.tsx). Не трогает и не дублирует ту блокировку — это отдельное
// действие поверх уже подтверждённой позиции.
export function FixProductButton({
  projectId,
  itemId,
  currentProductId,
  currentProductName,
  currentUnit,
  onUpdated,
}: FixProductButtonProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ProductSearchValue>({
    productId: currentProductId,
    name: currentProductName,
    unit: currentUnit,
  });
  const [saving, setSaving] = useState(false);
  // Backend не отдаёт заранее признак "у позиции уже есть приход/отгрузка" —
  // единственный источник причины отказа — guard в самом PATCH-эндпоинте.
  // Поэтому кнопка всегда кликабельна, а причина недоступности всплывает
  // здесь же после неудачной попытки сохранить, а не до открытия попапа.
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setValue({ productId: currentProductId, name: currentProductName, unit: currentUnit });
      setError(null);
    }
  };

  const handleSave = async () => {
    if (!value.productId || value.productId === currentProductId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProjectItemProduct(projectId, itemId, {
        product_id: value.productId,
      });
      onUpdated(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить товар");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Исправить товар"
          className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Pencil size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2.5">
        <p className="text-xs font-medium text-foreground">Исправить товар позиции</p>
        <ProductSearchCombobox value={value} onChange={setValue} disabled={saving} className="w-full" />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !value.productId}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-primary rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Сохранить
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
