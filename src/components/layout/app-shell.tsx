"use client";
import { Ellipsis, PanelLeft, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { InsetGroup, InsetList, ListRow } from "@/components/common/inset-group";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import type { ClientActor } from "@/lib/auth/actor";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DataModeBadge, DataModeSwitchDialog } from "@/features/auth/data-mode";
import { CommandBar, CommandTrigger } from "./command-bar";
import { CompanySwitcher } from "./company-switcher";
import { navItems, SIDEBAR_COOKIE, type NavItem, type NavKind } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/admin" || href === "/driver") return pathname === href;
  if (href === "/loads") return pathname === "/loads" || (pathname.startsWith("/loads/") && !pathname.startsWith("/loads/new"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Экраны в три колонки (сайдбар | список | детали) занимают всю площадь окна. */
const WORKSPACE_ROUTES = new Set(["/dashboard", "/orders", "/vehicles"]);

const ADMIN_ITEM: NavItem = { href: "/admin", label: t("nav.admin"), icon: ShieldCheck };

/** Знак CargoFlow: маршрут из точки А в точку Б на акцентной плитке со скруглением иконки приложения. */
export function Logo({ className, dark, compact }: { className?: string; dark?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="bg-primary grid size-7 shrink-0 place-items-center rounded-[28%]" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-[1.125rem]" fill="none">
          <path d="M6.5 17.5c0-4 3.5-4 5.5-5.5s5.5-1.5 5.5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6.5" cy="17.5" r="2.25" className="fill-primary" stroke="white" strokeWidth="1.75" />
          <circle cx="17.5" cy="6.5" r="2.5" fill="white" />
        </svg>
      </span>
      {!compact && <span className={cn("text-headline tracking-[-0.01em]", dark ? "text-white" : "text-foreground")}>CargoFlow</span>}
    </span>
  );
}

function groupBySection(items: NavItem[]) {
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

/** Строка сайдбара macOS: акцентный значок, обычный текст, выделение — серая плашка, счётчик — серым числом, как в Mail. */
function SidebarRow({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-body text-sidebar-foreground flex h-7 items-center gap-2 rounded-md px-2 transition-colors duration-(--duration-micro)",
        active ? "bg-sidebar-active" : "hover:bg-fill-quaternary",
      )}
    >
      <Icon className="text-sidebar-accent size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <span className="text-footnote text-sidebar-muted num">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> непрочитанных</span>
        </span>
      )}
    </Link>
  );
}

/**
 * Окно CargoFlow в духе macOS: полупрозрачный сайдбар со списком разделов, единый тулбар с поиском справа;
 * на телефоне — таб-бар iOS снизу и «Ещё» со всеми разделами. Экраны в три колонки занимают всю площадь.
 */
