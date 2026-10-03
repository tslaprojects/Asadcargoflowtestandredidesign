import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/lib/format";
import { toPlain } from "@/lib/serialize";
import { pageActor, pageNum, type SearchParams } from "@/server/page-context";
import { listMyTrips } from "@/server/services/driver-trip.service";

export const metadata: Metadata = { title: "История рейсов" };

export default async function DriverHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const data = toPlain(await listMyTrips(actor, { page: pageNum(params), pageSize: 20 }));
  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-large-title">История рейсов</h1>
      {data.items.length === 0 ? (
        <EmptyState title="Рейсов пока не было" />
      ) : (
        <ul className="bg-card [&>li+li_[data-row-content]]:hairline-t overflow-hidden rounded-xl">
          {data.items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="active:bg-fill-tertiary hover:bg-fill-quaternary flex items-center gap-2 pl-4">
                <div data-row-content className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {o.load.originCity} → {o.load.destinationCity}
                    </p>
                    <p className="text-footnote text-muted-foreground num truncate">
                      <span className="id-code">#{o.publicNumber}</span> · загрузка {formatDate(o.loadingDate)}
                      {o.vehicle && ` · ${o.vehicle.plateNumber}`}
                      {o.closedAt && ` · закрыт ${formatDate(o.closedAt)}`}
                    </p>
                    <StatusBadge kind="OrderStatus" value={o.currentStatus} className="mt-1" />
                  </div>
                  <ChevronRight className="text-tertiary-foreground size-4 shrink-0" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/driver/history" searchParams={params} />
    </div>
  );
}
