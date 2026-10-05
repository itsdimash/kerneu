import { useCallback, useEffect, useRef, useState } from "react";
import { extractDocument, parseApiError } from "./api";
import { DOCUMENT_EXTENSIONS, IMAGE_MIME_TYPES, LIMITS } from "./config";
import type { AttachedDocumentItem, AttachedImageItem, AttachedItem } from "./types";
import { formatFileSize, newId, uploadErrorText } from "./utils";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function useAttachments() {
  const [items, setItems] = useState<AttachedItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const itemsRef = useRef<AttachedItem[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());

  const commit = useCallback((updater: (prev: AttachedItem[]) => AttachedItem[]) => {
    itemsRef.current = updater(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const pushErrors = useCallback((messages: string[]) => {
    if (messages.length > 0) setErrors((prev) => [...prev, ...messages]);
  }, []);

  const startUpload = useCallback(
    async (id: string, file: File) => {
      const controller = new AbortController();
      controllersRef.current.set(id, controller);
      try {
        const extracted = await extractDocument(file, {
          signal: controller.signal,
          onProgress: (progress) =>
            commit((prev) =>
              prev.map((item) => (item.id === id && item.kind === "document" ? { ...item, progress } : item)),
            ),
        });
        commit((prev) =>
          prev.map((item) =>
            item.id === id && item.kind === "document"
              ? {
                  ...item,
                  status: "ready",
                  progress: 100,
                  filename: extracted.filename || item.filename,
                  text: extracted.text,
                  truncated: extracted.truncated,
                  charCount: extracted.charCount,
                  fileUrl: extracted.fileUrl,
                  fileKey: extracted.fileKey,
                }
              : item,
          ),
        );
      } catch (error) {
        const info = parseApiError(error);
        if (info.kind === "canceled") return;
        commit((prev) => prev.filter((item) => item.id !== id));
        pushErrors([uploadErrorText(info, file.name)]);
      } finally {
        controllersRef.current.delete(id);
      }
    },
    [commit, pushErrors],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const problems: string[] = [];
      const accepted: { item: AttachedItem; file: File }[] = [];

      let imageCount = itemsRef.current.filter((item) => item.kind === "image").length;
      let imageBytes = itemsRef.current.reduce(
        (sum, item) => (item.kind === "image" ? sum + item.file.size : sum),
        0,
      );

      for (const file of files) {
        if (file.type.startsWith("image/")) {
          if (!IMAGE_MIME_TYPES.includes(file.type)) {
            problems.push(`«${file.name}»: формат изображения не поддерживается (только PNG, JPEG, WebP).`);
          } else if (imageCount >= LIMITS.maxImages) {
            problems.push(`Можно приложить не более ${LIMITS.maxImages} изображений.`);
          } else if (file.size > LIMITS.imageBytes) {
            problems.push(`«${file.name}»: изображение больше ${formatFileSize(LIMITS.imageBytes)}.`);
          } else if (imageBytes + file.size > LIMITS.imagesTotalBytes) {
            problems.push(
              `Суммарный размер изображений не должен превышать ${formatFileSize(LIMITS.imagesTotalBytes)}.`,
            );
          } else {
            imageCount += 1;
            imageBytes += file.size;
            const image: AttachedImageItem = {
              kind: "image",
              id: newId(),
              file,
              previewUrl: URL.createObjectURL(file),
            };
            accepted.push({ item: image, file });
          }
          continue;
        }

        if (!DOCUMENT_EXTENSIONS.includes(extensionOf(file.name))) {
          problems.push(
            `«${file.name}»: формат не поддерживается. Допустимы ${DOCUMENT_EXTENSIONS.join(", ")} и изображения PNG, JPEG, WebP.`,
          );
        } else if (file.size > LIMITS.documentBytes) {
          problems.push(`«${file.name}»: файл больше ${formatFileSize(LIMITS.documentBytes)}.`);
        } else {
          const doc: AttachedDocumentItem = {
            kind: "document",
            id: newId(),
            filename: file.name,
            size: file.size,
            status: "uploading",
            progress: 0,
            text: "",
            truncated: false,
            charCount: 0,
            fileUrl: "",
            fileKey: "",
          };
          accepted.push({ item: doc, file });
        }
      }

      setErrors(problems);
      if (accepted.length === 0) return;

      commit((prev) => [...prev, ...accepted.map((entry) => entry.item)]);
      accepted.forEach(({ item, file }) => {
        if (item.kind === "document") void startUpload(item.id, file);
      });
    },
    [commit, startUpload],
  );

  const remove = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort();
      controllersRef.current.delete(id);
      const target = itemsRef.current.find((item) => item.id === id);
      if (target?.kind === "image") URL.revokeObjectURL(target.previewUrl);
      commit((prev) => prev.filter((item) => item.id !== id));
      setErrors([]);
    },
    [commit],
  );

  const reset = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    itemsRef.current.forEach((item) => {
      if (item.kind === "image") URL.revokeObjectURL(item.previewUrl);
    });
    commit(() => []);
    setErrors([]);
  }, [commit]);

  const dismissErrors = useCallback(() => setErrors([]), []);

  useEffect(() => reset, [reset]);

  return {
    items,
    errors,
    isUploading: items.some((item) => item.kind === "document" && item.status === "uploading"),
    addFiles,
    remove,
    reset,
    dismissErrors,
  };
}

export type AttachmentsApi = ReturnType<typeof useAttachments>;
