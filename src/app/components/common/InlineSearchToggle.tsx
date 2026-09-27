import { useDeferredValue, useState } from "react";
import { Search, XCircle } from "lucide-react";

// Общий кусок паттерна "кнопка -> инлайн-поиск" с ProjectPage (поиск
// товара в таблице ML-импорта) — вынесен сюда, чтобы новые списки
// (например, товары закупки на ProcurementPage) не копировали state и
// разметку заново. ProjectPage.tsx намеренно не переведён на этот хук —
// его собственная реализация уже несколько раз правилась точечно в этой
// сессии, трогать стабильный код без необходимости не стали.
export function useInlineSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    setQuery("");
  };

  return { isOpen, query, setQuery, normalizedQuery, open, close };
}

export function InlineSearchToggle({
  isOpen,
  query,
  onQueryChange,
  onOpen,
  onClose,
  label,
  placeholder = "Поиск…",
  widthClassName = "w-64",
}: {
  isOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onOpen: () => void;
  onClose: () => void;
  label: string;
  placeholder?: string;
  widthClassName?: string;
}) {
  return isOpen ? (
    <div className={`relative ${widthClassName}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:border-primary bg-card"
      />
      <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть поиск"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <XCircle size={14} />
      </button>
    </div>
  ) : (
    <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-2 px-5 py-2.5 border border-border bg-card text-sm font-medium text-foreground rounded-lg hover:bg-background transition-colors whitespace-nowrap"
    >
      <Search size={14} />
      {label}
    </button>
  );
}
