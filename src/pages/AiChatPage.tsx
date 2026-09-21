import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Search,
  Plus,
  Send,
  Copy,
  Bot,
  Info,
  Paperclip,
  X,
  Download,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  UploadCloud,
} from "lucide-react";
import { api } from "../api/api";
import type { Role } from "../types";

interface AiTableRow {
  [key: string]: unknown;
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  displayedContent: string;
  modelUsed?: string | null;
  taskType?: string | null;
  confidence?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  table?: AiTableRow[] | null;
}

interface AttachedDocumentItem {
  kind: "document";
  filename: string;
  text: string;
  truncated: boolean;
  charCount: number;
  fileUrl: string;
}

interface AttachedImageItem {
  kind: "image";
  file: File;
  previewUrl: string;
}

type AttachedItem = AttachedDocumentItem | AttachedImageItem;

const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface AiSession {
  id: number;
  title: string;
  updated_at: string;
}

const TYPEWRITER_TICK_MS = 15;
const TYPEWRITER_TOTAL_TICKS = 120;
const INPUT_MAX_HEIGHT_PX = 200;
const CHAT_COLUMN_MIN_WIDTH_PX = 640;
const CHAT_COLUMN_MAX_WIDTH_PX = 1100;
const CHAT_COLUMN_SIDE_PADDING_PX = 48;

const ROLE_LABELS: Record<Role, string> = {
  admin: "Администратор",
  commercial_director: "Коммерческий директор",
  pm: "Менеджер проекта",
  accountant: "Бухгалтер",
  warehouse: "Кладовщик",
};

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "gemini-flash", label: "Gemini Flash" },
  { value: "gemini-pro", label: "Gemini Pro" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-haiku", label: "Claude Haiku" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus", label: "Claude Opus" },
];

const SENSITIVE_COLUMN_PATTERN = /cost|price|margin|себестоим|маржа|стоимост|прибыл/i;

function parseBackendTimestamp(iso: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
}

