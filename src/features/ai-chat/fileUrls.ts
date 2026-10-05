import { useCallback, useEffect, useRef, useState } from "react";
import { refreshFileUrl } from "./api";
import { URL_MAX_AGE_MS } from "./config";
import type { AiAttachment } from "./types";

interface CachedUrl {
  url: string;
  fetchedAt: number;
}

/** Общий кэш по key: карточка файла, превью и lightbox видят один свежий url. */
const urlCache = new Map<string, CachedUrl>();
const inflight = new Map<string, Promise<CachedUrl>>();

export function canRefresh(attachment: AiAttachment): boolean {
  return !attachment.local && attachment.key.length > 0;
}

function current(attachment: AiAttachment): CachedUrl {
  const cached = canRefresh(attachment) ? urlCache.get(attachment.key) : undefined;
  if (cached && cached.fetchedAt > attachment.fetchedAt) return cached;
  return { url: attachment.url, fetchedAt: attachment.fetchedAt };
}

export function isUrlStale(attachment: AiAttachment): boolean {
  if (!canRefresh(attachment)) return false;
  return Date.now() - current(attachment).fetchedAt > URL_MAX_AGE_MS;
}

/** Возвращает url; если он старше 25 минут (или force) — сначала запрашивает свежий. */
export async function ensureFreshUrl(
  attachment: AiAttachment,
  options: { force?: boolean } = {},
): Promise<string> {
  const now = current(attachment);
  if (!canRefresh(attachment)) return now.url;
  if (!options.force && !isUrlStale(attachment) && now.url) return now.url;

  let pending = inflight.get(attachment.key);
  if (!pending) {
    pending = refreshFileUrl(attachment.key)
      .then(({ url }) => {
        const entry = { url, fetchedAt: Date.now() };
        urlCache.set(attachment.key, entry);
        return entry;
      })
      .finally(() => inflight.delete(attachment.key));
    inflight.set(attachment.key, pending);
  }
  return (await pending).url;
}

/** Url вложения для <img>: обновляется заранее, если устарел, и один раз по onError. */
export function useAttachmentUrl(attachment: AiAttachment) {
  const [url, setUrl] = useState(() => current(attachment).url);
  const retriedRef = useRef(false);

  useEffect(() => {
    retriedRef.current = false;
    setUrl(current(attachment).url);
    if (isUrlStale(attachment)) {
      void ensureFreshUrl(attachment)
        .then(setUrl)
        .catch(() => undefined);
    }
  }, [attachment]);

  /** Вызывать из onError у <img>: один refresh, дальше — отдаём ошибку. */
  const handleLoadError = useCallback(async (): Promise<boolean> => {
    if (retriedRef.current || !canRefresh(attachment)) return false;
    retriedRef.current = true;
    try {
      setUrl(await ensureFreshUrl(attachment, { force: true }));
      return true;
    } catch {
      return false;
    }
  }, [attachment]);

  return { url, handleLoadError };
}
