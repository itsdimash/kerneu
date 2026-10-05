import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { NotificationBell } from "../../app/components/common/NotificationBell";
import { NotificationsProvider, useNotifications } from "../../app/notifications/NotificationsContext";
import { PartnerStockPage } from "./PartnerStockPage";
import { PartnerRequestPage } from "./PartnerRequestPage";
import { PartnerRequestsList } from "./PartnerRequestsList";
import { PartnerStats } from "./PartnerStats";
import {
  PartnerBottomNav,
  PartnerMobileHeader,
  PARTNER_SECTION_STORAGE_KEY,
  PartnerSidebar,
  SECTION_HASH,
  sectionFromHash,
  type NavBadges,
  type PartnerSection,
} from "./PartnerNav";
import { usePartnerDraft } from "./usePartnerDraft";
import { usePartnerRequests } from "./usePartnerRequests";
import { CARD, PageHeader } from "./partnerUi";

export type PartnerUser = {
  id?: number;
  name: string;
  client_id?: number | null;
  client_name?: string | null;
};

// Активный раздел переживает F5: основной источник — хэш URL (#/sklad, #/zayavka,
// #/moi-zayavki), запасной — sessionStorage с отдельным ключом. Ключ ERP
// kerneu:app-state не трогаем.
const SECTION_STORAGE_KEY = PARTNER_SECTION_STORAGE_KEY;

function readStoredSection(): PartnerSection | null {
  try {
    const raw = sessionStorage.getItem(SECTION_STORAGE_KEY);
    return raw === "stock" || raw === "request" || raw === "mine" ? raw : null;
  } catch {
    return null;
  }
}

function readInitialSection(): PartnerSection {
  return sectionFromHash(window.location.hash) ?? readStoredSection() ?? "stock";
}

function clearStoredSection() {
  try {
    sessionStorage.removeItem(SECTION_STORAGE_KEY);
  } catch {
    /* sessionStorage может быть недоступен — не критично */
  }
}

