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

// БИН/ИИН в Казахстане — ровно 12 цифр.
const BIN_IIN_LENGTH = 12;

// Всё, что не цифра, отбрасываем сразу при вводе/вставке — буквы, пробелы и
// дефисы (например, из «123 456 789 012», скопированного из документа) в
// поле просто не попадают. Не обрезаем по длине: вставка 13+ цифр должна
// показать ошибку «слишком много», а не молча потерять хвост.
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
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
  const [binIin, setBinIin] = useState(() => digitsOnly(defaultBinIin));
  // Ошибку «слишком мало» показываем только после ухода из поля — пока
  // человек ещё печатает, красная рамка на 3-й цифре из 12 — это шум.
  // «Слишком много» показывается сразу, т.к. это уже точно ошибка.
  const [binIinTouched, setBinIinTouched] = useState(false);
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
    setBinIin(digitsOnly(defaultBinIin));
    setBinIinTouched(false);
    setDateFrom(isoDaysAgo(90));
    setDateTo(todayIso());
    setSearched(false);
    setError(null);
    setCandidates([]);
    setLinkError(null);
  }, [open, defaultBinIin, docType]);

  if (!open) return null;

  const binIinLength = binIin.length;
  const binIinValid = binIinLength === BIN_IIN_LENGTH;
  const binIinTooLong = binIinLength > BIN_IIN_LENGTH;
  const showBinIinError = !binIinValid && (binIinTooLong || (binIinTouched && binIinLength > 0));
  // Пустое поле после ухода из него — тоже ошибка, но с прежним текстом
  // из handleSearch («Укажите…»), а не счётчиком «0 из 12».
  const showBinIinEmptyError = binIinTouched && binIinLength === 0;
  const binIinInvalidVisible = showBinIinError || showBinIinEmptyError;

  const handleSearch = async () => {
    if (!binIinValid) {
      setBinIinTouched(true);
      return;
    }
    setLoading(true);
    setError(null);
    setLinkError(null);
    try {
      const results = await searchOnecDocuments(docType, binIin, dateFrom, dateTo);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out-strong"
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
            <label htmlFor="onec-bin-iin" className="text-xs font-medium text-muted-foreground">БИН/ИИН контрагента</label>
            <input
              id="onec-bin-iin"
              type="text"
              value={binIin}
              onChange={(e) => setBinIin(digitsOnly(e.target.value))}
              onBlur={() => setBinIinTouched(true)}
              placeholder="12 цифр"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={binIinInvalidVisible}
              aria-describedby="onec-bin-iin-hint"
              className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out-strong focus:ring-2 ${
                binIinInvalidVisible
                  ? "border-destructive focus:ring-destructive/20"
                  : "border-border focus:border-primary/50 focus:ring-ring/20"
              }`}
            />
            {/* Строка подсказки занимает место всегда (min-h), а текст ошибки
                только гасится по opacity — иначе появление/исчезновение
                ошибки сдвигало бы поля дат и кнопку на каждом изменении. */}
            <div id="onec-bin-iin-hint" className="mt-1 flex min-h-4 items-center justify-between gap-2 text-xs">
              <span
                aria-hidden={!binIinInvalidVisible}
                className={`text-destructive transition-opacity duration-150 ease-out-strong ${
                  binIinInvalidVisible ? "opacity-100" : "opacity-0"
                }`}
              >
                {showBinIinEmptyError
                  ? "Укажите БИН или ИИН контрагента"
                  : binIinTooLong
                  ? "БИН/ИИН должен содержать 12 цифр — уберите лишние"
                  : "БИН/ИИН должен содержать 12 цифр"}
              </span>
              <span
                className={`flex-shrink-0 tabular-nums transition-colors duration-150 ease-out-strong ${
                  binIinInvalidVisible ? "text-destructive" : binIinValid ? "text-success" : "text-muted-foreground"
                }`}
              >
                {binIinLength} из {BIN_IIN_LENGTH}
              </span>
            </div>
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
            disabled={loading || !binIinValid}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-[background-color,opacity,transform] duration-150 ease-out-strong hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
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