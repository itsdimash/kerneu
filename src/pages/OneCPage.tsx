import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  Users,
  XCircle,
} from "lucide-react";

import { PageWrap } from "../app/components/common/PageWrap";
import { SectionHeader } from "../app/components/common/SectionHeader";
import { StatCard } from "../app/components/common/StatCard";

import {
  fetchCompanyBalance,
  fetchDebtors,
  fetchPaymentStatus,
  toNumber,
} from "../api/onec";
import type {
  CompanyBalanceResponse,
  DebtorItem,
  DebtorsResponse,
  Numeric,
  PaymentStatusResponse,
} from "../api/onec";

// ==========================================
// СТРАНИЦА 1С — три вкладки поверх read-only эндпоинтов интеграции.
// Данные тянутся из 1С:Фреш по OData, поэтому:
//   1) ничего не грузим на автомате, кроме баланса (самый дешёвый запрос);
//   2) должники грузятся лениво, при первом открытии вкладки — там цикл
//      запросов по контрагентам, он может идти долго;
//   3) у каждой вкладки своё состояние загрузки и своя ошибка, чтобы
//      упавшая 1С на одной вкладке не гасила остальные.
// ==========================================

type Tab = "balance" | "debtors" | "payment";

const TABS: { id: Tab; label: string }[] = [
  { id: "balance", label: "Баланс" },
  { id: "debtors", label: "Должники" },
  { id: "payment", label: "Оплата" },
];

const isoToday = (): string => new Date().toISOString().slice(0, 10);

const isoStartOfYear = (): string => `${new Date().getFullYear()}-01-01`;

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatMoney = (value: Numeric | null | undefined): string =>
  `${moneyFormatter.format(Math.round(toNumber(value)))} ₸`;

/** as_of приходит от datetime.utcnow() без таймзоны — иначе браузер прочитает его как местное время. */
const formatUtcMoment = (value: string | null | undefined): string => {
  if (!value) return "—";
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive-muted px-4 py-3">
      <p className="text-sm font-medium text-destructive">Данные из 1С не получены</p>
      <p className="mt-1 text-xs text-destructive/80">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <RefreshCw size={13} /> Повторить
        </button>
      )}
    </div>
  );
}

function LoadingNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-8 justify-center">
      <Loader2 size={16} className="animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();

  const style =
    normalized === "оплачен"
      ? { cls: "bg-success-muted text-success border-success/20", Icon: CheckCircle2 }
      : normalized === "частично оплачен"
        ? { cls: "bg-warning-muted text-warning border-warning/20", Icon: Clock }
        : { cls: "bg-destructive-muted text-destructive border-destructive/20", Icon: XCircle };

  const { cls, Icon } = style;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      <Icon size={13} />
      {status}
    </span>
  );
}