export function AppShell({
  actor,
  kind,
  unreadMessages,
  sidebarCollapsed = false,
  children,
}: {
  actor: ClientActor;
  kind: NavKind;
  unreadMessages: number;
  /** Скрыт ли сайдбар (cookie) — без сдвига раскладки при загрузке. */
  sidebarCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [hidden, setHidden] = React.useState(sidebarCollapsed);
  const [modeDialog, setModeDialog] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const pathname = usePathname();
  const items = navItems(kind);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const adminLink = actor.isAdmin && kind !== "admin";
  const home = kind === "driver" ? "/driver" : kind === "admin" ? "/admin" : "/dashboard";
  const workspace = WORKSPACE_ROUTES.has(pathname);
  const searchable = kind !== "driver" && kind !== "none";
  const demo = actor.dataMode === "demo";
  const moreActive = !primary.some((i) => isActive(pathname, i.href));
  // «Ещё» нужен, только если в нём есть что-то кроме разделов таб-бара
  const hasMore = items.length > primary.length || adminLink || actor.memberships.length > 1;

  React.useEffect(() => {
    if (!searchable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchable]);

  const toggleSidebar = () => {
    const next = !hidden;
    setHidden(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const sidebarToggle = (
    <Tooltip content={hidden ? t("nav.showSidebar") : t("nav.hideSidebar")} side="bottom">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={hidden ? t("nav.showSidebar") : t("nav.hideSidebar")}
        aria-expanded={!hidden}
        className="text-muted-foreground hover:bg-fill-quaternary hover:text-foreground grid size-7 place-items-center rounded-sm transition-colors duration-(--duration-micro)"
      >
        <PanelLeft className="size-[1.125rem]" aria-hidden />
      </button>
    </Tooltip>
  );

  return (
    <div
      className={cn(
        "min-h-dvh transition-[padding] duration-(--duration-complex) ease-out motion-reduce:transition-none",
        !hidden && "lg:pl-60",
      )}
      data-workspace={workspace || undefined}
    >
      <a
        href="#main"
        className="focus:bg-elevated focus:shadow-menu sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:px-3 focus:py-2"
      >
        {t("nav.skipToContent")}
      </a>

      {/* Сайдбар (широкий экран) */}
      <aside
        className={cn(
          "material-sidebar hairline-r border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 flex-col transition-transform duration-(--duration-complex) ease-out motion-reduce:transition-none lg:flex",
          hidden && "-translate-x-full",
        )}
        aria-label="Навигация CargoFlow"
        inert={hidden || undefined}
      >
        <div className="flex h-[3.25rem] shrink-0 items-center justify-between pr-2.5 pl-4">
          <Link href={home} className="rounded-sm" aria-label="CargoFlow — на главную">
            <Logo />
          </Link>
          {sidebarToggle}
        </div>
        <nav aria-label={t("nav.mainNavigation")} className="flex-1 scrollbar-none overflow-y-auto px-2.5 pb-3">
          {groupBySection(items).map((group, gi) => (
            <div key={group.section ?? gi} className="flex flex-col gap-px">
              {group.section && <span className="text-section px-2 pt-4 pb-1">{group.section}</span>}
              {group.items.map((item) => (
                <SidebarRow
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  count={item.badge === "messages" ? unreadMessages : 0}
                />
              ))}
            </div>
          ))}
          {adminLink && (
            <div className="flex flex-col pt-4">
              <SidebarRow item={ADMIN_ITEM} active={false} count={0} />
            </div>
          )}
        </nav>
        {actor.memberships.length > 0 && (
          <div className="hairline-t border-sidebar-border shrink-0 p-2.5">
            <CompanySwitcher actor={actor} />
          </div>
        )}
      </aside>

      {/* Тулбар; в демо-режиме — тонкая предупреждающая линия сверху */}
      <header
        className={cn(
          "material-bar hairline-b sticky top-0 z-20 pt-[env(safe-area-inset-top)]",
          demo && "shadow-[inset_0_2px_0_var(--warning)]",
        )}
      >
        <div className="flex h-11 items-center gap-1.5 px-3 sm:px-4 lg:h-[3.25rem]">
          <div className={cn("hidden items-center gap-2", hidden && "lg:flex")}>
            {sidebarToggle}
            <Link href={home} className="rounded-sm" aria-label="CargoFlow — на главную">
              <Logo />
            </Link>
          </div>
          <Link href={home} className="rounded-sm lg:hidden" aria-label="CargoFlow — на главную">
            <Logo compact />
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setModeDialog(true)}
              className="rounded-full transition-opacity duration-(--duration-micro) hover:opacity-75"
              aria-label={`Режим данных: ${demo ? "демо-база" : "реальная база"}. Сменить режим`}
            >
              <DataModeBadge mode={actor.dataMode} />
            </button>
            <NotificationBell />
            {searchable && (
              <>
                <CommandTrigger onOpen={() => setCommandOpen(true)} className="hidden w-56 md:flex" />
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  className="hover:bg-fill-quaternary grid size-10 place-items-center rounded-full md:hidden"
                  aria-label="Поиск и команды"
                >
                  <Search className="size-5" aria-hidden />
                </button>
              </>
            )}
            <UserMenu actor={actor} kind={kind} />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "outline-none",
          workspace
            ? "relative h-[calc(100dvh-2.75rem-3.125rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-hidden lg:h-[calc(100dvh-3.25rem)]"
            : "max-w-page mx-auto w-full px-4 pt-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-6 lg:pb-14",
        )}
      >
        {children}
      </main>

      {/* Таб-бар iOS (узкий экран): ≤ 4 раздела + «Ещё» */}
      <nav
        aria-label={t("nav.tabBar")}
        className="material-bar hairline-t fixed inset-x-0 bottom-0 z-20 grid pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${primary.length + (hasMore ? 1 : 0)}, minmax(0,1fr))` }}
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          const count = item.badge === "messages" ? unreadMessages : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[3.125rem] flex-col items-center justify-center gap-0.5 text-[0.625rem] leading-3 font-medium transition-colors duration-(--duration-micro)",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className="size-6" aria-hidden />
                {count > 0 && (
                  <span className="bg-destructive num absolute -top-1 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-semibold text-white">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
              {count > 0 && <span className="sr-only">непрочитанных: {count}</span>}
            </Link>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex h-[3.125rem] flex-col items-center justify-center gap-0.5 text-[0.625rem] leading-3 font-medium",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
            aria-haspopup="dialog"
          >
            <Ellipsis className="size-6" aria-hidden />
            {t("nav.more")}
          </button>
        )}
      </nav>

      <DataModeSwitchDialog current={actor.dataMode} open={modeDialog} onOpenChange={setModeDialog} />
      {searchable && <CommandBar kind={kind} open={commandOpen} onOpenChange={setCommandOpen} />}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="bg-background">
          <div className="px-4 pt-2 pb-1">
            <SheetTitle className="text-title2">{t("nav.more")}</SheetTitle>
          </div>
          <div
            className="space-y-5 overflow-y-auto overscroll-contain px-4 pt-2 pb-6"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) setMoreOpen(false);
            }}
          >
            {groupBySection(items).map((group, gi) => (
              <InsetGroup key={group.section ?? gi} header={group.section}>
                <InsetList>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const count = item.badge === "messages" ? unreadMessages : 0;
                    return (
                      <ListRow
                        key={item.href}
                        href={item.href}
                        leading={<Icon className="text-primary size-5" aria-hidden />}
                        title={<span className={cn(isActive(pathname, item.href) && "font-semibold")}>{item.label}</span>}
                        value={count > 0 ? <span className="num">{count}</span> : undefined}
                      />
                    );
                  })}
                </InsetList>
              </InsetGroup>
            ))}
            {adminLink && (
              <InsetGroup>
                <InsetList>
                  <ListRow href="/admin" leading={<ShieldCheck className="text-primary size-5" aria-hidden />} title={t("nav.admin")} />
                </InsetList>
              </InsetGroup>
            )}
            {actor.memberships.length > 0 && (
              <InsetGroup header={t("nav.company")}>
                <div className="p-1.5">
                  <CompanySwitcher actor={actor} />
                </div>
              </InsetGroup>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
