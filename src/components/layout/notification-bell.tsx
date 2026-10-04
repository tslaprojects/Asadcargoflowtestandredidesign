"use client";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/client/api";
import { formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { eventPriority } from "@/lib/notification-priority";
import { cn } from "@/lib/utils";

const PRIORITY_DOT = { critical: "bg-danger", action: "bg-warning", info: "bg-primary" } as const;

type N = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
type ListResponse = { items: N[]; unread: number; total: number };

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setData(await api<ListResponse>("/api/notifications?pageSize=15"));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  React.useEffect(() => {
    // Первая загрузка и опрос раз в 30 секунд (только для видимой вкладки)
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const openItem = async (n: N) => {
    if (!n.readAt) await api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
    setOpen(false);
    void load();
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
    void load();
  };

  const unread = data?.unread ?? 0;
  // Объявление для скринридера только о новых уведомлениях (не при первой загрузке), без перехвата фокуса.
  const prevUnread = React.useRef<number | null>(null);
  const [announce, setAnnounce] = React.useState("");
  React.useEffect(() => {
    if (data === null) return;
    const prev = prevUnread.current;
    prevUnread.current = unread;
    if (prev !== null && unread > prev) {
      const t = setTimeout(() => setAnnounce(`Новое уведомление. Непрочитанных: ${unread}`), 0);
      return () => clearTimeout(t);
    }
  }, [data, unread]);
  const rank = { critical: 0, action: 1, info: 2 } as const;
  const fresh = (data?.items.filter((n) => !n.readAt) ?? []).sort(
    (a, b) => rank[eventPriority(a.type, a.title, a.body)] - rank[eventPriority(b.type, b.title, b.body)],
  );
  const seen = data?.items.filter((n) => n.readAt) ?? [];

  const renderItem = (n: N, i: number) => {
    const priority = eventPriority(n.type, n.title, n.body);
    return (
      <li key={n.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
        <button
          type="button"
          onClick={() => openItem(n)}
          className="bg-card hover:bg-surface-secondary active:bg-muted flex w-full gap-2.5 rounded-xl px-3.5 py-3 text-left transition-colors duration-(--duration-micro)"
        >
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : PRIORITY_DOT[priority])} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="text-footnote text-muted-foreground flex items-baseline justify-between gap-2">
              <span className="truncate">
                {priority === "critical" && <span className="text-danger font-semibold">Критично · </span>}
                {label("NotificationType", n.type)}
              </span>
              <span className="shrink-0">{formatRelative(n.createdAt)}</span>
            </span>
            <span className={cn("mt-0.5 block", !n.readAt && "font-semibold")}>{n.title}</span>
            {n.body && <span className="text-subheadline text-muted-foreground mt-0.5 block">{n.body}</span>}
          </span>
        </button>
      </li>
    );
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="text-foreground hover:bg-fill-quaternary relative grid size-10 place-items-center rounded-full transition-colors duration-(--duration-micro) lg:size-8"
        aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        data-testid="notification-bell"
      >
        <Bell className="size-5 lg:size-[1.125rem]" aria-hidden />
        {unread > 0 && (
          <span
            key={unread}
            className="bg-destructive num animate-check-pop absolute top-0.5 right-0 min-w-4 rounded-full px-1 text-center text-[0.625rem] leading-4 font-semibold text-white lg:-top-0.5 lg:-right-1"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="bg-background sm:max-w-sm">
          <SheetHeader className="pb-2">
            <SheetTitle>События</SheetTitle>
            <SheetDescription>{unread ? `Непрочитанных: ${unread}` : "Все уведомления прочитаны"}</SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-between gap-2 px-4 py-1.5">
            <Button variant="ghost" size="sm" className="text-link -ml-2.5" onClick={readAll} disabled={!unread}>
              <CheckCheck /> Отметить все прочитанными
            </Button>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-link text-subheadline hover:underline">
              Центр событий
            </Link>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
            {error && (
              <div role="alert" className="text-subheadline text-danger flex items-center justify-between gap-3 px-1">
                Не удалось загрузить уведомления — проверьте соединение.
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  Повторить
                </Button>
              </div>
            )}
            {!data && !error && (
              <div className="space-y-2" role="status" aria-label="Загрузка уведомлений">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-card space-y-2 rounded-xl px-3.5 py-3">
                    <Skeleton className="h-2.5 w-1/3" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
            )}
            {data && data.items.length === 0 && (
              <div className="text-subheadline text-muted-foreground flex flex-col items-center gap-2 px-6 py-12 text-center">
                <BellOff className="text-tertiary-foreground size-9 [stroke-width:1.5]" aria-hidden />
                Уведомлений пока нет. Здесь появятся ставки, изменения статусов и сообщения по перевозкам.
              </div>
            )}
            {fresh.length > 0 && (
              <section>
                <p className="text-section px-1 pb-1.5">Новые</p>
                <ul className="space-y-2">{fresh.map(renderItem)}</ul>
              </section>
            )}
            {seen.length > 0 && (
              <section>
                {fresh.length > 0 && <p className="text-section px-1 pb-1.5">Прочитанные</p>}
                <ul className="space-y-2">{seen.map((n, i) => renderItem(n, i + fresh.length))}</ul>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
