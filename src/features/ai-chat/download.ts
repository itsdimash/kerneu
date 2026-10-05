import axios from "axios";
import { toast } from "sonner";
import { refreshFileUrl } from "./api";
import { canRefresh } from "./fileUrls";
import type { AiAttachment } from "./types";

/** Свежая ссылка на скачивание; один повтор, если эндпоинт ответил 403. */
async function requestDownloadUrl(key: string): Promise<string> {
  try {
    return (await refreshFileUrl(key, { download: true })).url;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      return (await refreshFileUrl(key, { download: true })).url;
    }
    throw error;
  }
}

function clickHiddenLink(url: string, downloadName?: string, newTab = false) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  if (downloadName) link.download = downloadName;
  if (newTab) link.target = "_blank";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Скачивает вложение без перезагрузки страницы. Ссылка запрашивается в момент клика,
 * поэтому протухнуть она не успевает. Ошибка — тост с кнопкой «Повторить».
 */
export async function downloadAttachment(attachment: AiAttachment): Promise<boolean> {
  try {
    if (canRefresh(attachment)) {
      clickHiddenLink(await requestDownloadUrl(attachment.key));
    } else if (attachment.url.startsWith("blob:")) {
      clickHiddenLink(attachment.url, attachment.name);
    } else if (attachment.url) {
      // Ключа нет — «attachment» от хранилища не гарантирован, чтобы не уйти со страницы, открываем во вкладке.
      clickHiddenLink(attachment.url, attachment.name, true);
    } else {
      throw new Error("no url");
    }
    return true;
  } catch {
    toast.error("Не удалось скачать файл", {
      action: { label: "Повторить", onClick: () => void downloadAttachment(attachment) },
    });
    return false;
  }
}
