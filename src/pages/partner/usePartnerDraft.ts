import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  PARTNER_MAX_ITEMS,
  PROJECT_NAME_MAX,
  PROJECT_NAME_MIN,
  createPartnerRequest,
  parsePartnerError,
  type InsufficientStockItem,
  type PartnerRequest,
  type PartnerStockItem,
} from "../../api/partner";
import { parseQuantity } from "./partnerUi";
import {
  clearStoredDraft,
  loadStoredDraft,
  refreshStoredItems,
  saveStoredDraft,
  type StoredDraft,
} from "./partnerDraftStorage";

const SAVE_DEBOUNCE_MS = 400;

export type DraftLine = {
  productId: number;
  name: string;
  unit: string | null;
  // null — остаток неизвестен (не удалось актуализировать при восстановлении черновика).
  available: number | null;
  // Строкой: иначе контролируемый ввод съедает промежуточное значение.
  quantity: string;
};

export type SubmitProblem =
  | { kind: "insufficient"; message: string; items: InsufficientStockItem[] }
  | { kind: "message"; message: string; lines?: string[] };

export function lineError(line: DraftLine): string | null {
  const qty = parseQuantity(line.quantity);
  if (qty === null) return "Укажите целое количество больше нуля";
  if (line.available !== null && qty > line.available) return `Доступно только ${line.available}`;
  return null;
}

// Название проекта валидно, когда после обрезки пробелов в нём 2..200 символов.
export function isProjectNameValid(name: string): boolean {
  const length = name.trim().length;
  return length >= PROJECT_NAME_MIN && length <= PROJECT_NAME_MAX;
}

export type PartnerDraft = ReturnType<typeof usePartnerDraft>;

// Черновик заявки живёт в PartnerApp — выше страниц «Склад», «Заявка» и
// «Мои заявки», поэтому переживает любые переходы между ними. Очищается только
// после успешной отправки или по «Очистить заявку».
function toStored(projectName: string, comment: string, lines: DraftLine[]): StoredDraft {
  return {
    project_name: projectName,
    comment,
    items: lines.map((l) => ({ product_id: l.productId, name: l.name, unit: l.unit, quantity: l.quantity })),
  };
}