function NoCompanyNotice() {
  return (
    <div className={`${CARD} mx-auto mt-10 flex max-w-md flex-col items-center gap-3 px-6 py-10 text-center`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-muted text-warning">
        <ShieldAlert size={24} />
      </span>
      <h2 className="text-base font-semibold text-foreground">Аккаунт не привязан к компании</h2>
      <p className="text-sm text-muted-foreground">
        Чтобы отправлять заявки на склад, ваш аккаунт должен быть привязан к компании-партнёру.
        Обратитесь к менеджеру Kerneu Group.
      </p>
    </div>
  );
}

function PartnerShell({ user, onLogout }: { user: PartnerUser | null; onLogout?: () => void }) {
  const [section, setSection] = useState<PartnerSection>(readInitialSection);
  const [focusRequestId, setFocusRequestId] = useState<number | null>(null);
  const [noCompanyFromApi, setNoCompanyFromApi] = useState(false);

  const { lastArrived } = useNotifications();

  const handleNoCompany = useCallback(() => setNoCompanyFromApi(true), []);
  const handleFocusHandled = useCallback(() => setFocusRequestId(null), []);

  const noCompany = noCompanyFromApi || (user !== null && user.client_id == null);

  // Заявки грузятся один раз на уровне оболочки: те же данные питают плитки
  // статистики, бейдж меню и раздел «Мои заявки» — без лишних запросов.
  const requests = usePartnerRequests(handleNoCompany);
  const { reload } = requests;

  const navigate = useCallback(
    (next: PartnerSection) => {
      setSection(next);
      try {
        sessionStorage.setItem(SECTION_STORAGE_KEY, next);
      } catch {
        /* не критично */
      }
      if (window.location.hash !== SECTION_HASH[next]) window.location.hash = SECTION_HASH[next];
      window.scrollTo({ top: 0 });
      if (next === "mine") void reload(true);
    },
    [reload],
  );

  // Черновик живёт здесь, выше разделов: переходы между ними его не сбрасывают.
  const draft = usePartnerDraft({
    userId: user?.id ?? null,
    onCreated: () => navigate("mine"),
    onNoCompany: handleNoCompany,
  });

  // Кнопки «Назад/Вперёд» и ручная правка хэша.
  useEffect(() => {
    const onHashChange = () => {
      const next = sectionFromHash(window.location.hash);
      if (next) setSection(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Приводим адресную строку в соответствие с восстановленным разделом (без новой записи в истории).
  useEffect(() => {
    if (window.location.hash !== SECTION_HASH[section]) {
      window.history.replaceState(null, "", SECTION_HASH[section]);
    }
    // Только при первом рендере: дальнейшие смены идут через navigate/hashchange.
  }, []);

  // Входящее уведомление о заявке — перечитываем список.
  useEffect(() => {
    if (lastArrived && lastArrived.category.startsWith("partner_request")) {
      void reload(true);
    }
  }, [lastArrived, reload]);

  // Клик по уведомлению: партнёр всегда попадает в «Мои заявки» с деталями этой заявки.
  const handleOpenPartnerRequest = useCallback(
    (partnerRequestId: number | null) => {
      navigate("mine");
      setFocusRequestId(partnerRequestId);
    },
    [navigate],
  );

  const { discardStored } = draft;
  const handleLogout = onLogout
    ? () => {
        clearStoredSection();
        // Выход: сохранённый черновик удаляем, чтобы следующий вход его не увидел.
        discardStored();
        if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
        onLogout();
      }
    : undefined;

  const badges: NavBadges = useMemo(() => {
    const active = requests.items.filter((r) => r.status === "pending_director" || r.status === "approved").length;
    return { stock: 0, request: draft.lines.length, mine: active };
  }, [requests.items, draft.lines.length]);

  // Колокольчик в сайдбаре стоит внизу слева — список открываем вверх и вправо,
  // чтобы он не обрезался краем окна; в мобильной шапке — вниз, по правому краю.
  const renderBell = (menuSide: "top" | "bottom", menuAlign: "start" | "end") => (
    <NotificationBell
      role="partner"
      onNavigate={() => undefined}
      onOpenPartnerRequest={handleOpenPartnerRequest}
      menuSide={menuSide}
      menuAlign={menuAlign}
    />
  );

  const show = (id: PartnerSection) => (section === id ? "" : "hidden");

  return (
    <div className="relative min-h-screen bg-background">
      {/* Мягкая подложка в фирменных цветах */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(60%_90%_at_15%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent),radial-gradient(50%_80%_at_90%_0%,color-mix(in_srgb,#7C3AED_11%,transparent),transparent)]"
      />

      <PartnerSidebar
        section={section}
        onSelect={navigate}
        badges={badges}
        companyName={user?.client_name}
        bell={renderBell("top", "start")}
        onLogout={handleLogout}
      />
      <PartnerMobileHeader companyName={user?.client_name} bell={renderBell("bottom", "end")} onLogout={handleLogout} />

      <main className="relative lg:pl-[288px]">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {noCompany ? (
            <NoCompanyNotice />
          ) : (
            <>
              {/* Разделы не размонтируются: поиск, страница и переключатель каталога,
                  фильтры «Моих заявок» сохраняются при переключении. */}
              <section aria-label="Склад" className={show("stock")}>
                <PartnerStockPage draft={draft} onGoRequest={() => navigate("request")} onNoCompany={handleNoCompany} />
              </section>

              <section aria-label="Заявка" className={show("request")}>
                <PartnerRequestPage draft={draft} onGoCatalog={() => navigate("stock")} />
              </section>

              <section aria-label="Мои заявки" className={show("mine")}>
                <PageHeader title="Мои заявки" subtitle="История и статус ваших заявок на склад" />
                <PartnerStats requests={requests} />
                <PartnerRequestsList
                  data={requests}
                  focusRequestId={focusRequestId}
                  onFocusHandled={handleFocusHandled}
                  onNoCompany={handleNoCompany}
                  onGoCatalog={() => navigate("stock")}
                />
              </section>
            </>
          )}
        </div>
      </main>

      <PartnerBottomNav section={section} onSelect={navigate} badges={badges} />
    </div>
  );
}

// Кабинет партнёра: отдельная оболочка без Sidebar/TopBar ERP. Провайдер
// уведомлений здесь свой (в AppShell он есть только для внутренних ролей).
export function PartnerApp({ user, onLogout }: { user: PartnerUser | null; onLogout?: () => void }) {
  return (
    <NotificationsProvider>
      <PartnerShell user={user} onLogout={onLogout} />
    </NotificationsProvider>
  );
}

export default PartnerApp;
