"use client";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
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
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="hover:bg-muted relative rounded-full p-2"
        aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        data-testid="notification-bell"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="bg-destructive absolute top-0.5 right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
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
          <div className="flex-1 overflow-y-auto">
            {error && <p className="text-destructive p-4 text-sm">Не удалось загрузить уведомления.</p>}
            {data && data.items.length === 0 && <p className="text-muted-foreground p-6 text-center text-sm">Уведомлений пока нет</p>}
            <ul>
              {data?.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "border-border hover:bg-muted flex w-full gap-3 border-b px-4 py-3 text-left",
                      !n.readAt && "bg-accent/60",
                    )}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="text-muted-foreground block text-xs">{label("NotificationType", n.type)}</span>
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="text-muted-foreground block text-sm">{n.body}</span>}
                      <span className="text-muted-foreground mt-0.5 block text-xs">{formatRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
