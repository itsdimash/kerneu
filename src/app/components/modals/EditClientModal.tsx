import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";
import { updateClient, type UpdateClientResponse } from "../../../api/clients";
import { formatPhoneInput } from "../../../lib/phone";

const NAME_MIN = 2;
const NAME_MAX = 255;
const PHONE_MIN = 5;
const PHONE_MAX = 20;
const EMAIL_MAX = 150;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_CLS =
  "w-full border border-input bg-input-background rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60";

type EditableClient = {
  id: number;
  client_name: string;
  phone: string | null;
  contact_email: string | null;
};

type Props = {
  client: EditableClient;
  onSaved: (updated: UpdateClientResponse) => void;
  onCancel: () => void;
};

export function EditClientModal({ client, onSaved, onCancel }: Props) {
  const [name, setName] = useState(client.client_name ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [email, setEmail] = useState(client.contact_email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim();

  const nameError =
    trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX
      ? `Название: от ${NAME_MIN} до ${NAME_MAX} символов`
      : null;
  const phoneError =
    trimmedPhone.length < PHONE_MIN || trimmedPhone.length > PHONE_MAX
      ? `Телефон: от ${PHONE_MIN} до ${PHONE_MAX} символов`
      : null;
  const emailError =
    trimmedEmail.length === 0 || trimmedEmail.length > EMAIL_MAX || !EMAIL_RE.test(trimmedEmail)
      ? "Введите корректный email (до 150 символов)"
      : null;

  const canSubmit = !nameError && !phoneError && !emailError;

  const handleConfirm = async () => {
    setTouched(true);
    if (!canSubmit || submitting) return;

    // Отправляем только изменённые поля — незатронутое имя не должно
    // упираться в проверку уникальности на бэкенде.
    const payload: { client_name?: string; phone?: string; contact_email?: string } = {};
    if (trimmedName !== client.client_name) payload.client_name = trimmedName;
    if (trimmedPhone !== (client.phone ?? "")) payload.phone = trimmedPhone;
    if (trimmedEmail !== (client.contact_email ?? "")) payload.contact_email = trimmedEmail;

    if (Object.keys(payload).length === 0) {
      onCancel();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await updateClient(client.id, payload);
      toast.success("Данные клиента сохранены");
      onSaved(updated);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить клиента");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Ошибку показываем внутри формы, а не через prop error у ConfirmDialog:
    // тот при error прячет кнопку подтверждения, и исправить поле и
    // повторить (например, после 409) было бы нельзя без переоткрытия.
    <ConfirmDialog
      title="Редактировать клиента"
      confirmLabel="Сохранить"
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
            Название <span className="text-destructive">*</span>
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            maxLength={NAME_MAX}
            className={INPUT_CLS}
          />
          {touched && nameError && (
            <span className="mt-1 block text-[11px] text-destructive">{nameError}</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">
            Телефон <span className="text-destructive">*</span>
          </span>
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
          <span className="mb-1 block text-xs font-medium text-foreground">
            Email <span className="text-destructive">*</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
            maxLength={EMAIL_MAX}
            placeholder="client@example.com"
            className={INPUT_CLS}
          />
          {touched && emailError && (
            <span className="mt-1 block text-[11px] text-destructive">{emailError}</span>
          )}
        </label>

        {submitError && (
          <p className="rounded-md border border-destructive/20 bg-destructive-muted px-3 py-2 text-xs text-destructive">
            {submitError}
          </p>
        )}

        {/* Нужен, чтобы Enter в полях отправлял форму */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </ConfirmDialog>
  );
}
