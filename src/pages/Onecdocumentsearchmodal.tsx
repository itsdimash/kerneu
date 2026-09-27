import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Search, X } from "lucide-react";
import {
  linkOnecDocument,
  searchOnecDocuments,
  toNumber,
  type OnecDocType,
  type OnecDocumentCandidate,
} from "../api/onec";
import type { ProjectDocumentResponse } from "../api/api";

interface OnecDocumentSearchModalProps {
  open: boolean;
  onClose: () => void;
  docType: OnecDocType;
  /** Человекочитаемое название для заголовка и пустого состояния — "Накладная" / "Доверенность" / "Счёт на оплату" */
  docLabel: string;
  projectId: string | number;
  /** Стартовое значение поля "БИН/ИИН" — пока неоткуда взять автоматически (см. design doc), редактируется вручную */
  defaultBinIin: string;
  onLinked: (doc: ProjectDocumentResponse) => void;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Цвет бейджа для payment_status/shipment_status — "не оплачен"/"не
// отгружен" тревожные (красный), "частично" — промежуточные (жёлтый),
// "оплачен"/"отгружен" — готовые (зелёный). Общая функция для обоих полей,
// т.к. у них одинаковая трёхступенчатая градация с одинаковыми префиксами.
function statusBadgeStyle(status: string): string {
  if (status.startsWith("не ")) {
    return "bg-red-50 dark:bg-red-400/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-400/25";
  }
  if (status.startsWith("частично")) {
    return "bg-orange-50 dark:bg-orange-400/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-400/25";
  }
  return "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-400/25";
}

export function OnecDocumentSearchModal({
  open,
  onClose,
  docType,
  docLabel,
  projectId,
  defaultBinIin,
  onLinked,
}: OnecDocumentSearchModalProps) {
  const [binIin, setBinIin] = useState(defaultBinIin);
  const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(90));
  const [dateTo, setDateTo] = useState(() => todayIso());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<OnecDocumentCandidate[]>([]);
  const [linkingRefKey, setLinkingRefKey] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Сбрасываем форму поиска при каждом новом открытии (в т.ч. при переключении
  // между "Из 1С" на разных карточках — накладная/доверенность/счёт).
  useEffect(() => {
    if (!open) return;
    setBinIin(defaultBinIin);
    setDateFrom(isoDaysAgo(90));
    setDateTo(todayIso());
    setSearched(false);
    setError(null);
    setCandidates([]);
    setLinkError(null);
  }, [open, defaultBinIin, docType]);

  if (!open) return null;

  const handleSearch = async () => {
    if (!binIin.trim()) {
      setError("Укажите БИН или ИИН контрагента");
      return;
    }
    setLoading(true);
    setError(null);
    setLinkError(null);
    try {
      const results = await searchOnecDocuments(docType, binIin.trim(), dateFrom, dateTo);
      setCandidates(results);
    } catch (err) {
      setCandidates([]);
      setError(err instanceof Error ? err.message : "Не удалось найти документ в 1С");
    } finally {
      setSearched(true);
      setLoading(false);
    }
  };

  const handleAttach = async (candidate: OnecDocumentCandidate) => {
    setLinkingRefKey(candidate.ref_key);
    setLinkError(null);
    try {
      const doc = await linkOnecDocument(projectId, docType, candidate.ref_key);
      onLinked(doc);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Не удалось сохранить документ");
    } finally {
      setLinkingRefKey(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Download size={16} className="text-primary" />
              Загрузить «{docLabel}» из 1С
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Поиск по БИН/ИИН контрагента и периоду — точный номер документа знать не нужно.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">БИН/ИИН контрагента</label>
            <input
              type="text"
              value={binIin}
              onChange={(e) => setBinIin(e.target.value)}
              placeholder="12 цифр"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">С даты</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">По дату</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? "Ищем в 1С…" : "Искать"}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && searched && candidates.length === 0 && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            Документ «{docLabel}» по этому проекту в 1С пока не найден. Проверьте БИН/ИИН
            контрагента и период, либо уточните у бухгалтера, создан ли он.
          </div>
        )}

        {candidates.length > 0 && (
          <div className="mt-4 space-y-2">
            {linkError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                <span>{linkError}</span>
              </div>
            )}
            {candidates.map((c) => (
              <div
                key={c.ref_key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.number ? `№ ${c.number}` : "Без номера"} от {c.date}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.counterparty_name}
                    {c.sum !== null && c.sum !== undefined
                      ? ` · ${toNumber(c.sum).toLocaleString("ru-RU")} ₸`
                      : ""}
                  </p>
                  {/* Статус оплаты/отгрузки — только у payment_invoice (см.
                      OnecDocumentCandidate на бэкенде), у накладной/доверенности
                      этих полей нет вовсе. Приближённо: сопоставление по
                      контрагенту+сумме+периоду, не по формальной ссылке
                      "оплата к конкретному счёту". */}
                  {(c.payment_status || c.shipment_status) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.payment_status && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${statusBadgeStyle(c.payment_status)}`}>
                          {c.payment_status}
                        </span>
                      )}
                      {c.shipment_status && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${statusBadgeStyle(c.shipment_status)}`}>
                          {c.shipment_status}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleAttach(c)}
                  disabled={linkingRefKey !== null}
                  className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {linkingRefKey === c.ref_key ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    "Прикрепить"
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}