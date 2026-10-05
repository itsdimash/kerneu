import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  ArrowLeft, DollarSign, FolderOpen, Loader2, Mail, Pencil, Phone, Plus, Search, Trash2, Users,
} from "lucide-react";
import type { Role } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import { SectionHeader } from "../app/components/common/SectionHeader";
import { StatCard } from "../app/components/common/StatCard";
import { Chip } from "../app/components/common/Chip";
import { ConfirmDialog } from "../app/components/modals/ConfirmDialog";
import { EditClientModal } from "../app/components/modals/EditClientModal";
import { ClientContactModal } from "../app/components/modals/ClientContactModal";
import { fmt, formatDate } from "../lib/format";
import {
  ClientsApiError,
  deleteClientContact,
  fetchClient,
  fetchClients,
  type ClientContact,
  type ClientDetail,
  type ClientListItem,
  type UpdateClientResponse,
} from "../api/clients";

const SEARCH_DEBOUNCE_MS = 250;
const LIST_LIMIT = 100;

// Права на редактирование — только скрытие кнопок; реальный гейт на бэкенде.
const EDIT_ROLES: Role[] = ["pm", "commercial_director", "admin"];

const toNumber = (value: number | string | null | undefined) =>
  value == null ? null : Number(value);

type DetailError = { message: string; status?: number };

