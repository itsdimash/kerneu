import { useEffect, useRef } from "react";
import { Pencil } from "lucide-react";

export const autoResizeNameTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

// Название, которое правится в два шага: клик по тексту (onOpen — родитель
// показывает ConfirmDialog и потом выставляет isUnlocked), затем textarea с
// сохранением по blur/Enter (onCommit). Валидацию и вызов API делает родитель.
export function RenameableName({
  name,
  isUnlocked,
  isSaving,
  onOpen,
  onCommit,
}: {
  name: string;
  isUnlocked: boolean;
  isSaving: boolean;
  onOpen: () => void;
  onCommit: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const nameRef = useRef<HTMLTextAreaElement>(null);

  // Фокус и автовысота — один раз, когда поле разблокировано (textarea
  // в DOM только в этот момент).
  useEffect(() => {
    if (!isUnlocked) return;
    const el = nameRef.current;
    if (!el) return;
    autoResizeNameTextarea(el);
    el.focus();
  }, [isUnlocked]);

  if (isUnlocked) {
    return (
      <textarea
        ref={nameRef}
        rows={1}
        defaultValue={name}
        disabled={isSaving}
        onInput={(event) => autoResizeNameTextarea(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onBlur={onCommit}
        className="-mx-2 w-[calc(100%+1rem)] resize-none overflow-hidden px-2 py-1 text-sm font-medium border border-primary rounded-md bg-card cursor-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Изменить название"
      className="group inline-flex max-w-full items-center gap-1.5 text-left text-sm font-medium text-foreground whitespace-normal break-words px-2 py-1.5 -mx-2 rounded-md hover:bg-muted transition-colors"
    >
      {name}
      <Pencil size={12} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-70 transition-opacity" />
    </button>
  );
}