export function OneCPage() {
  const [tab, setTab] = useState<Tab>("balance");

  const [dateFrom, setDateFrom] = useState(isoStartOfYear());
  const [dateTo, setDateTo] = useState(isoToday());

  const periodInvalid = Boolean(dateFrom) && Boolean(dateTo) && dateFrom > dateTo;

  // ── Баланс ──────────────────────────────────────────────
  const [balance, setBalance] = useState<CompanyBalanceResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    if (!dateFrom || dateFrom > dateTo) return;

    setBalanceLoading(true);
    setBalanceError(null);

    try {
      setBalance(await fetchCompanyBalance(dateFrom, dateTo || undefined));
    } catch (error) {
      setBalance(null);
      setBalanceError(
        error instanceof Error ? error.message : "Не удалось загрузить баланс из 1С",
      );
    } finally {
      setBalanceLoading(false);
    }
  }, [dateFrom, dateTo]);

  // ── Должники ────────────────────────────────────────────
  const [debtors, setDebtors] = useState<DebtorsResponse | null>(null);
  const [debtorsLoading, setDebtorsLoading] = useState(false);
  const [debtorsError, setDebtorsError] = useState<string | null>(null);
  const [debtorsQuery, setDebtorsQuery] = useState("");
  const debtorsLoadedRef = useRef(false);

  const loadDebtors = useCallback(async () => {
    if (!dateFrom || dateFrom > dateTo) return;

    setDebtorsLoading(true);
    setDebtorsError(null);

    try {
      setDebtors(await fetchDebtors(dateFrom, dateTo || undefined));
      debtorsLoadedRef.current = true;
    } catch (error) {
      setDebtors(null);
      setDebtorsError(
        error instanceof Error ? error.message : "Не удалось загрузить должников из 1С",
      );
    } finally {
      setDebtorsLoading(false);
    }
  }, [dateFrom, dateTo]);

  // ── Статус оплаты ───────────────────────────────────────
  const [documentNumber, setDocumentNumber] = useState("");
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [paymentNotFound, setPaymentNotFound] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const checkPayment = useCallback(async () => {
    const trimmed = documentNumber.trim();
    if (!trimmed) return;

    setPaymentLoading(true);
    setPaymentError(null);
    setPaymentNotFound(null);
    setPayment(null);

    try {
      const result = await fetchPaymentStatus(trimmed);
      if (result) {
        setPayment(result);
      } else {
        setPaymentNotFound(trimmed);
      }
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "Не удалось проверить статус оплаты",
      );
    } finally {
      setPaymentLoading(false);
    }
  }, [documentNumber]);

  // Баланс — единственный запрос на автозагрузку: он один, без цикла по
  // контрагентам, и это то, ради чего страницу открывают чаще всего.
  useEffect(() => {
    void loadBalance();
    // намеренно только при монтировании — дальше обновление по кнопке
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Должников подтягиваем при первом заходе на вкладку, дальше — вручную.
  useEffect(() => {
    if (tab === "debtors" && !debtorsLoadedRef.current && !debtorsLoading && !debtorsError) {
      void loadDebtors();
    }
  }, [tab, debtorsLoading, debtorsError, loadDebtors]);

  const refreshCurrentTab = useCallback(() => {
    if (tab === "balance") void loadBalance();
    if (tab === "debtors") void loadDebtors();
  }, [tab, loadBalance, loadDebtors]);

  const filteredDebtors = useMemo<DebtorItem[]>(() => {
    const list = debtors?.debtors ?? [];
    const query = debtorsQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter(
      (debtor) =>
        debtor.counterparty_name.toLowerCase().includes(query) ||
        (debtor.bin_iin ?? "").toLowerCase().includes(query),
    );
  }, [debtors, debtorsQuery]);

  const filteredTotal = useMemo(
    () => filteredDebtors.reduce((sum, debtor) => sum + toNumber(debtor.amount_due), 0),
    [filteredDebtors],
  );

  const netBalance = toNumber(balance?.net_balance);
  const isRefreshable = tab !== "payment";
  const isRefreshing = tab === "balance" ? balanceLoading : debtorsLoading;

  return (
    <PageWrap
      title="1С:Бухгалтерия"
      subtitle="Баланс, задолженность контрагентов и статус оплаты — напрямую из 1С"
      actions={
        isRefreshable ? (
          <button
            onClick={refreshCurrentTab}
            disabled={isRefreshing || periodInvalid}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Обновить
          </button>
        ) : undefined
      }
    >
      {/* Вкладки */}
      <div className="mb-5 flex items-center gap-1 border-b border-border">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative px-4 py-2.5 text-sm transition-colors ${
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Период — общий для баланса и должников */}
      {isRefreshable && (
        <div className="mb-5 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Период с</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-md border border-input bg-input-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">по</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-md border border-input bg-input-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {periodInvalid && (
            <p className="pb-2 text-xs text-destructive">
              Дата начала позже даты конца — поправьте период.
            </p>
          )}
        </div>
      )}

      {/* ── Вкладка: Баланс ─────────────────────────────── */}
      {tab === "balance" && (
        <div className="space-y-5">
          {balanceError && <ErrorNote message={balanceError} onRetry={loadBalance} />}

          {balanceLoading && !balance && <LoadingNote text="Считаем баланс в 1С…" />}

          {balance && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard
                  label="Должны компании"
                  value={formatMoney(balance.total_receivable)}
                  sub="Дебиторская задолженность"
                  icon={ArrowDownLeft}
                  iconColor="text-emerald-600 dark:text-emerald-300"
                  iconBg="bg-emerald-50 dark:bg-emerald-400/15"
                />

                <StatCard
                  label="Должна компания"
                  value={formatMoney(balance.total_payable)}
                  sub="Кредиторская задолженность"
                  icon={ArrowUpRight}
                  iconColor="text-rose-600 dark:text-rose-300"
                  iconBg="bg-rose-50 dark:bg-rose-400/15"
                />

                <StatCard
                  label="Сальдо"
                  value={formatMoney(balance.net_balance)}
                  sub={netBalance >= 0 ? "В пользу компании" : "В пользу контрагентов"}
                  icon={Scale}
                />
              </div>

              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {balance.organization} · валюта {balance.currency} · данные на{" "}
                  {formatUtcMoment(balance.as_of)}
                </p>
              </div>
            </>
          )}

          {!balance && !balanceLoading && !balanceError && (
            <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Выберите период и нажмите «Обновить».
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Вкладка: Должники ───────────────────────────── */}
      {tab === "debtors" && (
        <div className="space-y-4">
          {debtorsError && <ErrorNote message={debtorsError} onRetry={loadDebtors} />}

          {debtorsLoading && (
            <LoadingNote text="Собираем должников из 1С — это может занять до минуты…" />
          )}

          {debtors && !debtorsLoading && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard
                  label="Всего к получению"
                  value={formatMoney(debtors.total_due)}
                  sub={`Данные на ${formatUtcMoment(debtors.as_of)}`}
                  icon={ArrowDownLeft}
                  iconColor="text-emerald-600 dark:text-emerald-300"
                  iconBg="bg-emerald-50 dark:bg-emerald-400/15"
                />

                <StatCard
                  label="Контрагентов с долгом"
                  value={String(debtors.debtors.length)}
                  sub={debtors.organization}
                  icon={Users}
                />
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <SectionHeader
                  title="Кто должен компании"
                  action={
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        value={debtorsQuery}
                        onChange={(event) => setDebtorsQuery(event.target.value)}
                        placeholder="Контрагент или БИН/ИИН"
                        className="w-56 rounded-md border border-input bg-input-background py-1.5 pl-8 pr-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  }
                />

                {filteredDebtors.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {debtors.debtors.length === 0
                      ? "За выбранный период должников нет."
                      : "Никто не подошёл под поиск."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                            Контрагент
                          </th>
                          <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                            БИН / ИИН
                          </th>
                          <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                            Не платит с
                          </th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                            Сумма долга
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDebtors.map((debtor) => (
                          <tr
                            key={debtor.counterparty_ref}
                            className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                          >
                            <td className="px-3 py-3 text-foreground">
                              {debtor.counterparty_name}
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                              {debtor.bin_iin ?? "—"}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {formatDate(debtor.oldest_unpaid_date)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-medium text-foreground">
                              {formatMoney(debtor.amount_due)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border">
                          <td
                            colSpan={3}
                            className="px-3 py-3 text-xs font-medium text-muted-foreground"
                          >
                            {debtorsQuery.trim()
                              ? `Найдено: ${filteredDebtors.length} из ${debtors.debtors.length}`
                              : `Всего контрагентов: ${debtors.debtors.length}`}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                            {formatMoney(filteredTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {!debtors && !debtorsLoading && !debtorsError && (
            <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Выберите период и нажмите «Обновить».
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Вкладка: Оплата ─────────────────────────────── */}
      {tab === "payment" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <SectionHeader title="Проверить оплату по документу реализации" />

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">
                  Номер документа в 1С
                </label>
                <input
                  value={documentNumber}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && checkPayment()}
                  placeholder="Например: КГ-000123"
                  className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <button
                onClick={checkPayment}
                disabled={paymentLoading || !documentNumber.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {paymentLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                Проверить
              </button>
            </div>
          </div>

          {paymentError && <ErrorNote message={paymentError} onRetry={checkPayment} />}

          {paymentNotFound && (
            <div className="rounded-lg border border-warning/20 bg-warning-muted px-4 py-3">
              <p className="text-sm font-medium text-warning">Документ не найден</p>
              <p className="mt-1 text-xs text-warning/90">
                В 1С нет реализации с номером «{paymentNotFound}». Проверьте номер — он должен
                совпадать с тем, что стоит в самом документе 1С.
              </p>
            </div>
          )}

          {payment && (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-lg font-semibold text-foreground">
                    {payment.document_number}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {payment.counterparty_name} · от {formatDate(payment.document_date)}
                  </p>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Сумма документа</p>
                  <p className="font-mono text-lg font-semibold text-foreground">
                    {formatMoney(payment.document_amount)}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Оплачено</p>
                  <p className="font-mono text-lg font-semibold text-success">
                    {formatMoney(payment.paid_amount)}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Остаток</p>
                  <p className="font-mono text-lg font-semibold text-foreground">
                    {formatMoney(
                      Math.max(
                        toNumber(payment.document_amount) - toNumber(payment.paid_amount),
                        0,
                      ),
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!payment && !paymentNotFound && !paymentError && !paymentLoading && (
            <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Введите номер реализации, чтобы увидеть, сколько по нему уже оплачено.
              </p>
            </div>
          )}
        </div>
      )}
    </PageWrap>
  );
}
