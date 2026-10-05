import type { ReactNode } from "react";
import { Building2, ClipboardList, History, LogOut, Package } from "lucide-react";
import { KerneuFullLogo, KerneuLogo } from "../../app/components/common/KerneuLogo";
import { BRAND_GRADIENT, FOCUS_RING } from "./partnerUi";

export type PartnerSection = "stock" | "request" | "mine";

// Ключ sessionStorage с последним разделом кабинета партнёра.
export const PARTNER_SECTION_STORAGE_KEY = "kerneu:partner-section";

export const NAV_ITEMS: { id: PartnerSection; label: string; icon: typeof Package }[] = [
  { id: "stock", label: "Склад", icon: Package },
  { id: "request", label: "Заявка", icon: ClipboardList },
  { id: "mine", label: "Мои заявки", icon: History },
];

export const SECTION_HASH: Record<PartnerSection, string> = {
  stock: "#/sklad",
  request: "#/zayavka",
  mine: "#/moi-zayavki",
};

export function sectionFromHash(hash: string): PartnerSection | null {
  return NAV_ITEMS.find((item) => SECTION_HASH[item.id] === hash)?.id ?? null;
}

export type NavBadges = Record<PartnerSection, number>;

function Badge({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold leading-none ${
        active ? "bg-white/25 text-white" : "bg-primary text-primary-foreground"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

type NavProps = {
  section: PartnerSection;
  onSelect: (section: PartnerSection) => void;
  badges: NavBadges;
};

// Левое меню (от lg). Изолировано от Sidebar основного ERP, но в том же стиле.
export function PartnerSidebar({
  section,
  onSelect,
  badges,
  companyName,
  bell,
  onLogout,
}: NavProps & {
  companyName?: string | null;
  bell: ReactNode;
  onLogout?: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[288px] flex-col border-r border-border bg-card/90 backdrop-blur-md lg:flex">
      <div className="px-5 pb-4 pt-6">
        <KerneuFullLogo markSize={34} />
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-background/70 px-3.5 py-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${BRAND_GRADIENT}`}>
            <Building2 size={17} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="line-clamp-2 break-words text-sm font-semibold text-foreground" title={companyName ?? undefined}>
              {companyName ?? "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Партнёр</p>
          </div>
        </div>
      </div>

      <nav aria-label="Разделы кабинета" className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${FOCUS_RING} ${
                active
                  ? `${BRAND_GRADIENT} text-white shadow-sm`
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Icon size={17} />
              <span className="flex-1 text-left">{label}</span>
              <Badge count={badges[id]} active={active} />
            </button>
          );
        })}
      </nav>

      <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-4">
        <span title="Уведомления" className="flex">{bell}</span>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            aria-label="Выйти"
            title="Выйти"
            className={`flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${FOCUS_RING}`}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}

// Компактная шапка до lg.
export function PartnerMobileHeader({
  companyName,
  bell,
  onLogout,
}: {
  companyName?: string | null;
  bell: ReactNode;
  onLogout?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <KerneuLogo size={30} />
          {companyName && <span className="truncate text-sm font-semibold text-foreground">{companyName}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {bell}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Выйти"
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${FOCUS_RING}`}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// Нижняя панель до lg с теми же разделами и бейджами.
export function PartnerBottomNav({ section, onSelect, badges }: NavProps) {
  return (
    <nav
      aria-label="Разделы кабинета"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 ${FOCUS_RING} focus-visible:ring-inset ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200 ${
                    active ? `${BRAND_GRADIENT} text-white shadow-sm` : ""
                  }`}
                >
                  <Icon size={18} />
                </span>
                {label}
                {badges[id] > 0 && (
                  <span className="absolute right-[calc(50%-30px)] top-1">
                    <Badge count={badges[id]} active={false} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Партнёрский хэш (#/sklad, #/zayavka, #/moi-zayavki) в адресной строке. ERP его не использует,
// поэтому для внутренних ролей и после выхода хэш приводим к пустому.
export function clearPartnerHash(): void {
  if (sectionFromHash(window.location.hash) !== null) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

// Полный сброс навигации партнёра (выход / смена пользователя). Черновик заявки не трогаем:
// его ключ привязан к user_id.
export function clearPartnerNavState(): void {
  try {
    sessionStorage.removeItem(PARTNER_SECTION_STORAGE_KEY);
  } catch {
    /* не критично */
  }
  clearPartnerHash();
}
