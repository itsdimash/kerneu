// Группировка позиций проекта по kit_group_key — общая утилита для таблиц
// ProjectPagePM (финальный read-only список после подтверждения) и
// ProjectPageDirector (редактируемый список), которые должны показывать
// компоненты одного комплекта под одной заголовочной строкой вместо
// отдельных строк подряд.
//
// Чисто функциональная, без React: держит порядок исходного массива и
// вставляет заголовок группы на позицию ПЕРВОГО встреченного элемента этой
// группы — так что применение к уже отфильтрованному/отсортированному
// списку просто работает (группа появляется, только если в списке остался
// хотя бы один её элемент).
export type KitGroupedRow<T> =
  | { type: "kit"; key: string; entries: T[] }
  | { type: "single"; entry: T };

export function groupEntriesByKit<T>(
  entries: T[],
  getKitGroupKey: (entry: T) => string | null | undefined,
): KitGroupedRow<T>[] {
  const rows: KitGroupedRow<T>[] = [];
  const groupRowIndexByKey = new Map<string, number>();

  for (const entry of entries) {
    const key = getKitGroupKey(entry);
    if (!key) {
      rows.push({ type: "single", entry });
      continue;
    }

    const existingRowIndex = groupRowIndexByKey.get(key);
    if (existingRowIndex == null) {
      groupRowIndexByKey.set(key, rows.length);
      rows.push({ type: "kit", key, entries: [entry] });
    } else {
      const row = rows[existingRowIndex];
      if (row.type === "kit") {
        row.entries.push(entry);
      }
    }
  }

  return rows;
}
