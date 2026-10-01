import { AlertOctagon, BellRing, ChevronRight, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { formatDateTime, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { eventObject, eventPriority, type EventPriority } from "@/lib/notification-priority";
import { toPlain } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, NotificationLink } from "@/features/profile/notification-actions";
import { pageActor, pageNum, type SearchParams } from "@/server/page-context";
import { listNotifications } from "@/server/services/notification.service";

export const metadata: Metadata = { title: "События" };

const PRIORITY: Record<EventPriority, { label: string; icon: typeof Info; tile: string; dot: string }> = {
  critical: { label: "Критично", icon: AlertOctagon, tile: "bg-danger-bg text-danger", dot: "bg-danger" },
  action: { label: "Нужно действие", icon: BellRing, tile: "bg-warning-bg text-warning", dot: "bg-warning" },
  info: { label: "Для сведения", icon: Info, tile: "bg-info-bg text-info", dot: "bg-info" },
};

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

function EventRow({ n, now }: { n: Item & { priority: EventPriority }; now: Date }) {
  const p = PRIORITY[n.priority];
  const Icon = p.icon;
  const obj = eventObject(n.link);
  return (
    <li className={cn(!n.readAt && "bg-accent/40")}>
      <NotificationLink id={n.id} href={n.link} unread={!n.readAt}>
        <span className="flex gap-3">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", p.tile)} aria-hidden>
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-meta flex flex-wrap items-center gap-x-2">
              <span className="sr-only">{p.label}.</span>
              {obj && <span className="text-foreground font-medium">{obj.kind}</span>}
              <span>{label("NotificationType", n.type)}</span>
              <time dateTime={new Date(n.createdAt).toISOString()} title={formatDateTime(n.createdAt)}>
                {formatRelative(n.createdAt, now)}
              </time>
              {!n.readAt && (
                <span className="text-primary inline-flex items-center gap-1 font-medium">
                  <span className="bg-primary size-1.5 rounded-full" aria-hidden /> новое
                </span>
              )}
            </span>
            <span className={cn("block text-sm leading-5", !n.readAt ? "font-semibold" : "font-medium")}>{n.title}</span>
            {n.body && <span className="text-muted-foreground block text-sm leading-5">{n.body}</span>}
          </span>
          {obj && (
            <span className="text-primary hidden shrink-0 items-center gap-0.5 self-center text-sm font-medium sm:inline-flex">
              {obj.action} <ChevronRight className="size-4" aria-hidden />
            </span>
          )}
        </span>
      </NotificationLink>
    </li>
  );
}

/**
 * Центр событий: сначала то, что требует внимания (критичные и требующие действия непрочитанные),
 * затем лента. У каждого события — приоритет, время, связанный объект и переход к нему.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const data = toPlain(await listNotifications(actor, { page: pageNum(params), pageSize: 40 }));
  const now = new Date();
  const items = (data.items as unknown as Item[]).map((n) => ({ ...n, priority: eventPriority(n.type, n.title, n.body) }));
  const rank = { critical: 0, action: 1, info: 2 } as const;
  const attention = items.filter((n) => !n.readAt && n.priority !== "info").sort((a, b) => rank[a.priority] - rank[b.priority]);
  const feed = items.filter((n) => !attention.includes(n));
  const count = (p: EventPriority) => items.filter((n) => n.priority === p && !n.readAt).length;

  return (
    <>
      <PageHeader title="События" description={`Непрочитанных: ${data.unread}`} actions={data.unread > 0 && <MarkAllReadButton />} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Непрочитанные по приоритету">
        {(Object.keys(PRIORITY) as EventPriority[]).map((p) => (
          <span key={p} className="border-border bg-card inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <span className={cn("size-2 rounded-full", PRIORITY[p].dot)} aria-hidden />
            {PRIORITY[p].label}
            <span className="num font-semibold">{count(p)}</span>
          </span>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Событий пока нет"
          description="Здесь появятся предложения перевозчиков, смены статусов, документы, задержки и споры — с переходом к объекту."
        />
      ) : (
        <div className="space-y-5">
          {attention.length > 0 && (
            <section aria-labelledby="attention-h" data-testid="events-attention">
              <h2 id="attention-h" className="text-overline mb-2">
                Требует внимания · {attention.length}
              </h2>
              <ul className="divide-border border-border bg-card divide-y overflow-hidden rounded-lg border">
                {attention.map((n) => (
                  <EventRow key={n.id} n={n} now={now} />
                ))}
              </ul>
            </section>
          )}
          {feed.length > 0 && (
            <section aria-labelledby="feed-h">
              <h2 id="feed-h" className="text-overline mb-2">
                Лента событий
              </h2>
              <ul className="divide-border border-border bg-card divide-y overflow-hidden rounded-lg border">
                {feed.map((n) => (
                  <EventRow key={n.id} n={n} now={now} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/notifications" searchParams={params} />
      <p className="text-muted-foreground mt-4 text-xs">
        События дублируются на email (в локальной среде — в лог сервера). Настройки —{" "}
        <Link className="text-primary" href="/profile">
          в профиле
        </Link>
        .
      </p>
    </>
  );
}
