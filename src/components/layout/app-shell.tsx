"use client";
import { Menu, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ClientActor } from "@/lib/auth/actor";
import { cn } from "@/lib/utils";
import { CompanySwitcher } from "./company-switcher";
import { GlobalSearch } from "./global-search";
import { navItems, type NavKind } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/admin" || href === "/driver") return pathname === href;
  if (href === "/loads") return pathname === "/loads" || (pathname.startsWith("/loads/") && !pathname.startsWith("/loads/new"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="bg-primary grid size-8 place-items-center rounded-lg text-white">
        <Truck className="size-4.5" aria-hidden />
      </span>
      <span className={cn("text-lg", dark ? "text-white" : "text-foreground")}>CargoFlow</span>
    </span>
  );
}

function NavList({ kind, onNavigate, unread }: { kind: NavKind; onNavigate?: () => void; unread: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-0.5">
      {navItems(kind).map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white",
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.badge === "messages" && unread > 0 && (
              <span className="bg-primary rounded-full px-1.5 text-xs text-white" aria-label={`Непрочитанных: ${unread}`}>
                {unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  actor,
  kind,
  unreadMessages,
  children,
}: {
  actor: ClientActor;
  kind: NavKind;
  unreadMessages: number;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const primary = navItems(kind)
    .filter((i) => i.primary)
    .slice(0, 4);
  const adminLink = actor.isAdmin && kind !== "admin";

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="focus:bg-card sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:px-3 focus:py-2"
      >
        Перейти к содержимому
      </a>
      {/* Sidebar (desktop) */}
      <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col px-3 py-4 lg:flex">
        <Link href={kind === "driver" ? "/driver" : kind === "admin" ? "/admin" : "/dashboard"} className="mb-6 px-2">
          <Logo dark />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavList kind={kind} unread={unreadMessages} />
          {adminLink && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <Link href="/admin" className="text-sidebar-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:text-white">
                Администрирование →
              </Link>
            </div>
          )}
        </div>
        <p className="px-3 text-xs text-slate-500">MVP · ru-RU · Asia/Almaty</p>
      </aside>

      {/* Header */}
      <header className="border-border bg-card/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
        <button
          type="button"
          className="hover:bg-muted rounded-md p-2 lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Открыть меню"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/" className="lg:hidden" aria-label="CargoFlow — на главную">
          <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>
        {kind !== "driver" && <GlobalSearch className="ml-1 hidden max-w-md flex-1 md:block" />}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {actor.memberships.length > 0 && <CompanySwitcher actor={actor} />}
          <NotificationBell />
          <UserMenu actor={actor} kind={kind} />
        </div>
      </header>

      <main id="main" className={cn("mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6", "pb-24 lg:pb-8")}>
        {children}
      </main>

      {/* Bottom nav (mobile) */}
      <nav
        aria-label="Быстрая навигация"
        className="border-border bg-card fixed inset-x-0 bottom-0 z-20 grid border-t lg:hidden"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0,1fr))` }}
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-primary" : "text-muted-foreground")}
            >
              <Icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="text-muted-foreground flex flex-col items-center gap-0.5 py-2 text-[11px]"
        >
          <Menu className="size-5" aria-hidden />
          Меню
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="bg-sidebar p-3 text-white">
          <SheetHeader className="border-white/10 px-2">
            <SheetTitle>
              <Logo dark />
            </SheetTitle>
          </SheetHeader>
          {kind !== "driver" && <GlobalSearch className="my-3" onNavigate={() => setMenuOpen(false)} />}
          <div className="mt-2 overflow-y-auto">
            <NavList kind={kind} onNavigate={() => setMenuOpen(false)} unread={unreadMessages} />
            {adminLink && (
              <Link href="/admin" onClick={() => setMenuOpen(false)} className="text-sidebar-foreground mt-4 block px-3 py-2 text-sm">
                Администрирование →
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