function summarizeNames(names: string[]): string {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} и ещё ${names.length - 3}` : shown;
}

// Черновик хранится в sessionStorage (ключ с id пользователя) и переживает F5.
// userId === null — пользователь ещё не известен: ничего не читаем и не пишем.
export function usePartnerDraft({
  userId,
  onCreated,
  onNoCompany,
}: {
  userId: number | null;
  onCreated: (request: PartnerRequest) => void;
  onNoCompany: () => void;
}) {
  const [projectName, setProjectNameState] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const [stockRefreshKey, setStockRefreshKey] = useState(0);
  // ready — восстановление для текущего пользователя завершено; до этого хранилище не перезаписывается.
  const [ready, setReady] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const callbacks = useRef({ onCreated, onNoCompany });
  callbacks.current = { onCreated, onNoCompany };

  // product_id → количество (для степпера в каталоге)
  const quantities = useMemo(() => new Map(lines.map((l) => [l.productId, l.quantity])), [lines]);
  const limitReached = lines.length >= PARTNER_MAX_ITEMS;

  const setProjectName = useCallback((value: string) => {
    setProjectError(null);
    setProjectNameState(value);
  }, []);

  const linesRef = useRef(lines);
  linesRef.current = lines;

  const restoreSeq = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // ---- Восстановление при старте (и при смене пользователя) ----
  useEffect(() => {
    const token = ++restoreSeq.current;
    // Смена пользователя: чужой черновик из состояния убираем.
    setReady(false);
    setRestoreFailed(false);
    setProjectNameState("");
    setComment("");
    setLines([]);
    setProblem(null);
    setProjectError(null);
    if (userId === null) return;

    const stored = loadStoredDraft(userId);
    if (stored === null) {
      setReady(true);
      return;
    }

    setProjectNameState(stored.project_name);
    setComment(stored.comment);
    // Остаток пока неизвестен (null), пока не придёт актуальный.
    setLines(stored.items.map((i) => ({ productId: i.product_id, name: i.name, unit: i.unit, available: null, quantity: i.quantity })));

    void (async () => {
      const outcomes = await refreshStoredItems(stored.items);
      if (token !== restoreSeq.current) return;

      const removed: string[] = [];
      let clamped = false;
      let failed = false;
      for (const item of stored.items) {
        const outcome = outcomes.get(item.product_id);
        if (!outcome || outcome.status === "error") {
          failed = true;
        } else if (outcome.status === "gone") {
          removed.push(item.name);
        } else if ((parseQuantity(item.quantity) ?? 1) > outcome.available) {
          clamped = true;
        }
      }

      // Слияние по product_id: позиции, добавленные на «Складе» во время
      // восстановления, в outcomes отсутствуют и остаются как есть.
      setLines((prev) =>
        prev.flatMap((l) => {
          const outcome = outcomes.get(l.productId);
          if (!outcome || outcome.status === "error") return [l];
          if (outcome.status === "gone") return [];
          const qty = parseQuantity(l.quantity) ?? 1;
          const quantity = String(Math.min(Math.max(qty, 1), outcome.available));
          return [{ ...l, name: outcome.name, unit: outcome.unit, available: outcome.available, quantity }];
        }),
      );
      setRestoreFailed(failed);
      setReady(true);

      if (removed.length > 0) toast.warning(`Некоторые товары закончились и убраны из заявки: ${summarizeNames(removed)}`);
      if (clamped) toast.info("Количество некоторых товаров уменьшено по текущему остатку");
    })();
  }, [userId]);

  // ---- Сохранение с дебаунсом; пустой черновик удаляется ----
  const snapshot = useRef<StoredDraft>(toStored(projectName, comment, lines));
  snapshot.current = toStored(projectName, comment, lines);

  useEffect(() => {
    if (!ready || userId === null) return;
    saveTimer.current = setTimeout(() => saveStoredDraft(userId, snapshot.current), SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, userId, projectName, comment, lines]);

  // F5 раньше, чем сработал дебаунс: дописываем черновик при закрытии/перезагрузке страницы.
  useEffect(() => {
    if (!ready || userId === null) return;
    const flush = () => saveStoredDraft(userId, snapshot.current);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [ready, userId]);

  const discardStored = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Отменяем восстановление и запись, чтобы они не вернули черновик после выхода.
    restoreSeq.current++;
    setReady(false);
    if (userIdRef.current !== null) clearStoredDraft(userIdRef.current);
  }, []);

  const add = useCallback((item: PartnerStockItem) => {
    setProblem(null);
    const current = linesRef.current;
    if (current.some((l) => l.productId === item.product_id)) return;
    if (current.length >= PARTNER_MAX_ITEMS) {
      toast.error(`В заявке не может быть больше ${PARTNER_MAX_ITEMS} позиций`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: item.product_id,
        name: item.name,
        unit: item.unit,
        available: item.available_quantity,
        quantity: "1",
      },
    ]);
  }, []);

  const setQuantity = useCallback((productId: number, quantity: string) => {
    setProblem(null);
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  }, []);

  const remove = useCallback((productId: number) => {
    setProblem(null);
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (userIdRef.current !== null) clearStoredDraft(userIdRef.current);
    setProblem(null);
    setProjectError(null);
    setProjectNameState("");
    setLines([]);
    setComment("");
  }, []);

  // Свежий остаток из каталога обновляет «доступно» в строках заявки.
  const syncStock = useCallback((items: PartnerStockItem[]) => {
    const fresh = new Map(items.map((i) => [i.product_id, i.available_quantity]));
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        const available = fresh.get(l.productId);
        if (available === undefined || available === l.available) return l;
        changed = true;
        return { ...l, available };
      });
      return changed ? next : prev;
    });
  }, []);

  const canSubmit =
    ready &&
    lines.length > 0 && !lines.some((l) => lineError(l) !== null) && isProjectNameValid(projectName) && !submitting;

  const submit = async () => {
    const items: { product_id: number; quantity: number }[] = [];
    for (const line of lines) {
      const quantity = parseQuantity(line.quantity);
      // Для позиций с неизвестным остатком ограничение не применяем — проверит бэкенд (409).
      if (quantity === null || (line.available !== null && quantity > line.available)) return;
      items.push({ product_id: line.productId, quantity });
    }
    const trimmedProject = projectName.trim();
    if (items.length === 0 || submitting || !isProjectNameValid(projectName)) return;

    setSubmitting(true);
    setProblem(null);
    setProjectError(null);
    try {
      const trimmedComment = comment.trim();
      const created = await createPartnerRequest({
        project_name: trimmedProject,
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        items,
      });
      toast.success(`Заявка №${created.id} отправлена`);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (userIdRef.current !== null) clearStoredDraft(userIdRef.current);
      setLines([]);
      setComment("");
      setProjectNameState("");
      callbacks.current.onCreated(created);
    } catch (err) {
      const { body } = parsePartnerError(err);
      switch (body.code) {
        case "no_company":
          callbacks.current.onNoCompany();
          break;
        case "insufficient_stock":
          setLines((prev) =>
            prev.map((l) => {
              const hit = body.items.find((i) => i.product_id === l.productId);
              return hit ? { ...l, available: hit.available } : l;
            }),
          );
          // Каталог тоже перечитываем — «доступно» в нём устарело.
          setStockRefreshKey((k) => k + 1);
          setProblem({ kind: "insufficient", message: body.message, items: body.items });
          break;
        case "unknown_product":
        case "product_not_allowed": {
          const names = body.product_ids.map(
            (id) => lines.find((l) => l.productId === id)?.name ?? `Товар №${id}`,
          );
          setProblem({
            kind: "message",
            message:
              body.code === "unknown_product"
                ? "Некоторых товаров из заявки больше нет в каталоге. Удалите их и отправьте заявку снова."
                : "Некоторые товары недоступны для заказа партнёрами. Удалите их и отправьте заявку снова.",
            lines: names,
          });
          break;
        }
        case "validation_error": {
          // 422 по названию проекта показываем под самим полем (тексты Pydantic — английские).
          const projectField = body.fields.find((f) => f.field === "project_name");
          if (projectField) {
            setProjectError(`Название проекта должно быть от ${PROJECT_NAME_MIN} до ${PROJECT_NAME_MAX} символов`);
          }
          if (body.fields.some((f) => f.field !== "project_name") || !projectField) {
            setProblem({ kind: "message", message: "Проверьте правильность заполнения заявки и попробуйте ещё раз." });
          }
          break;
        }
        default:
          setProblem({ kind: "message", message: body.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    projectName,
    projectError,
    lines,
    comment,
    submitting,
    problem,
    stockRefreshKey,
    quantities,
    limitReached,
    canSubmit,
    /** Идёт восстановление черновика — страницы показывают скелетон */
    restoring: !ready,
    /** Часть остатков не удалось обновить после F5 */
    staleStock: restoreFailed && lines.some((l) => l.available === null),
    discardStored,
    setProjectName,
    setComment,
    add,
    setQuantity,
    remove,
    clear,
    syncStock,
    submit,
  };
}
