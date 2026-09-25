import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, NotificationLink } from "@/features/profile/notification-actions";
import { pageActor, pageNum, type SearchParams } from "@/server/page-context";
import { listNotifications } from "@/server/services/notification.service";

export const metadata: Metadata = { title: "Уведомления" };

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const data = toPlain(await listNotifications(actor, { page: pageNum(params), pageSize: 30 }));
  return (
    <>
      <PageHeader title="Уведомления" description={`Непрочитанных: ${data.unread}`} actions={data.unread > 0 && <MarkAllReadButton />} />
      {data.items.length === 0 ? (
        <EmptyState title="Уведомлений пока нет" />
      ) : (
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {data.items.map((n) => (
            <li key={n.id} className={cn(!n.readAt && "bg-accent/50")}>
              <NotificationLink id={n.id} href={n.link} unread={!n.readAt}>
                <span className="text-muted-foreground block text-xs">
                  {label("NotificationType", n.type)} · {formatDateTime(n.createdAt)}
                </span>
                <span className="block font-medium">{n.title}</span>
                {n.body && <span className="text-muted-foreground block text-sm">{n.body}</span>}
              </NotificationLink>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/notifications" searchParams={params} />
      <p className="text-muted-foreground mt-4 text-xs">
        Уведомления также дублируются на email (в локальной среде — в лог сервера).{" "}
        <Link className="text-primary" href="/profile">
          Профиль
        </Link>
      </p>
    </>
  );
}
