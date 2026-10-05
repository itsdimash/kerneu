import { useMemo, useState } from "react";
import { Check, PanelLeftClose, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "../../app/components/ui/utils";
import { FEATURES } from "./config";
import type { AiSession } from "./types";
import { formatSessionTime, groupSessionsByDate } from "./utils";

export function SessionSidebar({
  sessions,
  isLoading,
  activeSessionId,
  onSelect,
  onNewChat,
  onRequestDelete,
  onRename,
  onCollapse,
}: {
  sessions: AiSession[];
  isLoading: boolean;
  activeSessionId: number | null;
  onSelect: (session: AiSession) => void;
  onNewChat: () => void;
  onRequestDelete: (session: AiSession) => void;
  onRename: (session: AiSession, title: string) => Promise<void>;
  /** Только для десктопной колонки: кнопка «Скрыть историю». */
  onCollapse?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      groupSessionsByDate(
        sessions.filter((session) => session.title.toLowerCase().includes(searchQuery.toLowerCase())),
      ),
    [sessions, searchQuery],
  );

  const startEditing = (session: AiSession) => {
    setEditingId(session.id);
    setDraftTitle(session.title);
    setRenameError(null);
  };

  const commitRename = async (session: AiSession) => {
    const title = draftTitle.trim();
    if (!title || title === session.title) {
      setEditingId(null);
      return;
    }
    try {
      await onRename(session, title);
      setEditingId(null);
    } catch {
      setRenameError("Не удалось переименовать чат.");
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="px-4 pb-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-primary" />
            <span className="text-[17px] font-semibold">AI-ассистент</span>
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Скрыть историю"
              aria-label="Скрыть историю"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Данные компании, интернет, общие вопросы — в одном окне
        </p>
      </div>

      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus size={16} /> Новый чат
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по истории"
            className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4 pt-1">
        {isLoading ? (
          <p className="px-2.5 text-[13px] text-muted-foreground">Загрузка...</p>
        ) : groups.length === 0 ? (
          <p className="px-2.5 text-[13px] text-muted-foreground">
            {sessions.length === 0 ? "Пока нет сохранённых чатов." : "Ничего не найдено."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-2">
              <h3 className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
              {group.sessions.map((session) => {
                const active = session.id === activeSessionId;
                const editing = editingId === session.id;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group relative mb-1 flex w-full items-start gap-1 rounded-lg px-2.5 py-2.5 transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    {editing ? (
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void commitRename(session);
                              if (event.key === "Escape") setEditingId(null);
                            }}
                            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                            aria-label="Название чата"
                          />
                          <button
                            type="button"
                            onClick={() => void commitRename(session)}
                            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                            aria-label="Сохранить название"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                            aria-label="Отмена"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {renameError && <span className="text-[11.5px] text-destructive">{renameError}</span>}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelect(session)}
                          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                        >
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {session.title}
                            </span>
                            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                              {formatSessionTime(session.updated_at)}
                            </span>
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
                          {FEATURES.renameSession && (
                            <button
                              type="button"
                              onClick={() => startEditing(session)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                              aria-label="Переименовать чат"
                              title="Переименовать чат"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRequestDelete(session)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                            aria-label="Удалить чат"
                            title="Удалить чат"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
