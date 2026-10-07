import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { KitComponentsEditor, type KitComponentValue } from "../common/KitComponentsEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  createNewProduct,
  searchProducts,
  type ProductOut,
  type ProductSearchResult,
} from "../../../api/api";

const DEFAULT_UNIT = "шт";
const UNIT_OPTIONS = ["шт", "комплект", "упак.", "кг", "м", "л"];
const OTHER_UNIT = "__other__";
const SUGGEST_DEBOUNCE_MS = 250;
const SUGGEST_MIN_LENGTH = 2;
const SUGGEST_LIMIT = 5;

// Сравнение названий: без учёта регистра, после trim и схлопывания пробелов
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Создание товара с нулевым остатком (POST /products/new). Приход оформляется
 * отдельно — заявкой на приход. Ошибки (в т.ч. 409 дубликата) показываются
 * внутри диалога, он остаётся открытым.
 */
export function NewProductModal({
  open,
  onClose,
  onCreated,
  onPickExisting,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (product: ProductOut, meta: { withComponents: boolean }) => void;
  /** Клик по подсказке: страница сама закрывает диалог и подставляет название в поиск. */
  onPickExisting: (name: string) => void;
}) {
  const [name, setName] = useState("");
  // Выбор из списка (или OTHER_UNIT + свой ввод); от режима комплекта не зависит
  const [unitChoice, setUnitChoice] = useState(DEFAULT_UNIT);
  const [customUnit, setCustomUnit] = useState("");
  const [isKit, setIsKit] = useState(false);
  const [components, setComponents] = useState<KitComponentValue[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ProductSearchResult[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestRequestIdRef = useRef(0);

  const debouncedName = useDebouncedValue(name.trim(), SUGGEST_DEBOUNCE_MS);

  // Сброс полей, комплекта и ошибки при каждом открытии и закрытии
  useEffect(() => {
    setName("");
    setUnitChoice(DEFAULT_UNIT);
    setCustomUnit("");
    setIsKit(false);
    setComponents([]);
    setError(null);
    setSaving(false);
    setSuggestions([]);
    setSuggestLoading(false);
    suggestRequestIdRef.current++;
  }, [open]);

  // Live-подсказки похожих товаров. Устаревшие ответы отбрасываются по
  // счётчику запроса; ошибка поиска молча скрывает блок и не мешает созданию.
  useEffect(() => {
    const requestId = ++suggestRequestIdRef.current;
    if (!open || debouncedName.length < SUGGEST_MIN_LENGTH) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    searchProducts(debouncedName, SUGGEST_LIMIT)
      .then((items) => {
        if (requestId !== suggestRequestIdRef.current) return;
        setSuggestions(items.slice(0, SUGGEST_LIMIT));
      })
      .catch(() => {
        if (requestId !== suggestRequestIdRef.current) return;
        setSuggestions([]);
      })
      .finally(() => {
        if (requestId !== suggestRequestIdRef.current) return;
        setSuggestLoading(false);
      });
  }, [debouncedName, open]);

  const typedKey = normalizeName(name);
  const hasExactMatch =
    typedKey.length > 0 && suggestions.some((item) => normalizeName(item.name) === typedKey);
  const showSuggestions =
    name.trim().length >= SUGGEST_MIN_LENGTH && (suggestLoading || suggestions.length > 0);

  // Текущая выбранная единица (для подсказки и отправки)
  const selectedUnit = unitChoice === OTHER_UNIT ? customUnit : unitChoice;

  // Состав необязателен, но у добавленных компонентов количество должно быть целым >= 1
  const kitInvalid =
    isKit && components.some((c) => !Number.isInteger(c.quantity) || c.quantity < 1);

  const handleKitToggle = (checked: boolean) => {
    setIsKit(checked);
    // При выключении состав сбрасывается, единица остаётся прежней
    if (!checked) setComponents([]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const trimmedName = name.trim();
    const trimmedUnit = (unitChoice === OTHER_UNIT ? customUnit : unitChoice)
      .trim()
      .replace(/\s+/g, " ");

    if (!trimmedName) {
      setError("Укажите название товара");
      return;
    }
    if (!trimmedUnit) {
      setError("Укажите единицу измерения");
      return;
    }

    if (kitInvalid) {
      setError("Укажите целое количество не меньше 1 у каждого товара в составе");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const created = await createNewProduct({
        name: trimmedName,
        unit: trimmedUnit,
        ...(isKit
          ? {
              is_kit: true,
              ...(components.length > 0
                ? { components: components.map((c) => ({ product_id: c.productId, quantity: c.quantity })) }
                : {}),
            }
          : {}),
      });
      onCreated({ ...created, is_kit: isKit || created.is_kit }, { withComponents: components.length > 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать товар");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${isKit ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <DialogHeader>
          <DialogTitle>Новый товар</DialogTitle>
          <DialogDescription>
            Товар появится в каталоге с нулевым остатком. Приход оформляется отдельно заявкой на приход.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Название товара</span>
            <input
              type="text"
              autoFocus
              maxLength={255}
              disabled={saving}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
            />
          </label>

          {showSuggestions && (
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                Похожие товары
                {suggestLoading && <Loader2 className="size-3 animate-spin" aria-label="Ищу…" />}
              </div>
              {hasExactMatch && (
                <p className="mb-1.5 text-xs text-amber-600 dark:text-amber-400">
                  Такой товар уже есть в каталоге
                </p>
              )}
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {suggestions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onPickExisting(item.name)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                    >
                      <span className="min-w-0 break-words text-foreground">{item.name}</span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {item.unit?.trim() || "—"}
                        {typeof item.quantity === "number" &&
                          ` · ${item.quantity > 0 ? `Остаток: ${item.quantity.toLocaleString("ru-RU")}` : "Нет на складе"}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <label htmlFor="new-product-is-kit" className="text-sm font-medium text-foreground">
              Это комплект
            </label>
            <Switch
              id="new-product-is-kit"
              checked={isKit}
              onCheckedChange={handleKitToggle}
              disabled={saving}
            />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Комплект состоит из других товаров со склада. Остаток считается по составу.
          </p>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">Единица измерения</span>
            <Select
              value={unitChoice}
              onValueChange={setUnitChoice}
              disabled={saving}
            >
              <SelectTrigger aria-label="Единица измерения">
                <SelectValue placeholder="Выберите единицу" />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_UNIT}>Другое…</SelectItem>
              </SelectContent>
            </Select>
            {unitChoice === OTHER_UNIT && (
              <input
                type="text"
                maxLength={50}
                disabled={saving}
                value={customUnit}
                onChange={(event) => setCustomUnit(event.target.value)}
                placeholder="Введите единицу измерения"
                className="mt-2 w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted"
              />
            )}
            {!isKit && selectedUnit.toLowerCase().replace(/\s+/g, "") === "комплект" && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Это только единица измерения. Чтобы товар состоял из других товаров, включите «Это комплект».
              </p>
            )}
          </div>

          {isKit && (
            <div>
              <KitComponentsEditor
                title="Состав комплекта (необязательно)"
                value={components}
                onChange={setComponents}
                disabled={saving}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Состав можно не указывать: его можно выбрать позже на странице проекта.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || kitInvalid} className="gap-1.5">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Создаём…" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
