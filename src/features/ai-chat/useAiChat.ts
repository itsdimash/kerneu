import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteSession,
  getSessionMessages,
  listSessions,
  parseApiError,
  renameSession,
  sendChat,
  sendChatMultimodal,
} from "./api";
import { TYPEWRITER_TICK_MS, TYPEWRITER_TOTAL_TICKS } from "./config";
import type { AiAttachment, AiMessage, AiSession, AttachedDocumentItem } from "./types";
import { buildPromptWithDocuments, chatErrorText, extractUserQuestion, newId } from "./utils";

interface ChatRequest {
  /** Текст пользователя как он набран. */
  prompt: string;
  /** Промпт для API: с вшитым текстом документов. */
  promptForApi: string;
  images: File[];
  attachmentKeys: string[];
  model: string | null;
}

export interface SendDraft {
  prompt: string;
  documents: AttachedDocumentItem[];
  images: File[];
}

interface Callbacks {
  /** Запрос упал — вернуть текст в поле ввода. */
  onSendFailed: (prompt: string) => void;
  /** Запущен повтор — поле ввода уже не нужно держать. */
  onRetryStarted: (prompt: string) => void;
}

export function useAiChat(callbacks: Callbacks) {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("auto");

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const activeSessionIdRef = useRef<number | null>(null);
  const isSendingRef = useRef(false);
  /** Заготовка под Stop/Regenerate: один AbortController на текущий запрос. */
  const abortRef = useRef<AbortController | null>(null);
  /** Запрос по id сообщения ассистента — для «Повторить» (и позже Regenerate). */
  const requestsRef = useRef(new Map<string, ChatRequest>());
  const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const updateMessage = useCallback((id: string, update: (message: AiMessage) => AiMessage) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? update(message) : message)));
  }, []);

  const stopTypewriter = useCallback(() => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
  }, []);

  const releaseBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current = [];
  }, []);

  const setSendingState = useCallback((value: boolean) => {
    isSendingRef.current = value;
    setIsSending(value);
  }, []);

  const playTypewriter = useCallback(
    (messageId: string, fullText: string) => {
      stopTypewriter();
      const chunkSize = Math.max(1, Math.ceil(fullText.length / TYPEWRITER_TOTAL_TICKS));
      let shownChars = 0;

      typewriterTimerRef.current = setInterval(() => {
        shownChars = Math.min(fullText.length, shownChars + chunkSize);
        updateMessage(messageId, (message) => ({ ...message, displayedContent: fullText.slice(0, shownChars) }));
        if (shownChars >= fullText.length) stopTypewriter();
      }, TYPEWRITER_TICK_MS);
    },
    [stopTypewriter, updateMessage],
  );

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      setSessions(await listSessions());
    } catch {
      // Список истории не критичен для работы чата.
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  /** Прерывает текущий запрос и сбрасывает всё, что относится к открытому чату. */
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSendingState(false);
    stopTypewriter();
    releaseBlobUrls();
    requestsRef.current.clear();
  }, [releaseBlobUrls, setSendingState, stopTypewriter]);

  useEffect(() => {
    void loadSessions();
    return () => {
      abortRef.current?.abort();
      stopTypewriter();
      releaseBlobUrls();
    };
  }, [loadSessions, releaseBlobUrls, stopTypewriter]);

  const startNewChat = useCallback(() => {
    resetConversation();
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setActiveSessionTitle(null);
    setMessages([]);
    setError(null);
  }, [resetConversation]);

  const selectSession = useCallback(
    async (session: AiSession) => {
      resetConversation();
      setIsLoadingMessages(true);
      setError(null);
      try {
        const history = await getSessionMessages(session.id);
        activeSessionIdRef.current = session.id;
        setActiveSessionId(session.id);
        setActiveSessionTitle(session.title);
        setMessages(
          history.map((item) => {
            const content = item.role === "user" ? extractUserQuestion(item.content) : item.content;
            return {
              id: newId(),
              role: item.role,
              content,
              displayedContent: content,
              status: "done",
              modelUsed: item.modelUsed,
              taskType: item.taskType,
              table: item.table,
              attachments: item.attachments,
              needsReview: item.needsReview,
            };
          }),
        );
      } catch {
        setError("Не удалось загрузить сообщения этой сессии.");
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [resetConversation],
  );

  const deleteSessionById = useCallback(
    async (sessionId: number): Promise<boolean> => {
      try {
        await deleteSession(sessionId);
        setSessions((prev) => prev.filter((session) => session.id !== sessionId));
        if (activeSessionIdRef.current === sessionId) startNewChat();
        return true;
      } catch {
        setError("Не удалось удалить чат.");
        return false;
      }
    },
    [startNewChat],
  );

  const renameSessionTo = useCallback(async (sessionId: number, title: string): Promise<void> => {
    await renameSession(sessionId, title);
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, title } : session)));
    if (activeSessionIdRef.current === sessionId) setActiveSessionTitle(title);
  }, []);

  const runRequest = useCallback(
    async (request: ChatRequest, assistantId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSendingState(true);

      try {
        const params = {
          prompt: request.promptForApi,
          sessionId: activeSessionIdRef.current,
          model: request.model,
          attachmentKeys: request.attachmentKeys,
          signal: controller.signal,
        };
        const result =
          request.images.length > 0
            ? await sendChatMultimodal({ ...params, files: request.images })
            : await sendChat(params);

        activeSessionIdRef.current = result.sessionId;
        setActiveSessionId(result.sessionId);

        updateMessage(assistantId, (message) => ({
          ...message,
          content: result.text,
          displayedContent: "",
          status: "done",
          error: null,
          modelUsed: result.modelUsed,
          taskType: result.taskType,
          confidence: result.confidence,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          latencyMs: result.latencyMs,
          table: result.table,
          attachments: result.attachments,
          needsReview: result.needsReview,
          isNew: true,
        }));
        playTypewriter(assistantId, result.text);
        requestsRef.current.delete(assistantId);
        void loadSessions();
      } catch (caught) {
        const info = parseApiError(caught);
        if (info.kind === "canceled") return;
        updateMessage(assistantId, (message) => ({ ...message, status: "error", error: chatErrorText(info) }));
        callbacksRef.current.onSendFailed(request.prompt);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setSendingState(false);
        }
      }
    },
    [loadSessions, playTypewriter, setSendingState, updateMessage],
  );

  const send = useCallback(
    (draft: SendDraft, model: string) => {
      if (isSendingRef.current) return;

      const userAttachments: AiAttachment[] = [
        ...draft.images.map((file): AiAttachment => {
          const url = URL.createObjectURL(file);
          blobUrlsRef.current.push(url);
          return {
            type: "image",
            name: file.name,
            key: "",
            mime: file.type,
            size: file.size,
            url,
            fetchedAt: Date.now(),
            local: true,
          };
        }),
        ...draft.documents.map(
          (doc): AiAttachment => ({
            type: "file",
            name: doc.filename,
            key: doc.fileKey,
            mime: "",
            size: doc.size,
            url: doc.fileUrl,
            fetchedAt: Date.now(),
            // Без ключа ссылку обновить нечем — считаем вложение локальным.
            local: !doc.fileKey,
          }),
        ),
      ];

      const request: ChatRequest = {
        prompt: draft.prompt,
        promptForApi: buildPromptWithDocuments(draft.prompt, draft.documents),
        images: draft.images,
        attachmentKeys: draft.documents.map((doc) => doc.fileKey).filter((key) => key.length > 0),
        model: model === "auto" ? null : model,
      };

      const assistantId = newId();
      requestsRef.current.set(assistantId, request);
      setError(null);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "user",
          content: draft.prompt,
          displayedContent: draft.prompt,
          status: "done",
          attachments: userAttachments,
          needsReview: false,
        },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          displayedContent: "",
          status: "pending",
          attachments: [],
          needsReview: false,
        },
      ]);
      void runRequest(request, assistantId);
    },
    [runRequest],
  );

  const retry = useCallback(
    (messageId: string) => {
      const request = requestsRef.current.get(messageId);
      if (!request || isSendingRef.current) return;
      updateMessage(messageId, (message) => ({ ...message, status: "pending", error: null }));
      callbacksRef.current.onRetryStarted(request.prompt);
      void runRequest(request, messageId);
    },
    [runRequest, updateMessage],
  );

  return {
    sessions,
    isLoadingSessions,
    activeSessionId,
    activeSessionTitle,
    messages,
    isLoadingMessages,
    isSending,
    error,
    selectedModel,
    setSelectedModel,
    startNewChat,
    selectSession,
    deleteSessionById,
    renameSessionTo,
    send,
    retry,
  };
}
