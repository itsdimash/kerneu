import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { Role } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { NEAR_BOTTOM_PX } from "./config";
import type { AiMessage } from "./types";

export function MessageList({
  messages,
  role,
  maxWidth,
  isLoading,
  emptyState,
  onRetry,
}: {
  messages: AiMessage[];
  role: Role;
  maxWidth: number;
  isLoading: boolean;
  emptyState: ReactNode;
  onRetry: (messageId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prevLengthRef = useRef(0);
  const firstIdRef = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickRef.current = near;
    setShowJump((prev) => (prev === !near ? prev : !near));
  };

  // Автоскролл: только если пользователь внизу; своё отправленное и смену сессии — всегда.
  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    const firstId = messages[0]?.id ?? null;
    const added = messages.length > prevLengthRef.current;
    const forced =
      (prevLengthRef.current === 0 && messages.length > 0) ||
      firstId !== firstIdRef.current ||
      (added && last?.role === "user");
    prevLengthRef.current = messages.length;
    firstIdRef.current = firstId;

    if (forced) stickRef.current = true;
    if (stickRef.current) scrollToBottom(false);
  }, [messages, scrollToBottom]);

  // Контент растёт без смены messages (картинки догрузились, markdown дорисовался).
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom(false);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom, isLoading, messages.length === 0]);

  const jumpToBottom = () => {
    stickRef.current = true;
    setShowJump(false);
    scrollToBottom(true);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-6 sm:px-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка переписки...</p>
        ) : messages.length === 0 ? (
          emptyState
        ) : (
          <div ref={contentRef} className="mx-auto flex flex-col gap-5" style={{ maxWidth }}>
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                role={role}
                onRetry={index === messages.length - 1 ? () => onRetry(message.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {showJump && messages.length > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground shadow-md transition-colors hover:bg-muted"
        >
          <ArrowDown size={13} /> Вниз
        </button>
      )}
    </div>
  );
}
