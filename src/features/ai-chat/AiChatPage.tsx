import { useEffect, useRef, useState } from "react";
import { Menu, PanelLeftOpen, Sparkles, UploadCloud } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../app/components/ui/sheet";
import type { Role } from "../../types";
import { Composer, type ComposerHandle } from "./Composer";
import { DeleteSessionDialog } from "./DeleteSessionDialog";
import { MessageList } from "./MessageList";
import { QuickActions } from "./QuickActions";
import { SessionSidebar } from "./SessionSidebar";
import {
  CHAT_COLUMN_MAX_WIDTH_PX,
  CHAT_COLUMN_MIN_WIDTH_PX,
  CHAT_COLUMN_SIDE_PADDING_PX,
  ROLE_LABELS,
} from "./config";
import { getQuickActions } from "./quickActionsConfig";
import type { AiSession, AttachedDocumentItem, QuickAction } from "./types";
import { useAiChat } from "./useAiChat";
import { useAttachments } from "./useAttachments";

export function AiChatPage({ role }: { role: Role }) {
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [sessionPendingDelete, setSessionPendingDelete] = useState<AiSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [chatColumnMaxWidth, setChatColumnMaxWidth] = useState(768);

  const mainColumnRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const dragDepthRef = useRef(0);

  const attachments = useAttachments();
  const chat = useAiChat({
    // Ошибка отправки: текст возвращается в поле ввода (если там ничего нового не набрано).
    onSendFailed: (prompt) => setInput((current) => (current.length > 0 ? current : prompt)),
    onRetryStarted: (prompt) => setInput((current) => (current === prompt ? "" : current)),
  });

  useEffect(() => {
    const el = mainColumnRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const available = entries[0]?.contentRect.width ?? 0;
      setChatColumnMaxWidth(
        Math.min(
          CHAT_COLUMN_MAX_WIDTH_PX,
          Math.max(CHAT_COLUMN_MIN_WIDTH_PX, available - CHAT_COLUMN_SIDE_PADDING_PX),
        ),
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Подсказка «Прикрепите файл» не нужна, когда файл уже прикреплён.
  useEffect(() => {
    if (attachments.items.length > 0) setHint(null);
  }, [attachments.items.length]);

  const handleSend = () => {
    const prompt = input.trim();
    if (!prompt || chat.isSending || attachments.isUploading) return;

    const documents = attachments.items.filter(
      (item): item is AttachedDocumentItem => item.kind === "document" && item.status === "ready",
    );
    const images = attachments.items.flatMap((item) => (item.kind === "image" ? [item.file] : []));

    chat.send({ prompt, documents, images }, chat.selectedModel);
    setInput("");
    setHint(null);
    attachments.reset();
  };

  const handleNewChat = () => {
    chat.startNewChat();
    attachments.reset();
    setHint(null);
    setIsDrawerOpen(false);
  };

  const handleSelectSession = (session: AiSession) => {
    setIsDrawerOpen(false);
    void chat.selectSession(session);
  };

  const handleQuickAction = (action: QuickAction) => {
    setInput(action.promptTemplate);
    setHint(action.requiresFile ? "Прикрепите файл — он будет разобран вместе с этим запросом." : null);
    composerRef.current?.focus();
    if (action.requiresFile) composerRef.current?.openFilePicker(action.accept);
  };

  const confirmDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    setIsDeletingSession(true);
    const deleted = await chat.deleteSessionById(sessionPendingDelete.id);
    setIsDeletingSession(false);
    setSessionPendingDelete(null);
    if (deleted && sessionPendingDelete.id === chat.activeSessionId) attachments.reset();
  };

  // Drag & drop на всё окно; счётчик вложенности убирает мерцание оверлея над дочерними элементами.
  const handleDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };
  const handleDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
  };
  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) attachments.addFiles(files);
  };

  const pageTitle = chat.activeSessionId === null ? "Новый чат" : chat.activeSessionTitle ?? "Чат";

  const sidebar = (collapsible: boolean) => (
    <SessionSidebar
      sessions={chat.sessions}
      isLoading={chat.isLoadingSessions}
      activeSessionId={chat.activeSessionId}
      onSelect={handleSelectSession}
      onNewChat={handleNewChat}
      onRequestDelete={setSessionPendingDelete}
      onRename={(session, title) => chat.renameSessionTo(session.id, title)}
      onCollapse={collapsible ? () => setIsHistoryCollapsed(true) : undefined}
    />
  );

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles size={22} className="text-primary" />
      </div>
      <p className="text-[14px] font-medium text-foreground">Спросите что угодно</p>
      <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">
        Остатки склада, курс валют, перевод документа, общий вопрос — AI сам поймёт задачу, выберет модель и
        проверит права доступа
      </p>
      <QuickActions actions={getQuickActions(role)} onSelect={handleQuickAction} />
    </div>
  );

  return (
    <>
      <div
        className="relative flex h-full w-full overflow-hidden bg-background text-foreground"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
          <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
            <UploadCloud size={48} className="mb-2 animate-bounce text-primary" />
            <p className="text-lg font-semibold text-foreground">Перетащите файлы сюда</p>
            <p className="mt-1 text-xs text-muted-foreground">Поддерживаются документы (.pdf, .docx, .xlsx) и фото</p>
          </div>
        )}

        {!isHistoryCollapsed && (
          <div className="hidden w-72 shrink-0 border-r border-border md:block">{sidebar(true)}</div>
        )}

        <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 p-0 md:hidden">
            <SheetTitle className="sr-only">История чатов</SheetTitle>
            <SheetDescription className="sr-only">Список прошлых разговоров с AI-ассистентом</SheetDescription>
            {sidebar(false)}
          </SheetContent>
        </Sheet>

        <div ref={mainColumnRef} className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                title="История чатов"
                aria-label="История чатов"
              >
                <Menu size={18} />
              </button>
              {isHistoryCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsHistoryCollapsed(false)}
                  className="hidden shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
                  title="Показать историю"
                  aria-label="Показать историю"
                >
                  <PanelLeftOpen size={16} />
                </button>
              )}
              <h1 className="truncate text-[15px] font-semibold text-foreground">{pageTitle}</h1>
            </div>
            <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
              {ROLE_LABELS[role]}
            </span>
          </div>

          <MessageList
            messages={chat.messages}
            role={role}
            maxWidth={chatColumnMaxWidth}
            isLoading={chat.isLoadingMessages}
            emptyState={emptyState}
            onRetry={chat.retry}
          />

          {chat.error && (
            <p className="mx-auto w-full px-4 pb-2 text-sm text-destructive sm:px-6" style={{ maxWidth: chatColumnMaxWidth }}>
              {chat.error}
            </p>
          )}

          <Composer
            ref={composerRef}
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            isSending={chat.isSending}
            attachments={attachments}
            model={chat.selectedModel}
            onModelChange={chat.setSelectedModel}
            maxWidth={chatColumnMaxWidth}
            hint={hint}
          />
        </div>

        <style>{`
          @keyframes aiDotPulse {
            0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-2px); }
          }
        `}</style>
      </div>

      <DeleteSessionDialog
        session={sessionPendingDelete}
        isDeleting={isDeletingSession}
        onCancel={() => setSessionPendingDelete(null)}
        onConfirm={() => void confirmDeleteSession()}
      />
    </>
  );
}
