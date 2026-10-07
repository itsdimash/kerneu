import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchProjectDocumentsState,
  setDocumentNotRequired,
  unsetDocumentNotRequired,
  type NotRequiredCategory,
  type ProjectDocumentsState,
} from "../api/api";

const POLL_INTERVAL_MS = 5000;

/**
 * Состояние документов проекта из GET /documents/project/{id}/state:
 * документы, состояние категорий («Не требуется»), нужна ли закупка и стадия
 * проверки. Опрашивается раз в 5 с и при фокусе окна.
 */
export function useDocumentsState(projectId: string) {
  // Ответ хранится вместе с id проекта: после переключения проекта данные
  // прошлого не показываются, пока не придёт новый ответ.
  const [loaded, setLoaded] = useState<{ projectId: string; data: ProjectDocumentsState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentId = useRef(projectId);
  currentId.current = projectId;

  const refetch = useCallback(async () => {
    const id = currentId.current;
    if (!id) return;
    try {
      const data = await fetchProjectDocumentsState(id);
      if (currentId.current !== id) return;
      setLoaded({ projectId: id, data });
      setError(null);
    } catch (e) {
      console.error(e);
      if (currentId.current === id) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить документы проекта");
      }
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void refetch();
    const intervalId = window.setInterval(() => { void refetch(); }, POLL_INTERVAL_MS);
    const handleFocus = () => { void refetch(); };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [projectId, refetch]);

  const setNotRequired = useCallback(async (category: NotRequiredCategory) => {
    await setDocumentNotRequired(currentId.current, category);
    await refetch();
  }, [refetch]);

  const unsetNotRequired = useCallback(async (category: NotRequiredCategory) => {
    await unsetDocumentNotRequired(currentId.current, category);
    await refetch();
  }, [refetch]);

  const state = loaded && loaded.projectId === projectId ? loaded.data : null;

  return { state, error, refetch, setNotRequired, unsetNotRequired };
}
