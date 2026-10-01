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
import { cn } from "@/lib/utils";

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
  const fresh = data?.items.filter((n) => !n.readAt) ?? [];
  const seen = data?.items.filter((n) => n.readAt) ?? [];

  const renderItem = (n: N, i: number) => (
    <li key={n.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
      <button
        type="button"
        onClick={() => openItem(n)}
        className={cn(
          "border-border hover:bg-surface-secondary flex w-full gap-3 border-b px-4 py-3 text-left transition-colors duration-150",
          !n.readAt && "bg-accent/50",
        )}
      >
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{label("NotificationType", n.type)}</span>
            <span className="shrink-0">{formatRelative(n.createdAt)}</span>
          </span>
          <span className={cn("mt-0.5 block text-sm leading-5", !n.readAt && "font-medium")}>{n.title}</span>
          {n.body && <span className="text-muted-foreground mt-0.5 block text-[0.8125rem] leading-5">{n.body}</span>}
        </span>
      </button>
    </li>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="hover:bg-muted relative grid size-10 place-items-center rounded-full transition-colors duration-150"
        aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        data-testid="notification-bell"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            key={unread}
            className="bg-destructive ring-card num animate-check-pop absolute top-0.5 right-0.5 min-w-4 rounded-full px-1 text-center text-[0.625rem] leading-4 font-semibold text-white ring-2"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Уведомления</SheetTitle>
            <SheetDescription>{unread ? `Непрочитанных: ${unread}` : "Все уведомления прочитаны"}</SheetDescription>
          </SheetHeader>
          <div className="border-border flex items-center justify-between border-b px-4 py-2">
            <Button variant="ghost" size="sm" onClick={readAll} disabled={!unread}>
              <CheckCheck /> Отметить все прочитанными
            </Button>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-primary text-sm hover:underline">
              Все уведомления
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {error && (
              <div role="alert" className="text-danger flex items-center justify-between gap-3 p-4 text-sm">
                Не удалось загрузить уведомления — проверьте соединение.
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  Повторить
                </Button>
              </div>
            )}
            {!data && !error && (
              <div className="space-y-4 p-4" role="status" aria-label="Загрузка уведомлений">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="mt-1 size-2 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data && data.items.length === 0 && (
              <div className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
                <BellOff className="size-6" aria-hidden />
                Уведомлений пока нет. Здесь появятся ставки, изменения статусов и сообщения по перевозкам.
              </div>
            )}
            {fresh.length > 0 && (
              <>
                <p className="text-overline bg-surface-secondary border-border border-b px-4 py-1.5">Новые</p>
                <ul>{fresh.map(renderItem)}</ul>
              </>
            )}
            {seen.length > 0 && (
              <>
                {fresh.length > 0 && <p className="text-overline bg-surface-secondary border-border border-b px-4 py-1.5">Прочитанные</p>}
                <ul>{seen.map((n, i) => renderItem(n, i + fresh.length))}</ul>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
