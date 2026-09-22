"use client";

import * as React from "react";
import { ChevronsUpDown, Loader2, Plus } from "lucide-react";

import { cn } from "./utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { createProduct, searchProducts, type ProductSearchResult } from "../../../api/api";

const SEARCH_DEBOUNCE_MS = 250;

export interface ProductSearchValue {
  productId: number | null;
  name: string;
  unit: string | null;
}

interface ProductSearchComboboxProps {
  value: ProductSearchValue;
  onChange: (value: ProductSearchValue) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Строкой поиска товара — при открытии попапа сразу дёргает
// GET /products/search с пустым q (backend отдаёт первые товары списком,
// чтобы можно было просто проскроллить и выбрать не печатая), а по мере
// ввода (debounce 250мс, с любого символа) — с текущим текстом. Выбор
// совпадения заполняет product_id/name/unit; когда искомого товара нет в
// каталоге, внизу списка предлагается создать его через POST /products/
// (см. CreateProductDialog) — после создания строка заполняется точно так
// же, как при выборе обычного результата поиска.
export function ProductSearchCombobox({
  value,
  onChange,
  placeholder = "Наименование позиции",
  disabled,
  className,
}: ProductSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value.name);
  const [results, setResults] = React.useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createDialogQuery, setCreateDialogQuery] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    setQuery(value.name);
  }, [value.name]);

  // Пока попап закрыт, поиск не гоняем — открытие (см. onOpenChange у
  // Popover) само подтолкнёт этот эффект через смену open, и тогда уйдёт
  // запрос с текущим (возможно пустым) query.
  React.useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;
    setLoading(true);

    const timer = setTimeout(() => {
      searchProducts(trimmed)
        .then((items) => {
          if (requestId !== requestIdRef.current) return;
          setResults(items);
          setError(null);
        })
        .catch((err) => {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
          setError(err instanceof Error ? err.message : "Не удалось выполнить поиск товара");
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  const trimmedQuery = query.trim();
  const hasExactMatch = results.some(
    (result) => result.name.trim().toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreateOption = trimmedQuery.length > 0 && !hasExactMatch;

  const handleSelectResult = (result: ProductSearchResult) => {
    onChange({ productId: result.id, name: result.name, unit: result.unit });
    setQuery(result.name);
    setOpen(false);
  };

  const handleOpenCreateDialog = () => {
    if (!trimmedQuery) return;
    setCreateDialogQuery(trimmedQuery);
    setOpen(false);
  };

  const handleProductCreated = (created: { productId: number; name: string; unit: string | null }) => {
    onChange({ productId: created.productId, name: created.name, unit: created.unit });
    setQuery(created.name);
    setCreateDialogQuery(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-auto min-h-9 w-64 justify-between gap-2 px-2 py-1.5 text-sm font-normal",
              className,
            )}
          >
            <span className={cn("truncate", !value.name && "text-muted-foreground")}>
              {value.name || placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-hidden p-0"
        >
          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 size-4 shrink-0 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <CommandList className="max-h-64 overflow-y-auto">
              {error && (
                <p className="px-3 py-2 text-xs text-destructive">{error}</p>
              )}
              {!error && !loading && results.length === 0 && (
                <CommandEmpty>Ничего не найдено</CommandEmpty>
              )}
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={String(result.id)}
                      onSelect={() => handleSelectResult(result)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{result.name}</span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        {result.available_quantity} {result.unit ?? ""}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreateOption && (
                <CommandGroup forceMount>
                  <CommandItem
                    forceMount
                    value={`__create__${trimmedQuery}`}
                    onSelect={handleOpenCreateDialog}
                    className="gap-2 text-primary"
                  >
                    <Plus className="size-4 shrink-0" />
                    <span className="truncate">Создать товар «{trimmedQuery}»</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateProductDialog
        query={createDialogQuery}
        onOpenChange={(nextOpen) => { if (!nextOpen) setCreateDialogQuery(null); }}
        onCreated={handleProductCreated}
      />
    </>
  );
}

interface CreateProductDialogProps {
  // Открыт, когда не null — значение сразу же используется как затравка
  // для поля названия.
  query: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: { productId: number; name: string; unit: string | null }) => void;
}

// Диалог создания нового товара через POST /products/ — открывается из
// пункта «Создать товар «…»» комбобокса, когда искомого товара нет в
// каталоге. Название предзаполняется введённым в поиске текстом; поле
// "Единица измерения" — единственное дополнительное поле, которое реально
// нужно заполнить сразу (остальное — поставщик/цены — backend проставляет
// дефолтами и донастраивается позже, как и в существующем «Добавить товар
// в систему» на ProjectPage).
function CreateProductDialog({ query, onOpenChange, onCreated }: CreateProductDialogProps) {
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (query != null) {
      setName(query);
      setUnit("");
      setError(null);
    }
  }, [query]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();

    if (!trimmedName) {
      setError("Укажите название товара");
      return;
    }
    if (!trimmedUnit) {
      setError("Укажите единицу измерения");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const created = await createProduct({ product_name: trimmedName, unit: trimmedUnit });
      onCreated({
        productId: created.id,
        name: created.name,
        unit: created.unit ?? trimmedUnit,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать товар");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={query != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать товар</DialogTitle>
          <DialogDescription>
            Товара нет в каталоге — создайте его, и строка будет сразу привязана к нему.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Название товара
            </span>
            <input
                type="text"
                autoFocus
                required
                maxLength={255}
                disabled={saving}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Единица измерения
            </span>
            <input
                type="text"
                required
                maxLength={50}
                list="product-search-combobox-unit-options"
                disabled={saving}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="Выберите или введите"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
            />
            <datalist id="product-search-combobox-unit-options">
              {["шт", "компл.", "упак.", "кг", "м", "л"].map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Создаём…" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
