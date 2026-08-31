import React, { useState, useEffect, useMemo } from "react";
import { Trash2, Loader2, FolderOpen, Package, X } from "lucide-react";
import {
  fetchNotes,
  createNote,
  deleteNote,
  fetchProducts,
  type NoteDTO,
  type NoteEntityType,
  type ProductInfo,
} from "../../../api/api";

type Attachment = { type: NoteEntityType; id: number; label: string };

// "attach" mode: which picker (if any) is currently open under the textarea.
type PickerMode = "none" | "project" | "product";

export function NotesCard({
  projects,
}: {
  projects: { id: number; name: string }[];
}) {
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>("none");
  const [pickerQuery, setPickerQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Full product list, fetched once on first use of the product picker
  // (GET /products/ returns everything — no server-side search — so we
  // cache it here and filter client-side, same as the projects list).
  const [products, setProducts] = useState<ProductInfo[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);

  // Local cache so previously-picked/seen entity names don't have to be
  // re-fetched to render a note's attachment chip in the list below.
  const [nameCache, setNameCache] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAllNotes();
  }, []);

  const loadAllNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotes(); // no filters -> everything the user has
      setNotes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить заметки");
    } finally {
      setLoading(false);
    }
  };

  const projectMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [];
    return projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [pickerQuery, projects]);

  const productMatches = useMemo(() => {
    if (!products) return [];
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [pickerQuery, products]);

  const openPicker = async (mode: "project" | "product") => {
    setPickerMode(mode);
    setPickerQuery("");
    if (mode === "product" && products === null) {
      setProductsLoading(true);
      try {
        const data = await fetchProducts();
        setProducts(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить товары");
        setProducts([]); // avoid retrying every open on repeated failure
      } finally {
        setProductsLoading(false);
      }
    }
  };

  const closePicker = () => {
    setPickerMode("none");
    setPickerQuery("");
  };

  const handlePickProject = (p: { id: number; name: string }) => {
    setAttachment({ type: "project", id: p.id, label: p.name });
    setNameCache((prev) => ({ ...prev, [`project:${p.id}`]: p.name }));
    closePicker();
  };

  const handlePickProduct = (p: ProductInfo) => {
    setAttachment({ type: "product", id: p.id, label: p.name });
    setNameCache((prev) => ({ ...prev, [`product:${p.id}`]: p.name }));
    closePicker();
  };

  const handleAddNote = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const note = await createNote(trimmed, attachment?.type, attachment?.id);
      setNotes((prev) => [note, ...prev]);
      setContent("");
      setAttachment(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить заметку");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить заметку");
    }
  };

  const attachmentLabel = (n: NoteDTO): string | null => {
    if (!n.entity_type || n.entity_id == null) return null;
    const cached = nameCache[`${n.entity_type}:${n.entity_id}`];
    if (cached) return cached;
    if (n.entity_type === "project") {
      const p = projects.find((pr) => pr.id === n.entity_id);
      if (p) return p.name;
    } else if (n.entity_type === "product" && products) {
      const p = products.find((pr) => pr.id === n.entity_id);
      if (p) return p.name;
    }
    // No name available yet (products not loaded this session, etc.) —
    // fall back to a generic label rather than blocking the render.
    return n.entity_type === "project" ? `Проект #${n.entity_id}` : `Товар #${n.entity_id}`;
  };

  return (
    <div className="bg-card rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Мои заметки</h3>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Написать заметку..."
        rows={2}
        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background resize-none mb-2"
      />

      {/* Attach row: either the chosen chip, or the two attach buttons */}
      {attachment ? (
        <div className="flex items-center gap-1.5 mb-2 text-xs">
          {attachment.type === "project" ? (
            <FolderOpen size={12} className="text-primary" />
          ) : (
            <Package size={12} className="text-primary" />
          )}
          <span className="text-foreground font-medium">{attachment.label}</span>
          <button
            onClick={() => setAttachment(null)}
            className="text-muted-foreground hover:text-destructive"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => openPicker(pickerMode === "project" ? "none" : "project")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <FolderOpen size={12} /> Проект
          </button>
          <button
            onClick={() => openPicker(pickerMode === "product" ? "none" : "product")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Package size={12} /> Товар
          </button>
        </div>
      )}

      {/* Inline picker for whichever entity type is active */}
      {pickerMode !== "none" && (
        <div className="mb-2 border border-border rounded-lg p-2 bg-background/60">
          <input
            autoFocus
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder={pickerMode === "project" ? "Поиск проекта..." : "Поиск товара..."}
            className="w-full text-xs px-2 py-1.5 rounded border border-border bg-card mb-1.5"
          />
          <div className="max-h-36 overflow-auto">
            {pickerMode === "project" &&
              projectMatches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePickProject(p)}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-card"
                >
                  {p.name}
                </button>
              ))}
            {pickerMode === "product" && productsLoading && (
              <p className="text-xs text-muted-foreground px-2 py-1.5">Загрузка товаров...</p>
            )}
            {pickerMode === "product" &&
              !productsLoading &&
              productMatches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePickProduct(p)}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-card"
                >
                  {p.name}
                </button>
              ))}
            {pickerMode === "product" &&
              !productsLoading &&
              pickerQuery.trim() &&
              productMatches.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1.5">Ничего не найдено</p>
              )}
          </div>
        </div>
      )}

      <button
        onClick={handleAddNote}
        disabled={saving || !content.trim()}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 mb-4"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Добавить
      </button>

      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : notes.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-auto">
          {notes.map((n) => {
            const label = attachmentLabel(n);
            return (
              <div key={n.id} className="flex items-start justify-between gap-2 group">
                <div>
                  <p className="text-sm text-foreground">{n.content}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("ru-RU")}
                    </p>
                    {label && (
                      <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {label}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Пока нет заметок</p>
      )}
    </div>
  );
}
