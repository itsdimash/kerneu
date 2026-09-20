// Единый словарь статусов наличия — используется и для строк ML-импорта
// (MlImportItemResponse.ml_status), и для компонентов комплекта
// (KitComponentStatus.ml_status / статус, вычисленный на фронте из живых
// остатков в кит-пикере). Вынесено из ProjectPage.tsx, чтобы таблица и
// модалка «Состав комплекта» не держали два независимых копипаста одной и
// той же логики.
export type MlStatus =
  | "Нет в системе"
  | "Нет в системе (похожие варианты)"
  | "Возможное совпадение (требует проверки)"
  | "Есть в системе (недостаточно)"
  | "На складе"
  // Комплект привязан к строке, но ПМ ещё не подобрал для него состав —
  // backend в этом случае отдаёт available_quantity = 0 и именно эту
  // строку в ml_status (см. контракт MlImportItemResponse для kit-строк).
  | "Состав комплекта не выбран";

export const ML_STATUS_STYLES: Record<
  MlStatus,
  {
    badge: string;
    row: string;
  }
> = {
  "Нет в системе": {
    badge: "bg-red-100 dark:bg-red-400/20 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-400/30",
    row: "bg-red-50 dark:bg-red-400/15 hover:bg-red-100/60 dark:bg-red-400/30",
  },
  "Нет в системе (похожие варианты)": {
    badge: "bg-orange-100 dark:bg-orange-400/20 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-400/30",
    row: "bg-orange-50 dark:bg-orange-400/15 hover:bg-orange-100/60 dark:bg-orange-400/30",
  },
  "Возможное совпадение (требует проверки)": {
    badge: "bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-400/30",
    row: "bg-amber-50 dark:bg-amber-400/15 hover:bg-amber-100/60 dark:bg-amber-400/30",
  },
  "Есть в системе (недостаточно)": {
    badge: "bg-yellow-100 dark:bg-yellow-400/20 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-400/30",
    row: "bg-yellow-50 dark:bg-yellow-400/15 hover:bg-yellow-100/60 dark:bg-yellow-400/30",
  },
  "На складе": {
    badge: "bg-green-100 dark:bg-green-400/20 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-400/30",
    row: "bg-green-50 dark:bg-green-400/15 hover:bg-green-100/60 dark:bg-green-400/30",
  },
  "Состав комплекта не выбран": {
    badge: "bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-400/30",
    row: "bg-amber-50 dark:bg-amber-400/15 hover:bg-amber-100/60 dark:bg-amber-400/30",
  },
};

export const normalizeMlStatus = (
  status: string | null | undefined,
): MlStatus | null => {
  const normalized = status?.trim();

  if (normalized === "Нет в системе") return "Нет в системе";
  if (normalized === "Нет в системе (похожие варианты)") {
    return "Нет в системе (похожие варианты)";
  }
  if (normalized === "Возможное совпадение (требует проверки)") {
    return "Возможное совпадение (требует проверки)";
  }
  if (normalized === "На складе") return "На складе";
  if (normalized === "Есть в системе (недостаточно)") {
    return "Есть в системе (недостаточно)";
  }
  if (normalized === "Состав комплекта не выбран") {
    return "Состав комплекта не выбран";
  }

  return null;
};

export const UNKNOWN_ML_STATUS_STYLE = {
  badge: "bg-muted text-foreground border border-input",
  row: "bg-card hover:bg-background",
};
