import { CloudDownload } from "lucide-react";

/**
 * Кнопка «Из 1С» — импорт готового документа из 1С вместо ручной загрузки
 * файла. Раньше это была текстовая ссылка 12px с hover:underline: цель для
 * курсора ~60×16px, и по виду вообще не читалась как действие. Теперь это
 * полноценная кнопка (высота 36px, иконка «скачать из облака», явные
 * hover/active/focus-состояния) плюс тултип, который расшифровывает, что
 * именно и откуда подтянется.
 *
 * Тултип свой, а не общий Tooltip из common/: тот растягивается на всю
 * ширину (`inline-flex w-full`) и разваливает шапку карточки, в которой
 * кнопка стоит справа от заголовка.
 */
export function OnecImportButton({
  label = "Из 1С",
  tooltip,
  onClick,
}: {
  label?: string;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <div className="group/onec relative flex-shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={tooltip}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-card transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out-strong hover:border-primary/40 hover:bg-accent hover:text-accent-foreground hover:shadow-elevated active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <CloudDownload size={15} className="text-primary" />
        {label}
      </button>

      {/* Появляется только на hover/focus кнопки; pointer-events-none, чтобы
          не перехватывать клик по самой кнопке. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 translate-y-1 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-[opacity,transform] duration-150 ease-out-strong group-hover/onec:translate-y-0 group-hover/onec:opacity-100 group-focus-within/onec:translate-y-0 group-focus-within/onec:opacity-100"
      >
        {tooltip}
      </span>
    </div>
  );
}
