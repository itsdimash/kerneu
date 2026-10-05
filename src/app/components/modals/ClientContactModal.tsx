import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  createClientContact,
  updateClientContact,
  type ClientContact,
  type ClientContactPayload,
} from "../../../api/clients";
import { formatPhoneInput } from "../../../lib/phone";

const NAME_MAX = 255;
const PHONE_MIN = 5;
const PHONE_MAX = 20;
const EMAIL_MAX = 150;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_CLS =
  "w-full border border-input bg-input-background rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60";

type Props = {
  clientId: number;
  /** null/undefined — режим добавления нового контакта */
  contact?: ClientContact | null;
  onSaved: (contact: ClientContact) => void;
  onCancel: () => void;
};

export function ClientContactModal({ clientId, contact, onSaved, onCancel }: Props) {
  const isEdit = !!contact;

  const [fullName, setFullName] = useState(contact?.full_name ?? "");
  const [position, setPosition] = useState(contact?.position ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [note, setNote] = useState(contact?.note ?? "");
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmedName = fullName.trim();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim();

  const nameError =
    trimmedName.length === 0 || trimmedName.length > NAME_MAX
      ? "Укажите ФИО контакта"
      : null;
  const phoneError =
    trimmedPhone.length > 0 && (trimmedPhone.length < PHONE_MIN || trimmedPhone.length > PHONE_MAX)
      ? `Телефон: от ${PHONE_MIN} до ${PHONE_MAX} символов`
      : null;
  const emailError =
    trimmedEmail.length > 0 && (trimmedEmail.length > EMAIL_MAX || !EMAIL_RE.test(trimmedEmail))
      ? "Введите корректный email (до 150 символов)"
      : null;

  const canSubmit = !nameError && !phoneError && !emailError;

  const handleConfirm = async () => {
    setTouched(true);
    if (!canSubmit || submitting) return;

    // При создании пустые необязательные поля не отправляем, при правке
    // шлём null — так пользователь может очистить ранее заполненное поле.
    const optional = (value: string): string | null | undefined => {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      return isEdit ? null : undefined;
    };

    const payload: ClientContactPayload = {
      full_name: trimmedName,
      position: optional(position),
      phone: optional(phone),
      email: optional(email),
      note: optional(note),
      is_primary: isPrimary,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = contact
        ? await updateClientContact(clientId, contact.id, payload)
        : await createClientContact(clientId, payload);
      toast.success(isEdit ? "Контакт сохранён" : "Контакт добавлен");
      onSaved(saved);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить контакт");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfirmDialog
      title={isEdit ? "Редактировать контакт" : "Новый контакт"}
      confirmLabel={isEdit ? "Сохранить" : "Добавить"}
      tone="primary"
      loading={submitting}
      confirmDisabled={!canSubmit}
      onConfirm={handleConfirm}
      onCancel={() => {
        if (!submitting) onCancel();
      }}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleConfirm();
        }}
        noValidate
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">
            ФИО <span className="text-destructive">*</span>
          </span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={submitting}
            maxLength={NAME_MAX}
            className={INPUT_CLS}
          />
          {touched && nameError && (
            <span className="mt-1 block text-[11px] text-destructive">{nameError}</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Должность</span>
          <input
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            disabled={submitting}
            className={INPUT_CLS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Телефон</span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value, phone))}
            disabled={submitting}
            placeholder="+7 (777) 123-45-67"
            className={INPUT_CLS}
          />
          {touched && phoneError && (
            <span className="mt-1 block text-[11px] text-destructive">{phoneError}</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
            maxLength={EMAIL_MAX}
            placeholder="name@example.com"
            className={INPUT_CLS}
          />
          {touched && emailError && (
            <span className="mt-1 block text-[11px] text-destructive">{emailError}</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Заметка</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={submitting}
            rows={2}
            className={INPUT_CLS}
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(event) => setIsPrimary(event.target.checked)}
            disabled={submitting}
            className="h-4 w-4 accent-primary"
          />
          Основной контакт
        </label>

        {submitError && (
          <p className="rounded-md border border-destructive/20 bg-destructive-muted px-3 py-2 text-xs text-destructive">
            {submitError}
          </p>
        )}

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </ConfirmDialog>
  );
}