function formatSessionTime(iso: string): string {
  const date = parseBackendTimestamp(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function downloadTableAsExcel(rows: AiTableRow[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Данные");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function AiResultTable({ rows, role }: { rows: AiTableRow[]; role: Role }) {
  if (!rows || rows.length === 0) return null;

  const allKeys = Object.keys(rows[0]);
  const keys =
    role === "warehouse"
      ? allKeys.filter((key) => !SENSITIVE_COLUMN_PATTERN.test(key))
      : allKeys;
  const hiddenCount = allKeys.length - keys.length;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="bg-muted">
            {keys.map((key) => (
              <th key={key} className="px-3 py-2 font-medium capitalize text-muted-foreground">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {keys.map((key) => (
                <td key={key} className="px-3 py-2 tabular-nums text-foreground">
                  {String(row[key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <div className="bg-muted px-3 py-2 text-[11.5px] text-muted-foreground">
          {hiddenCount} {hiddenCount === 1 ? "колонка скрыта" : "колонок скрыто"} — недоступно роли «Склад»
        </div>
      )}
    </div>
  );
}

function AiMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 text-[13.5px] leading-relaxed text-foreground last:mb-0">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="mb-2 mt-3 text-[15px] font-semibold text-foreground first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-3 text-[14px] font-semibold text-foreground first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-2.5 text-[13.5px] font-semibold text-foreground first:mt-0">{children}</h3>
        ),
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-1 text-[13.5px] text-foreground">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-1 text-[13.5px] text-foreground">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = Boolean(className?.includes("language-")) || String(children).includes("\n");
          return isBlock ? (
            <code className="block whitespace-pre-wrap text-[12.5px] text-foreground">{children}</code>
          ) : (
            <code className="rounded bg-muted px-1 py-0.5 text-[12.5px] text-foreground">{children}</code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 text-[12.5px]">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="mb-2 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-[12.5px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
        th: ({ children }) => (
          <th className="px-3 py-2 font-medium text-muted-foreground">{children}</th>
        ),
        td: ({ children }) => <td className="px-3 py-2 text-foreground">{children}</td>,
        hr: () => <hr className="my-3 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function AiChatPage({ role }: { role: Role }) {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("auto");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attachedItems, setAttachedItems] = useState<AttachedItem[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [sessionPendingDelete, setSessionPendingDelete] = useState<AiSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mainColumnRef = useRef<HTMLDivElement>(null);
  const [chatColumnMaxWidth, setChatColumnMaxWidth] = useState(768);

  useEffect(() => {
    const el = mainColumnRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const available = entries[0]?.contentRect.width ?? 0;
      const next = Math.min(
        CHAT_COLUMN_MAX_WIDTH_PX,
        Math.max(CHAT_COLUMN_MIN_WIDTH_PX, available - CHAT_COLUMN_SIDE_PADDING_PX),
      );
      setChatColumnMaxWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [input]);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const response = await api.get<AiSession[]>("/ai/sessions");
      setSessions(response.data);
    } catch {
      // Ignored
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    void loadSessions();
    return () => {
      if (typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      attachedItems.forEach((item) => {
        if (item.kind === "image") URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const revokeAllImagePreviews = (items: AttachedItem[]) => {
    items.forEach((item) => {
      if (item.kind === "image") URL.revokeObjectURL(item.previewUrl);
    });
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setActiveSessionTitle(null);
    setMessages([]);
    setError(null);
    setAttachedItems((prev) => {
      revokeAllImagePreviews(prev);
      return [];
    });
    setUploadError(null);
  };

  const processFile = async (file: File) => {
    setUploadError(null);
    const isImage = IMAGE_MIME_TYPES.includes(file.type);

    if (isImage) {
      const currentImageCount = attachedItems.filter((item) => item.kind === "image").length;
      if (currentImageCount >= MAX_IMAGES_PER_MESSAGE) {
        setUploadError(`Можно приложить не более ${MAX_IMAGES_PER_MESSAGE} изображений.`);
        return;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setUploadError("Изображение слишком большое (максимум 5 МБ).");
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setAttachedItems((prev) => [...prev, { kind: "image", file, previewUrl }]);
      return;
    }

    setIsUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post<{
        filename: string;
        text: string;
        truncated: boolean;
        char_count: number;
        file_url: string;
      }>("/ai/documents/extract", formData);

      const documentItem: AttachedDocumentItem = {
        kind: "document",
        filename: response.data.filename,
        text: response.data.text,
        truncated: response.data.truncated,
        charCount: response.data.char_count,
        fileUrl: response.data.file_url,
      };
      setAttachedItems((prev) => [...prev.filter((item) => item.kind !== "document"), documentItem]);
    } catch {
      setUploadError("Не удалось прочитать файл. Поддерживаются .docx, .pdf, .xlsx.");
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      await processFile(file);
    }
  };

  // Clipboard (Cmd+V / Ctrl+V) Handler
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          void processFile(file);
          break;
        }
      }
    }
  };

  // Drag & Drop Handlers
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await processFile(files[i]);
      }
    }
  };

  const removeAttachedItem = (indexToRemove: number) => {
    setAttachedItems((prev) => {
      const target = prev[indexToRemove];
      if (target?.kind === "image") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, index) => index !== indexToRemove);
    });
    setUploadError(null);
  };

  const requestDeleteSession = (session: AiSession, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessionPendingDelete(session);
  };

  const confirmDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    const sessionId = sessionPendingDelete.id;

    setIsDeletingSession(true);
    try {
      await api.delete(`/ai/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        startNewChat();
      }
      setSessionPendingDelete(null);
    } catch {
      setError("Не удалось удалить чат.");
      setSessionPendingDelete(null);
    } finally {
      setIsDeletingSession(false);
    }
  };

  const selectSession = async (session: AiSession) => {
    setIsLoadingMessages(true);
    setError(null);
    try {
      const response = await api.get<
        {
          role: string;
          content: string;
          model_used: string | null;
          task_type: string | null;
          created_at: string;
          table: AiTableRow[] | null;
        }[]
      >(`/ai/sessions/${session.id}/messages`);

      setActiveSessionId(session.id);
      setActiveSessionTitle(session.title);
      setMessages(
        response.data.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          displayedContent: m.content,
          modelUsed: m.model_used,
          taskType: m.task_type,
          table: m.table,
        })),
      );
    } catch {
      setError("Не удалось загрузить сообщения этой сессии.");
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const playTypewriter = (messageIndex: number, fullText: string) => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
    }

    const chunkSize = Math.max(1, Math.ceil(fullText.length / TYPEWRITER_TOTAL_TICKS));
    let shownChars = 0;

    typewriterTimerRef.current = setInterval(() => {
      shownChars = Math.min(fullText.length, shownChars + chunkSize);

      setMessages((prev) => {
        const next = [...prev];
        const target = next[messageIndex];
        if (!target) return prev;
        next[messageIndex] = { ...target, displayedContent: fullText.slice(0, shownChars) };
        return next;
      });

      if (shownChars >= fullText.length && typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    }, TYPEWRITER_TICK_MS);
  };

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || isSending) return;

    const itemsForThisMessage = attachedItems;
    const documentForThisMessage = itemsForThisMessage.find(
      (item): item is AttachedDocumentItem => item.kind === "document",
    );
    const imagesForThisMessage = itemsForThisMessage.filter(
      (item): item is AttachedImageItem => item.kind === "image",
    );
    const hasImages = imagesForThisMessage.length > 0;

    const promptForApi = documentForThisMessage
      ? `Вот текст документа «${documentForThisMessage.filename}»${
          documentForThisMessage.truncated ? " (обрезан по лимиту)" : ""
        }:\n\n${documentForThisMessage.text}\n\n---\n\nВопрос пользователя: ${prompt}`
      : prompt;

    const attachmentLabelParts: string[] = [];
    if (documentForThisMessage) attachmentLabelParts.push(`📎 ${documentForThisMessage.filename}`);
    if (hasImages) {
      attachmentLabelParts.push(
        `🖼️ ${imagesForThisMessage.length} ${imagesForThisMessage.length === 1 ? "фото" : "фото"}`,
      );
    }
    const displayContent =
      attachmentLabelParts.length > 0 ? `${attachmentLabelParts.join(" · ")}\n${prompt}` : prompt;

    setInput("");
    revokeAllImagePreviews(itemsForThisMessage);
    setAttachedItems([]);
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: displayContent,
        displayedContent: displayContent,
      },
    ]);
    setIsSending(true);

    try {
      type ChatApiResponse = {
        session_id: number;
        text: string;
        task_type: string;
        model_used: string;
        confidence: number;
        tokens_in: number;
        tokens_out: number;
        latency_ms: number;
        table: AiTableRow[] | null;
      };

      const modelForApi = selectedModel === "auto" ? null : selectedModel;

      const response = hasImages
        ? await (() => {
            const formData = new FormData();
            formData.append("prompt", promptForApi);
            formData.append(
              "session_id",
              activeSessionId != null ? String(activeSessionId) : "",
            );
            if (modelForApi) formData.append("model", modelForApi);
            imagesForThisMessage.forEach((image) => formData.append("files", image.file));

            return api.post<ChatApiResponse>("/ai/chat/multimodal", formData);
          })()
        : await api.post<ChatApiResponse>("/ai/chat", {
            prompt: promptForApi,
            session_id: activeSessionId,
            model: modelForApi,
          });

      const data = response.data;
      setActiveSessionId(data.session_id);

      setMessages((prev) => {
        const next: AiMessage[] = [
          ...prev,
          {
            role: "assistant",
            content: data.text,
            displayedContent: "",
            modelUsed: data.model_used,
            taskType: data.task_type,
            confidence: data.confidence,
            tokensIn: data.tokens_in,
            tokensOut: data.tokens_out,
            latencyMs: data.latency_ms,
            table: data.table,
          },
        ];
        playTypewriter(next.length - 1, data.text);
        return next;
      });

      void loadSessions();
    } catch {
      setError("Не удалось получить ответ от AI. Попробуйте ещё раз.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const pageTitle = activeSessionId === null ? "Новый чат" : activeSessionTitle ?? "Чат";

  return (
    <>
    <div 
      className="relative flex h-full w-full overflow-hidden bg-background text-foreground"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overlay Dropzone Indicator */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary">
          <UploadCloud size={48} className="text-primary animate-bounce mb-2" />
          <p className="text-lg font-semibold text-foreground">Перетащите файлы сюда</p>
          <p className="text-xs text-muted-foreground mt-1">Поддерживаются документы (.pdf, .docx, .xlsx) и фото</p>
        </div>
      )}

      {!isHistoryCollapsed && (
        <div className="hidden md:flex w-72 shrink-0 flex-col border-r border-border bg-card">
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={17} className="text-primary" />
                <span className="text-[17px] font-semibold">AI-ассистент</span>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryCollapsed(true)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Скрыть историю"
                aria-label="Скрыть историю"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Данные компании, интернет, общие вопросы — в одном окне
            </p>
          </div>

          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={startNewChat}
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

          <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4 pt-3">
            {isLoadingSessions ? (
              <p className="px-2.5 text-[13px] text-muted-foreground">Загрузка...</p>
            ) : filteredSessions.length === 0 ? (
              <p className="px-2.5 text-[13px] text-muted-foreground">
                {sessions.length === 0 ? "Пока нет сохранённых чатов." : "Ничего не найдено."}
              </p>
            ) : (
              filteredSessions.map((session) => {
                const active = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className={`group relative mb-1 flex w-full items-start gap-1 rounded-lg px-2.5 py-2.5 transition-colors ${
                      active ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectSession(session)}
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
                    <button
                      type="button"
                      onClick={(event) => requestDeleteSession(session, event)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-colors hover:text-foreground group-hover:opacity-100 hover:text-destructive"
                      aria-label="Удалить чат"
                      title="Удалить чат"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div ref={mainColumnRef} className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
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

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoadingMessages ? (
            <p className="text-sm text-muted-foreground">Загрузка переписки...</p>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles size={22} className="text-primary" />
              </div>
              <p className="text-[14px] font-medium text-foreground">Спросите что угодно</p>
              <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">
                Остатки склада, курс валют, перевод документа, общий вопрос — AI сам поймёт
                задачу, выберет модель и проверит права доступа
              </p>
            </div>
          ) : (
            <div className="mx-auto flex flex-col gap-5" style={{ maxWidth: chatColumnMaxWidth }}>
              {messages.map((message, index) => {
                if (message.role === "user") {
                  return (
                    <div key={index} className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-[13.5px] text-primary-foreground">
                        {message.displayedContent}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={index} className="flex justify-start">
                    <div className="w-full max-w-[85%] rounded-xl border border-border bg-card px-4 py-3.5">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <Bot size={14} className="text-primary" />
                          <span className="text-[12.5px] font-semibold text-primary">
                            {message.modelUsed ?? "AI"}
                          </span>
                        </div>
                        {message.confidence != null && (
                          <div
                            className="hidden items-center gap-1 sm:flex"
                            title={`уверенность ${(message.confidence * 100).toFixed(0)}% · ${message.taskType ?? ""} · ${message.latencyMs ?? 0} мс`}
                          >
                            <Info size={12} className="text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">
                              {(message.tokensIn ?? 0) + (message.tokensOut ?? 0)} токенов
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="text-[13.5px] leading-relaxed text-foreground">
                        <AiMarkdown content={message.displayedContent} />
                      </div>

                      {message.table && message.table.length > 0 && (
                        <AiResultTable rows={message.table} role={role} />
                      )}

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(message.content)}
                          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Copy size={13} /> Скопировать
                        </button>
                        {message.table && message.table.length > 0 && (
                          <button
                            type="button"
                            onClick={() => downloadTableAsExcel(message.table!, "ai-otvet")}
                            className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Download size={13} /> Скачать Excel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                        style={{ animation: `aiDotPulse 1.1s ${dot * 0.15}s infinite ease-in-out` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-6 py-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,.xlsx,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => void handleFileSelected(event)}
          />

          {attachedItems.length > 0 && (
            <div className="mx-auto mb-2 flex flex-wrap items-center gap-2" style={{ maxWidth: chatColumnMaxWidth }}>
              {attachedItems.map((item, index) =>
                item.kind === "document" ? (
                  <div
                    key={`doc-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5"
                  >
                    <Paperclip size={13} className="shrink-0 text-muted-foreground" />
                    <a 
                      href={item.fileUrl} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="min-w-0 max-w-[220px] truncate text-[12.5px] text-foreground hover:text-primary hover:underline"
                    >
                      {item.filename}
                    </a>

                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {item.charCount.toLocaleString("ru-RU")} симв.
                      {item.truncated ? " · обрезан" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachedItem(index)}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Убрать файл"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    key={`img-${index}`}
                    className="relative flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background p-1"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-10 w-10 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachedItem(index)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                      aria-label="Убрать изображение"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}

          {uploadError && (
            <p className="mx-auto mb-2 text-[12px] text-destructive" style={{ maxWidth: chatColumnMaxWidth }}>{uploadError}</p>
          )}

          <div className="mx-auto flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2" style={{ maxWidth: chatColumnMaxWidth }}>
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={isUploadingDocument}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              title="Прикрепить файл (.docx, .pdf, .xlsx) или фото (PNG, JPEG, WebP)"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isUploadingDocument
                  ? "Читаю файл..."
                  : "Спросите что угодно, вставьте файл или скрепите перетаскиванием…"
              }
              disabled={isUploadingDocument}
              rows={1}
              style={{ maxHeight: `${INPUT_MAX_HEIGHT_PX}px` }}
              className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={isSending || isUploadingDocument || input.trim().length === 0}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                input.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Send size={15} />
            </button>
          </div>
          <div className="mx-auto mt-2 flex items-center justify-between gap-3" style={{ maxWidth: chatColumnMaxWidth }}>
            <p className="text-[11px] text-muted-foreground">
              Вставляйте картинки из буфера (Cmd+V) или перетаскивайте файлы прямо в окно
            </p>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary"
              title="Модель для ответа"
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes aiDotPulse {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>

    {sessionPendingDelete && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={() => !isDeletingSession && setSessionPendingDelete(null)}
      >
        <div
          className="w-full max-w-[360px] rounded-xl border border-border bg-card p-5 shadow-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-foreground">Удалить чат?</h3>
          <p className="mt-2 text-[13px] text-muted-foreground">
            «{sessionPendingDelete.title}» будет удалён без возможности восстановления.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSessionPendingDelete(null)}
              disabled={isDeletingSession}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void confirmDeleteSession()}
              disabled={isDeletingSession}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {isDeletingSession ? "Удаление..." : "Удалить"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}