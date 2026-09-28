import { useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { Loader2, Lock, Upload } from "lucide-react";

/**
 * Карточка загрузки документа с зоной «выберите файл или перетащите».
 *
 * Вынесена из DocumentsPage, где три такие зоны (доверенность, накладная,
 * счёт на оплату) были скопированы почти дословно и успели разойтись по
 * мелочам — размерам иконок, тексту подсказки, наличию тултипа. Поведение
 * то же, что было: клик открывает файловый диалог, берётся первый файл,
 * заблокированная зона не реагирует ни на клик, ни на drop.
 */
export function DocumentDropzone({
  title,
  icon,
  action,
  locked,
  uploading,
  lockedHint,
  hoverTooltip,
  onFile,
  accept,
  enterDelayMs = 0,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  locked: boolean;
  uploading: boolean;
  /** Вторая строка в заблокированном состоянии: чего именно не хватает. */
  lockedHint: string;
  /** Тултип на всю зону — объясняет блокировку, если она снимаемая. */
  hoverTooltip?: string;
  onFile: (file: File) => void;
  accept?: string;
  /** Сдвиг появления карточки — для stagger-а в сетке. */
  enterDelayMs?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const disabled = locked || uploading;

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      style={{ animationDelay: `${enterDelayMs}ms` }}
      className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-card transition-[box-shadow,border-color] duration-200 ease-out-strong hover:shadow-elevated animate-in fade-in slide-in-from-bottom-2 animation-duration-300 fill-mode-both"
    >
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {action}
      </div>

      <div className="group/zone relative w-full">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`${title}: выберите файл или перетащите`}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openPicker();
          }}
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
          }}
          onDragEnter={() => { if (!disabled) setDraggingOver(true); }}
          // Вложенный контент — pointer-events-none (см. ниже), поэтому
          // dragleave приходит только при уходе курсора из самой зоны и
          // подсветка не мигает при движении над иконкой и текстом.
          onDragLeave={() => setDraggingOver(false)}
          onDrop={handleDrop}
          className={`flex min-h-[124px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
            disabled
              ? "cursor-not-allowed border-border bg-muted/40"
              : draggingOver
              ? "scale-[1.01] cursor-copy border-primary bg-accent shadow-elevated ring-4 ring-primary/10"
              : "cursor-pointer border-border hover:border-primary/40 hover:bg-accent/40"
          }`}
        >
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && !disabled) onFile(file);
            event.target.value = "";
          }} />

          <div className="pointer-events-none flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 size={20} className="animate-spin text-primary" />
            ) : locked ? (
              <Lock size={20} className="text-muted-foreground" />
            ) : (
              <Upload
                size={20}
                className={`transition-[color,transform] duration-150 ease-out-strong ${
                  draggingOver ? "-translate-y-0.5 scale-110 text-primary" : "text-muted-foreground"
                }`}
              />
            )}

            {locked ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium">Недоступно</span>
                <br />
                {lockedHint}
              </p>
            ) : uploading ? (
              <p className="text-xs font-medium text-foreground">Загрузка…</p>
            ) : draggingOver ? (
              <p className="text-xs font-medium text-primary">Отпустите файл здесь</p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-primary">Выберите файл</span>
                <br />
                или перетащите — можно несколько
              </p>
            )}
          </div>
        </div>

        {hoverTooltip && (
          <span className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-[opacity,transform] duration-150 ease-out-strong group-hover/zone:-translate-y-[calc(100%+8px)] group-hover/zone:opacity-100">
            {hoverTooltip}
          </span>
        )}
      </div>
    </div>
  );
}
