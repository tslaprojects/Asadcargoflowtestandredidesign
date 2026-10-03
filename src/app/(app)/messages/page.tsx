import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatRelative } from "@/lib/format";
import { toPlain } from "@/lib/serialize";
import { pageActor, pageNum, type SearchParams } from "@/server/page-context";
import { listThreads } from "@/server/services/chat.service";

export const metadata: Metadata = { title: "Сообщения" };

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const data = toPlain(await listThreads(actor, { page: pageNum(params), pageSize: 20 }));
  return (
    <>
      <PageHeader title="Сообщения" description="Чаты ваших перевозок. Каждый чат привязан к конкретной сделке." />
      {data.items.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Сообщений пока нет" description="Чат появляется после выбора перевозчика." />
      ) : (
        <ul className="bg-card divide-y-(length:--hairline) rounded-lg">
          {data.items.map((t) => (
            <li key={t.id}>
              <Link href={`/orders/${t.order.id}?tab=chat`} className="hover:bg-muted/50 flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.order.publicNumber}</span>
                    <span className="text-muted-foreground text-body">
                      {t.order.load.originCity} → {t.order.load.destinationCity}
                    </span>
                    <StatusBadge kind="OrderStatus" value={t.order.currentStatus} />
                  </div>
                  <p className="text-muted-foreground text-footnote">
                    {t.order.shipper.legalName} · {t.order.carrier.legalName}
                  </p>
                  {t.lastMessage ? (
                    <p className="text-body mt-1 truncate">
                      <span className="text-muted-foreground">{t.lastMessage.sender}: </span>
                      {t.lastMessage.text || "📎 файл"}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-body mt-1">Сообщений пока нет</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {t.lastMessage && <span className="text-muted-foreground text-footnote">{formatRelative(t.lastMessage.at)}</span>}
                  {t.unread > 0 && (
                    <span
                      className="bg-primary text-footnote rounded-full px-2 font-semibold text-white"
                      aria-label={`Непрочитанных: ${t.unread}`}
                    >
                      {t.unread}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/messages" searchParams={params} />
    </>
  );
}
