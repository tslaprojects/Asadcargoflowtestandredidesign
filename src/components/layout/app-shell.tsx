"use client";
import { Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ClientActor } from "@/lib/auth/actor";
import { cn } from "@/lib/utils";
import { CompanySwitcher } from "./company-switcher";
import { GlobalSearch } from "./global-search";
import { navItems, SIDEBAR_COOKIE, type NavItem, type NavKind } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/admin" || href === "/driver") return pathname === href;
  if (href === "/loads") return pathname === "/loads" || (pathname.startsWith("/loads/") && !pathname.startsWith("/loads/new"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo({ className, dark, compact }: { className?: string; dark?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="bg-primary grid size-8 shrink-0 place-items-center rounded-lg text-white">
        <Truck className="size-4.5" aria-hidden />
      </span>
      {!compact && <span className={cn("text-lg", dark ? "text-white" : "text-foreground")}>CargoFlow</span>}
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

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "bg-primary num animate-pop-in grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.6875rem] font-semibold text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavList({ kind, onNavigate, unread, collapsed }: { kind: NavKind; onNavigate?: () => void; unread: number; collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-4">
      {groupBySection(navItems(kind)).map((group, gi) => (
        <div key={group.section ?? gi} className="flex flex-col gap-0.5">
          {group.section &&
            (collapsed ? (
              <span className="bg-sidebar-border mx-3 mb-1 h-px" aria-hidden />
            ) : (
              <span className="text-sidebar-muted px-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
                {group.section}
              </span>
            ))}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const count = item.badge === "messages" ? unread : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? (count ? `${item.label}, непрочитанных: ${count}` : item.label) : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                  collapsed && "justify-center px-0",
                  active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "bg-sidebar-accent absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full transition-opacity duration-150",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className={cn("size-[1.125rem] shrink-0", !active && "opacity-80 group-hover:opacity-100")} aria-hidden />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {count > 0 &&
                  (collapsed ? (
                    <span className="bg-primary ring-sidebar absolute top-1.5 right-2 size-2 rounded-full ring-2" aria-hidden />
                  ) : (
                    <UnreadBadge count={count} />
                  ))}
                {!collapsed && count > 0 && <span className="sr-only">непрочитанных: {count}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

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
  /** Начальное состояние из cookie — без сдвига раскладки при загрузке. */
  sidebarCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(sidebarCollapsed);
  const pathname = usePathname();
  const primary = navItems(kind)
    .filter((i) => i.primary)
    .slice(0, 4);
  const adminLink = actor.isAdmin && kind !== "admin";
  const home = kind === "driver" ? "/driver" : kind === "admin" ? "/admin" : "/dashboard";

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div
      className={cn(
        "min-h-dvh transition-[padding] duration-(--duration-standard) ease-out motion-reduce:transition-none",
        collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64",
      )}
    >
      <a
        href="#main"
        className="focus:bg-card sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:px-3 focus:py-2 focus:shadow-md"
      >
        Перейти к содержимому
      </a>
      {/* Сайдбар (desktop) */}
      <aside
        className={cn(
          "bg-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col py-4 transition-[width] duration-(--duration-standard) ease-out motion-reduce:transition-none lg:flex",
          collapsed ? "w-[4.5rem] px-2.5" : "w-64 px-3",
        )}
        data-collapsed={collapsed || undefined}
      >
        <Link
          href={home}
          className={cn("mb-6 flex min-h-10 items-center rounded-lg", collapsed ? "justify-center" : "px-2")}
          aria-label="CargoFlow — главная"
        >
          <Logo dark compact={collapsed} />
        </Link>
        <div className="-mx-1 flex-1 [scrollbar-width:thin] overflow-y-auto px-1">
          <NavList kind={kind} unread={unreadMessages} collapsed={collapsed} />
          {adminLink && (
            <div className="border-sidebar-border mt-5 border-t pt-4">
              <Link
                href="/admin"
                title={collapsed ? "Администрирование" : undefined}
                className={cn(
                  "text-sidebar-foreground hover:bg-sidebar-active/60 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 hover:text-white",
                  collapsed && "justify-center px-0",
                )}
              >
                <ShieldCheck className="size-[1.125rem] shrink-0" aria-hidden />
                {!collapsed && "Администрирование"}
              </Link>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-expanded={!collapsed}
          className={cn(
            "text-sidebar-muted hover:bg-sidebar-active/60 mt-2 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[1.125rem]" aria-hidden />
          ) : (
            <PanelLeftClose className="size-[1.125rem]" aria-hidden />
          )}
          {!collapsed && "Свернуть меню"}
        </button>
      </aside>

      {/* Шапка */}
      <header className="border-border bg-card/95 supports-[backdrop-filter]:bg-card/85 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
        <button
          type="button"
          className="hover:bg-muted grid size-10 place-items-center rounded-md transition-colors duration-150 lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Открыть меню"
        >
          <Menu className="size-5" />
        </button>
        <Link href={home} className="rounded-lg lg:hidden" aria-label="CargoFlow — на главную">
          <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>
        {kind !== "driver" && <GlobalSearch className="ml-1 hidden max-w-md flex-1 md:block" />}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {actor.memberships.length > 0 && <CompanySwitcher actor={actor} />}
          <NotificationBell />
          <UserMenu actor={actor} kind={kind} />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="max-w-page mx-auto w-full px-3 pt-4 pb-28 outline-none sm:px-6 sm:pt-6 lg:pb-10">
        {children}
      </main>

      {/* Нижнее меню (mobile): ≤ 4 раздела + «Меню», подписи всегда видны */}
      <nav
        aria-label="Быстрая навигация"
        className="border-border bg-card/95 supports-[backdrop-filter]:bg-card/90 fixed inset-x-0 bottom-0 z-20 grid border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0,1fr))` }}
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
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground active:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "bg-primary absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-b-full transition-opacity duration-150",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="relative">
                <Icon className="size-5" aria-hidden />
                {count > 0 && (
                  <span className="bg-primary ring-card num absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-semibold text-white ring-2">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
              {count > 0 && <span className="sr-only">непрочитанных: {count}</span>}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="text-muted-foreground active:text-foreground flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium"
          aria-haspopup="dialog"
        >
          <Menu className="size-5" aria-hidden />
          Меню
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="bg-sidebar border-sidebar-border p-3 text-white">
          <SheetHeader className="border-sidebar-border px-2">
            <SheetTitle>
              <Logo dark />
            </SheetTitle>
          </SheetHeader>
          {kind !== "driver" && <GlobalSearch className="my-3" onNavigate={() => setMenuOpen(false)} />}
          <div className="mt-2 overflow-y-auto">
            <NavList kind={kind} onNavigate={() => setMenuOpen(false)} unread={unreadMessages} />
            {adminLink && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="text-sidebar-foreground border-sidebar-border mt-4 flex min-h-10 items-center gap-3 border-t px-3 pt-4 text-sm"
              >
                <ShieldCheck className="size-[1.125rem]" aria-hidden /> Администрирование
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
