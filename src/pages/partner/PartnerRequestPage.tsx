import { useState } from "react";
import { AlertTriangle, ClipboardList, Loader2, Package, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PARTNER_MAX_ITEMS, PROJECT_NAME_MAX, PROJECT_NAME_MIN } from "../../api/partner";
import { Skeleton } from "../../app/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../app/components/ui/dialog";
import { lineError, type PartnerDraft } from "./usePartnerDraft";
import { BRAND_GRADIENT, CARD, FOCUS_RING, PageHeader, QtyStepper } from "./partnerUi";

// Страница «Заявка»: оформление собранного на складе черновика.
export function PartnerRequestPage({
  draft,
  onGoCatalog,
}: {
  draft: PartnerDraft;
  onGoCatalog: () => void;
}) {
  const { lines, projectName, projectError, comment, submitting, problem } = draft;
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Отмена доступна, пока в черновике есть хоть что-то: позиции, название проекта или комментарий.
  const hasDraft = lines.length > 0 || projectName.trim() !== "" || comment.trim() !== "";

  const handleCancelConfirmed = () => {
    // Тот же путь очистки, что и раньше у «Очистить заявку»: состояние + ключ в sessionStorage.
    draft.clear();
    setConfirmCancel(false);
    toast.success("Заявка отменена");
    onGoCatalog();
  };

  const trimmedLength = projectName.trim().length;
  const nameTooShort = projectName.length > 0 && trimmedLength < PROJECT_NAME_MIN;
  const nameMessage = projectError ?? (nameTooShort ? `Название проекта — минимум ${PROJECT_NAME_MIN} символа` : null);

  // Идёт восстановление черновика после F5 — вместо пустого состояния скелетон.
  if (draft.restoring) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Заявка" subtitle="Восстанавливаем вашу заявку…" />
        <div className={`${CARD} space-y-5 p-5 sm:p-6`} aria-busy="true" aria-label="Загрузка заявки">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="ml-auto h-11 w-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!hasDraft && !submitting) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Заявка" subtitle="Оформление заявки на товары со склада" />
        <div className={`${CARD} flex flex-col items-center gap-3 px-6 py-16 text-center`}>
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm ${BRAND_GRADIENT}`}>
            <ClipboardList size={26} />
          </span>
          <p className="text-base font-semibold text-foreground">В заявке пока ничего нет</p>
          <p className="max-w-xs text-sm text-muted-foreground">Выберите нужные товары в каталоге склада — они появятся здесь.</p>
          <button
            type="button"
            onClick={onGoCatalog}
            className={`mt-1 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] ${BRAND_GRADIENT} ${FOCUS_RING}`}
          >
            <Package size={15} /> Перейти на склад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Заявка" subtitle="Проверьте позиции и количество, укажите проект и отправьте заявку на рассмотрение." />

      {draft.staleStock && (
        <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-muted px-4 py-3 text-sm text-warning">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Не удалось обновить остатки, проверьте количество перед отправкой.
        </div>
      )}

      <div className={`${CARD} divide-y divide-border`}>
        {/* Проект */}
        <div className="p-5 sm:p-6">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="partner-request-project" className="text-sm font-medium text-foreground">
              Название проекта <span className="text-destructive" aria-hidden>*</span>
            </label>
            <span className={`font-mono text-[11px] ${projectName.length >= PROJECT_NAME_MAX ? "text-destructive" : "text-muted-foreground"}`}>
              {projectName.length}/{PROJECT_NAME_MAX}
            </span>
          </div>
          <input
            id="partner-request-project"
            type="text"
            value={projectName}
            maxLength={PROJECT_NAME_MAX}
            disabled={submitting}
            required
            aria-required="true"
            aria-invalid={nameMessage !== null}
            aria-describedby={nameMessage ? "partner-request-project-error" : undefined}
            onChange={(e) => draft.setProjectName(e.target.value)}
            placeholder="Например: Школа №5"
            className={`h-11 w-full rounded-xl border bg-background px-3.5 text-sm transition-shadow placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-60 ${
              nameMessage ? "border-destructive/60 focus:ring-destructive/20" : "border-border focus:border-primary focus:ring-primary/20"
            }`}
          />
          {nameMessage && (
            <p id="partner-request-project-error" className="mt-1.5 text-xs text-destructive">
              {nameMessage}
            </p>
          )}
        </div>

        {/* Позиции */}
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">
              Позиции <span className="text-muted-foreground">({lines.length})</span>
            </h2>
          </div>

          <ul className="space-y-2">
            {lines.map((line) => {
              const err = lineError(line);
              return (
                <li
                  key={line.productId}
                  className={`animate-in fade-in rounded-xl border px-4 py-3 duration-200 ${
                    err ? "border-destructive/40 bg-destructive-muted/40" : "border-transparent bg-muted/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="break-words text-sm font-medium leading-snug text-foreground">{line.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {line.available === null
                          ? "Доступное количество уточняется"
                          : `Доступно: ${line.available.toLocaleString("ru-RU")} ${line.unit ?? ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <QtyStepper
                        value={line.quantity}
                        max={line.available ?? Number.MAX_SAFE_INTEGER}
                        label={line.name}
                        disabled={submitting}
                        onChange={(q) => draft.setQuantity(line.productId, q)}
                      />
                      <span className="w-8 text-xs text-muted-foreground">{line.unit ?? ""}</span>
                      <button
                        type="button"
                        onClick={() => draft.remove(line.productId)}
                        disabled={submitting}
                        aria-label={`Удалить из заявки: ${line.name}`}
                        className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive-muted hover:text-destructive disabled:opacity-50 ${FOCUS_RING}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {err && <p className="mt-1.5 text-xs text-destructive">{err}</p>}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={onGoCatalog}
            disabled={submitting}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3.5 py-2 text-sm font-medium text-primary transition-colors duration-150 hover:border-primary/50 hover:bg-accent/50 disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Plus size={14} /> Добавить товары
          </button>
        </div>

        {/* Комментарий */}
        <div className="p-5 sm:p-6">
          <label htmlFor="partner-request-comment" className="mb-1.5 block text-sm font-medium text-foreground">
            Комментарий <span className="font-normal text-muted-foreground">(необязательно)</span>
          </label>
          <textarea
            id="partner-request-comment"
            value={comment}
            rows={3}
            disabled={submitting}
            onChange={(e) => draft.setComment(e.target.value)}
            placeholder="Например: нужно к пятнице"
            className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm transition-shadow placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </div>

        {/* Ошибки и итог */}
        <div className="space-y-4 p-5 sm:p-6">
          {problem && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive-muted px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
              <div className="min-w-0 text-sm text-destructive">
                {problem.kind === "insufficient" ? (
                  <>
                    <p className="font-semibold">Не хватает товара на складе:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {problem.items.map((item) => (
                        <li key={item.product_id}>
                          {item.name}: запрошено {item.requested}, доступно {item.available}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-xs">Уменьшите количество и отправьте заявку снова.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{problem.message}</p>
                    {problem.lines && problem.lines.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {problem.lines.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Позиций: <b className="font-semibold text-foreground">{lines.length}</b> из {PARTNER_MAX_ITEMS}
            </p>
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:flex-col-reverse max-sm:items-stretch">
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                disabled={!hasDraft || submitting}
                aria-label="Отменить заявку"
                className={`flex h-11 min-w-[130px] items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors duration-150 enabled:hover:border-destructive/40 enabled:hover:bg-destructive-muted enabled:hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full ${FOCUS_RING}`}
              >
                <X size={15} />
                Отменить
              </button>
              <button
                type="button"
                onClick={() => void draft.submit()}
                disabled={!draft.canSubmit}
                className={`flex h-11 min-w-[170px] items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold text-white shadow-sm transition-all duration-150 enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:bg-none disabled:text-muted-foreground disabled:shadow-none max-sm:w-full ${BRAND_GRADIENT} ${FOCUS_RING}`}
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {submitting ? "Отправка…" : "Отправить заявку"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Escape и клик вне диалога закрывают его без очистки (поведение Dialog). */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отменить заявку?</DialogTitle>
            <DialogDescription>
              Позиции, название проекта и комментарий будут удалены. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className={`h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted ${FOCUS_RING}`}
            >
              Вернуться
            </button>
            <button
              type="button"
              onClick={handleCancelConfirmed}
              className={`flex h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 ${FOCUS_RING}`}
            >
              <Trash2 size={14} /> Отменить заявку
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