export function ClientsPage({
  role,
  onOpenProject,
}: {
  role: Role;
  onOpenProject: (projectId: number) => void;
}) {
  const canEdit = EDIT_ROLES.includes(role);

  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<DetailError | null>(null);

  const [editClientOpen, setEditClientOpen] = useState(false);
  // undefined — модал закрыт, null — добавление, объект — правка
  const [contactModal, setContactModal] = useState<ClientContact | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ClientContact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Список: серверный поиск с дебаунсом 250 мс
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingList(true);
      try {
        const data = await fetchClients(
          { search: query.trim() || undefined, limit: LIST_LIMIT, offset: 0 },
          controller.signal,
        );
        setClients(data);
        setListError(null);
      } catch (reason) {
        if (controller.signal.aborted || axios.isCancel(reason)) return;
        setListError(reason instanceof Error ? reason.message : "Не удалось загрузить клиентов");
      } finally {
        if (!controller.signal.aborted) setLoadingList(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  // Детали выбранного клиента
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    setLoadingDetail(true);
    setDetailError(null);
    setDetail(null);
    fetchClient(selectedId, controller.signal)
      .then((data) => setDetail(data))
      .catch((reason) => {
        if (controller.signal.aborted || axios.isCancel(reason)) return;
        setDetailError({
          message: reason instanceof Error ? reason.message : "Не удалось загрузить клиента",
          status: reason instanceof ClientsApiError ? reason.status : undefined,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDetail(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  // Тихая перезагрузка деталей после изменения контактов — без мигания
  // спиннера (флаг is_primary у соседних контактов меняет бэкенд).
  const reloadDetail = useCallback(async (id: number) => {
    try {
      const data = await fetchClient(id);
      setDetail((current) => (current && current.id === id ? data : current));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Не удалось обновить данные клиента");
    }
  }, []);

  const handleClientSaved = (updated: UpdateClientResponse) => {
    setClients((items) =>
      items.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              client_name: updated.client_name,
              phone: updated.phone,
              contact_email: updated.contact_email,
            }
          : item,
      ),
    );
    setDetail((current) =>
      current && current.id === updated.id
        ? {
            ...current,
            client_name: updated.client_name,
            phone: updated.phone,
            contact_email: updated.contact_email,
            updated_at: updated.updated_at,
          }
        : current,
    );
    setEditClientOpen(false);
  };

  const handleContactSaved = () => {
    setContactModal(undefined);
    if (selectedId !== null) void reloadDetail(selectedId);
  };

  const handleDeleteContact = async () => {
    if (!deleteTarget || selectedId === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteClientContact(selectedId, deleteTarget.id);
      toast.success("Контакт удалён");
      setDeleteTarget(null);
      setDetail((current) =>
        current
          ? { ...current, contacts: current.contacts.filter((c) => c.id !== deleteTarget.id) }
          : current,
      );
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Не удалось удалить контакт");
    } finally {
      setDeleting(false);
    }
  };

  const hasSelection = selectedId !== null;

  return (
    <PageWrap title="Клиенты" subtitle="Проекты, контакты и данные клиентов">
      <div className="flex gap-4">
        {/* Список: на lg+ всегда слева, ниже lg — только пока клиент не выбран */}
        <aside
          className={`${hasSelection ? "hidden lg:flex" : "flex"} w-full min-w-0 flex-col gap-3 lg:w-72 lg:flex-shrink-0`}
        >
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию"
              className="w-full border border-input bg-input-background rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
            {loadingList && (
              <Loader2
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
              />
            )}
          </div>

          <div className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto">
            {listError ? (
              <p className="rounded-md border border-destructive/20 bg-destructive-muted px-3 py-2 text-sm text-destructive">
                {listError}
              </p>
            ) : loadingList && clients.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Загрузка…</p>
            ) : clients.length === 0 ? (
              <p className="rounded-md border border-border bg-card px-3 py-5 text-center text-sm text-muted-foreground">
                Клиенты не найдены
              </p>
            ) : (
              <>
                {clients.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-primary/30 bg-accent"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <span
                        className={`block truncate text-sm font-medium ${
                          active ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {item.client_name}
                      </span>
                      {item.phone && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.phone}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Проектов: {item.projects_count}
                        {item.last_project_at ? ` · последний ${formatDate(item.last_project_at)}` : ""}
                      </span>
                    </button>
                  );
                })}
                {clients.length >= LIST_LIMIT && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Показаны первые {LIST_LIMIT} — уточните поиск
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Детали: на lg+ справа, ниже lg — только когда клиент выбран */}
        <main className={`${hasSelection ? "block" : "hidden lg:block"} min-w-0 flex-1`}>
          {!hasSelection ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center shadow-card">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Выберите клиента</p>
              <p className="text-xs text-muted-foreground">
                Слева список клиентов — откройте любого, чтобы увидеть проекты и контакты
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              >
                <ArrowLeft size={15} />К списку
              </button>

              {loadingDetail ? (
                <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                  Загрузка…
                </p>
              ) : detailError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive-muted p-5">
                  <p className="text-sm font-medium text-destructive">
                    {detailError.status === 404
                      ? "Клиент не найден"
                      : detailError.status === 403
                        ? "Нет доступа"
                        : "Не удалось загрузить клиента"}
                  </p>
                  <p className="mt-1 text-xs text-destructive/80">{detailError.message}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="mt-3 flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ArrowLeft size={13} />К списку
                  </button>
                </div>
              ) : detail ? (
                <>
                  {/* Шапка */}
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words text-lg font-semibold tracking-tight text-foreground">
                        {detail.client_name}
                      </h2>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2">
                          <Phone size={13} className="flex-shrink-0" />
                          <span className="break-all">{detail.phone || "—"}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Mail size={13} className="flex-shrink-0" />
                          <span className="break-all">{detail.contact_email || "—"}</span>
                        </p>
                        <p className="text-xs">Добавлен: {formatDate(detail.created_at)}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditClientOpen(true)}
                        className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Pencil size={13} />
                        Редактировать
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <StatCard
                      label="Проектов"
                      value={String(detail.projects_count)}
                      icon={FolderOpen}
                    />
                    <StatCard
                      label="Сумма продаж"
                      value={fmt(toNumber(detail.total_sale))}
                      icon={DollarSign}
                      iconColor="text-success"
                      iconBg="bg-success-muted"
                    />
                  </div>

                  {/* Проекты */}
                  <section className="rounded-lg border border-border bg-card p-5 shadow-card">
                    <SectionHeader title={`Проекты (${detail.projects.length})`} />
                    {detail.projects.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Проектов с этим клиентом пока нет
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full min-w-[640px] border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                              <th className="px-4 py-2.5 text-left font-medium">ПРОЕКТ</th>
                              <th className="px-4 py-2.5 text-left font-medium">СТАТУС</th>
                              <th className="px-4 py-2.5 text-left font-medium">PM</th>
                              <th className="px-4 py-2.5 text-left font-medium">ДЕДЛАЙН</th>
                              <th className="px-4 py-2.5 text-left font-medium">СОЗДАН</th>
                              <th className="px-4 py-2.5 text-right font-medium">СУММА</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.projects.map((project) => (
                              <tr
                                key={project.id}
                                className="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                              >
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => onOpenProject(project.id)}
                                    className="text-left text-sm font-medium text-primary hover:underline"
                                  >
                                    {project.name || `Проект №${project.id}`}
                                  </button>
                                  {(project.is_express || project.is_warehouse_request) && (
                                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      {project.is_warehouse_request ? "Заявка на склад" : "Экспресс"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {project.status ? (
                                    <Chip status={project.status.status_name} />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {project.pm_name || "—"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {formatDate(project.deadline)}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {formatDate(project.created_at)}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-right text-foreground">
                                  {fmt(toNumber(project.sale_total))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* Контакты */}
                  <section className="rounded-lg border border-border bg-card p-5 shadow-card">
                    <SectionHeader
                      title={`Контакты (${detail.contacts.length})`}
                      action={
                        canEdit ? (
                          <button
                            type="button"
                            onClick={() => setContactModal(null)}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            <Plus size={13} />
                            Добавить контакт
                          </button>
                        ) : undefined
                      }
                    />
                    {detail.contacts.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Контактов пока нет
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {detail.contacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="min-w-0 rounded-md border border-border bg-background/60 p-3.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-medium text-foreground">
                                  {contact.full_name}
                                </p>
                                {contact.position && (
                                  <p className="text-xs text-muted-foreground">{contact.position}</p>
                                )}
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                {contact.is_primary && (
                                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    Основной
                                  </span>
                                )}
                                {canEdit && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setContactModal(contact)}
                                      aria-label="Редактировать контакт"
                                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteError(null);
                                        setDeleteTarget(contact);
                                      }}
                                      aria-label="Удалить контакт"
                                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-muted hover:text-destructive"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                              {contact.phone && (
                                <p className="flex items-center gap-1.5">
                                  <Phone size={11} className="flex-shrink-0" />
                                  <span className="break-all">{contact.phone}</span>
                                </p>
                              )}
                              {contact.email && (
                                <p className="flex items-center gap-1.5">
                                  <Mail size={11} className="flex-shrink-0" />
                                  <span className="break-all">{contact.email}</span>
                                </p>
                              )}
                              {contact.note && (
                                <p className="break-words pt-1 text-foreground/80">{contact.note}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          )}
        </main>
      </div>

      {editClientOpen && detail && (
        <EditClientModal
          client={detail}
          onSaved={handleClientSaved}
          onCancel={() => setEditClientOpen(false)}
        />
      )}

      {contactModal !== undefined && selectedId !== null && (
        <ClientContactModal
          clientId={selectedId}
          contact={contactModal}
          onSaved={handleContactSaved}
          onCancel={() => setContactModal(undefined)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Удалить контакт?"
          description={`Контакт «${deleteTarget.full_name}» будет удалён без возможности восстановления.`}
          confirmLabel="Удалить"
          tone="danger"
          loading={deleting}
          error={deleteError}
          onConfirm={handleDeleteContact}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      )}
    </PageWrap>
  );
}
