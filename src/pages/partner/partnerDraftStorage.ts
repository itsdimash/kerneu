import { fetchPartnerStocks, type PartnerStockItem } from "../../api/partner";

// Черновик партнёрской заявки в sessionStorage. Ключ содержит id пользователя
// (/auth/me), поэтому другой пользователь в той же вкладке чужой черновик не увидит.
// Храним только то, что ввёл пользователь: проект, комментарий и позиции
// {product_id, name, unit, quantity}. Остатки не храним — они актуализируются при восстановлении.

export type StoredDraftItem = {
  product_id: number;
  name: string;
  unit: string | null;
  quantity: string;
};

export type StoredDraft = {
  project_name: string;
  comment: string;
  items: StoredDraftItem[];
};

const storageKey = (userId: number) => `kerneu:partner-draft:${userId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItem(value: unknown): StoredDraftItem | null {
  if (!isRecord(value)) return null;
  const { product_id, name, unit, quantity } = value;
  if (typeof product_id !== "number" || !Number.isSafeInteger(product_id)) return null;
  if (typeof name !== "string" || typeof quantity !== "string") return null;
  if (unit !== null && typeof unit !== "string") return null;
  return { product_id, name, unit, quantity };
}

export function isDraftEmpty(draft: StoredDraft): boolean {
  return draft.items.length === 0 && draft.project_name.trim() === "" && draft.comment.trim() === "";
}

export function clearStoredDraft(userId: number): void {
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    /* sessionStorage недоступен — не критично */
  }
}

// null — черновика нет или он повреждён (в этом случае ключ удаляется).
export function loadStoredDraft(userId: number): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.project_name !== "string" || typeof parsed.comment !== "string" || !Array.isArray(parsed.items)) {
      clearStoredDraft(userId);
      return null;
    }
    const items: StoredDraftItem[] = [];
    const seen = new Set<number>();
    for (const entry of parsed.items) {
      const item = parseItem(entry);
      if (item === null) {
        clearStoredDraft(userId);
        return null;
      }
      if (!seen.has(item.product_id)) {
        seen.add(item.product_id);
        items.push(item);
      }
    }
    const draft: StoredDraft = { project_name: parsed.project_name, comment: parsed.comment, items };
    if (isDraftEmpty(draft)) {
      clearStoredDraft(userId);
      return null;
    }
    return draft;
  } catch {
    clearStoredDraft(userId);
    return null;
  }
}

// Пустой черновик удаляем из хранилища.
export function saveStoredDraft(userId: number, draft: StoredDraft): void {
  try {
    if (isDraftEmpty(draft)) {
      sessionStorage.removeItem(storageKey(userId));
      return;
    }
    sessionStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {
    /* квота или приватный режим — не критично */
  }
}

// ------------------------------------------
// Актуализация позиций при восстановлении
// ------------------------------------------

export type RefreshOutcome =
  | { status: "found"; name: string; unit: string | null; available: number }
  | { status: "gone" }
  | { status: "error" };

const LOOKUP_PAGE_LIMIT = 100;
const LOOKUP_MAX_PAGES = 20;
const MAX_PARALLEL = 4;

// Эндпоинта «по id» нет: ищем через GET /partner/stocks?q=<название>, in_stock_only=false,
// limit=100 и выбираем нужные product_id; если не нашли, но total больше полученного — читаем дальше.
async function lookupByName(name: string, ids: ReadonlySet<number>): Promise<Map<number, PartnerStockItem>> {
  const found = new Map<number, PartnerStockItem>();
  let offset = 0;
  for (let page = 0; page < LOOKUP_MAX_PAGES; page++) {
    const res = await fetchPartnerStocks({ q: name, in_stock_only: false, limit: LOOKUP_PAGE_LIMIT, offset });
    for (const item of res.items) {
      if (ids.has(item.product_id)) found.set(item.product_id, item);
    }
    offset += res.items.length;
    if (found.size === ids.size || res.items.length === 0 || offset >= res.total) break;
  }
  return found;
}

// Запросы по одинаковым названиям объединяются, одновременно не более MAX_PARALLEL.
export async function refreshStoredItems(items: readonly StoredDraftItem[]): Promise<Map<number, RefreshOutcome>> {
  const groups = new Map<string, Set<number>>();
  for (const item of items) {
    const ids = groups.get(item.name) ?? new Set<number>();
    ids.add(item.product_id);
    groups.set(item.name, ids);
  }

  const outcomes = new Map<number, RefreshOutcome>();
  const queue = Array.from(groups.entries());
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const [name, ids] = queue[cursor++];
      try {
        const found = await lookupByName(name, ids);
        for (const id of ids) {
          const item = found.get(id);
          outcomes.set(
            id,
            item && item.available_quantity > 0
              ? { status: "found", name: item.name, unit: item.unit, available: item.available_quantity }
              : { status: "gone" },
          );
        }
      } catch {
        for (const id of ids) outcomes.set(id, { status: "error" });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker));
  return outcomes;
}
