import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown, Inbox, Loader2, Package, Pencil, Search } from "lucide-react";
import { ConfirmDialog } from "../../app/components/modals/ConfirmDialog";
import type { KitComponentValue } from "../../app/components/common/KitComponentsEditor";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "../../app/components/ui/accordion";
import {
  fetchKits,
  fetchProducts,
  updateKitComponents,
  updateProductName,
  type KitListItem,
  type ProductInfo,
} from "../../api/api";
import { describeLoadError, type LoadFailure } from "../../lib/loadError";
import { KitComponentsList } from "./KitComponentsList";
import { RenameableName, autoResizeNameTextarea } from "./RenameableName";
import { StockLoadError } from "./StockLoadError";

const toValues = (kit: KitListItem): KitComponentValue[] =>
  kit.components.map((c) => ({ productId: c.component_product_id, quantity: c.default_quantity }));

const sameValues = (a: KitComponentValue[], b: KitComponentValue[]) =>
  a.length === b.length && a.every((item, i) => item.productId === b[i].productId && item.quantity === b[i].quantity);

// Вкладка «Комплекты» (pm и комдир): все комплекты, переименование и правка
// состава по умолчанию. Меняется только каталог — позиции проектов хранят
// свой снимок названия и состава. Монтируется при первом открытии вкладки.
export function KitsTab({ onKitRenamed }: { onKitRenamed: (productId: number, name: string) => void }) {
  const [kits, setKits] = useState<KitListItem[]>([]);
  // Каталог грузится один раз вместе с комплектами и отдаётся всем редакторам.
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [expanded, setExpanded] = useState<string[]>([]);

  // Режим правки состава по id комплекта и черновик на время правки. Живут здесь, а не в
  // содержимом аккордеона, чтобы переживать сворачивание комплекта и смену вкладки.
  const [editingKitIds, setEditingKitIds] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, KitComponentValue[]>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Переименование — тот же поток, что и в таблице остатков: клик → ConfirmDialog → textarea → blur/Enter.
  const [renameUnlockTarget, setRenameUnlockTarget] = useState<KitListItem | null>(null);
  const [unlockedRenameId, setUnlockedRenameId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const [kitList, catalog] = await Promise.all([fetchKits(), fetchProducts()]);
      setKits(kitList);
      setProducts(Array.isArray(catalog) ? catalog : []);
    } catch (e) {
      setFailure(describeLoadError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredKits = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return q === "" ? kits : kits.filter((kit) => kit.name.toLowerCase().includes(q));
  }, [kits, deferredSearch]);

  const isSearching = deferredSearch.trim() !== "";
  const accordionValue = useMemo(
    () => (isSearching ? Array.from(new Set([...expanded, ...filteredKits.map((k) => String(k.id))])) : expanded),
    [isSearching, expanded, filteredKits],
  );

  const handleRenameBlur = async (kit: KitListItem, event: React.FocusEvent<HTMLTextAreaElement>) => {
    const previous = kit.name;
    const target = event.target;
    const nextName = target.value.trim();

    if (!nextName) {
      toast.error("Название комплекта не может быть пустым");
      target.value = previous;
      autoResizeNameTextarea(target);
      setUnlockedRenameId(null);
      return;
    }
    if (nextName === previous) {
      setUnlockedRenameId(null);
      return;
    }

    setRenamingId(kit.id);
    try {
      const updated = await updateProductName(kit.id, nextName);
      setKits((prev) => prev.map((k) => (k.id === kit.id ? { ...k, name: updated.name } : k)));
      onKitRenamed(kit.id, updated.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось изменить название комплекта");
      target.value = previous;
      autoResizeNameTextarea(target);
    } finally {
      setRenamingId(null);
      setUnlockedRenameId(null);
    }
  };

  const setDraft = (kitId: number, next: KitComponentValue[]) => {
    setDrafts((prev) => ({ ...prev, [kitId]: next }));
  };

  const startEditing = (kit: KitListItem) => {
    setDrafts((prev) => ({ ...prev, [kit.id]: toValues(kit) }));
    setEditingKitIds((prev) => new Set(prev).add(kit.id));
  };

  // Отмена и успешное сохранение: выход из правки и сброс черновика.
  const stopEditing = (kitId: number) => {
    setEditingKitIds((prev) => {
      const next = new Set(prev);
      next.delete(kitId);
      return next;
    });
    setDrafts((prev) => {
      const { [kitId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleSave = async (kit: KitListItem, draft: KitComponentValue[]) => {
    if (savingId === kit.id) return;
    if (draft.some((c) => !Number.isInteger(c.quantity) || c.quantity < 1)) {
      toast.error("Укажите целое количество не меньше 1 у каждого товара в составе");
      return;
    }
    setSavingId(kit.id);
    try {
      const updated = await updateKitComponents(
        kit.id,
        draft.map((c) => ({ component_product_id: c.productId, default_quantity: c.quantity })),
      );
      setKits((prev) => prev.map((k) => (k.id === updated.id ? updated : k)));
      stopEditing(kit.id);
      toast.success("Состав комплекта сохранён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить состав комплекта");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию комплекта…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Загрузка комплектов…</p>
          </div>
        ) : failure ? (
          <StockLoadError failure={failure} onRetry={() => void load()} title="Не удалось загрузить комплекты" />
        ) : filteredKits.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <Inbox size={22} className="text-muted-foreground/50" />
            {kits.length === 0 ? "Комплектов пока нет" : "Ничего не найдено"}
          </div>
        ) : (
          <Accordion type="multiple" value={accordionValue} onValueChange={setExpanded} className="flex flex-col">
            {filteredKits.map((kit) => {
              const isEditing = editingKitIds.has(kit.id);
              const draft = drafts[kit.id] ?? toValues(kit);
              const dirty = !sameValues(draft, toValues(kit));
              const saving = savingId === kit.id;
              return (
                <AccordionItem key={kit.id} value={String(kit.id)} className="border-border">
                  {/* Вся строка — зона раскрытия: триггер лежит под содержимым (absolute inset-0),
                      видимые элементы не перехватывают клики (pointer-events-none), а название —
                      отдельный интерактивный элемент поверх, не вложенный в триггер. */}
                  <div className="relative flex items-center gap-3 bg-muted/40 px-4 transition-colors hover:bg-muted/60">
                    <AccordionPrimitive.Header className="absolute inset-0 flex">
                      <AccordionPrimitive.Trigger
                        aria-label={`Состав комплекта «${kit.name}»`}
                        className="h-full w-full cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                      />
                    </AccordionPrimitive.Header>
                    <Package size={16} className="pointer-events-none relative shrink-0 text-blue-600 dark:text-blue-400" />
                    <div className="pointer-events-none relative min-w-0 flex-1 py-1.5">
                      <div className={`pointer-events-auto ${unlockedRenameId === kit.id ? "w-full" : "w-fit max-w-full"}`}>
                        <RenameableName
                          name={kit.name}
                          isUnlocked={unlockedRenameId === kit.id}
                          isSaving={renamingId === kit.id}
                          onOpen={() => setRenameUnlockTarget(kit)}
                          onCommit={(event) => void handleRenameBlur(kit, event)}
                        />
                      </div>
                    </div>
                    <span className="pointer-events-none relative whitespace-nowrap text-xs font-normal text-muted-foreground">
                      {kit.components.length === 0 ? "Состав не задан" : `${kit.components.length} в составе`}
                    </span>
                    <ChevronDown
                      className={`pointer-events-none relative size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${accordionValue.includes(String(kit.id)) ? "rotate-180" : ""}`}
                    />
                  </div>
                  <AccordionContent className="px-4 pt-4">
                    {isEditing ? (
                      <>
                        <div className="mb-3 flex items-center gap-2">
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
                            Редактирование
                          </span>
                        </div>
                        <KitComponentsList
                          value={draft}
                          onChange={(next) => setDraft(kit.id, next)}
                          kitId={kit.id}
                          disabled={saving}
                          products={products}
                        />
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => stopEditing(kit.id)}
                            disabled={saving}
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSave(kit, draft)}
                            disabled={!dirty || saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            Сохранить
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {kit.components.length === 0 ? (
                          <p className="rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">
                            Состав не задан
                          </p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                            {kit.components.map((c) => (
                              <div key={c.component_product_id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                  {c.component_name}
                                </p>
                                <span className="shrink-0 whitespace-nowrap text-sm font-mono text-foreground">
                                  × {c.default_quantity.toLocaleString("ru-RU")}
                                  {c.component_unit ? ` ${c.component_unit}` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => startEditing(kit)}
                            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                          >
                            <Pencil size={14} />
                            {kit.components.length === 0 ? "Задать состав" : "Изменить состав"}
                          </button>
                        </div>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>

      {renameUnlockTarget && (
        <ConfirmDialog
          title={`Изменить название комплекта «${renameUnlockTarget.name}»?`}
          description="Название изменится только в каталоге — в существующих проектах останется прежним."
          confirmLabel="Изменить"
          tone="primary"
          onConfirm={() => {
            setUnlockedRenameId(renameUnlockTarget.id);
            setRenameUnlockTarget(null);
          }}
          onCancel={() => setRenameUnlockTarget(null)}
        />
      )}
    </>
  );
}
