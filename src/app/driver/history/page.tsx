import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { countryFlag } from "@/lib/geo/countries";
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
    <div className="pt-1">
      <h1 className="text-title1 mb-4 font-semibold">История рейсов</h1>
      {data.items.length === 0 ? (
        <EmptyState title="Рейсов пока не было" />
      ) : (
        <ul className="space-y-2">
          {data.items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="bg-card active:bg-muted block rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">#{o.publicNumber}</span>
                  <StatusBadge kind="OrderStatus" value={o.currentStatus} />
                </div>
                <p className="text-body mt-1">
                  {countryFlag(o.load.originCountry)} {o.load.originCity} → {countryFlag(o.load.destinationCountry)}{" "}
                  {o.load.destinationCity}
                </p>
                <p className="text-muted-foreground text-footnote">
                  Загрузка {formatDate(o.loadingDate)}
                  {o.vehicle && ` · ${o.vehicle.plateNumber}`}
                  {o.closedAt && ` · закрыт ${formatDate(o.closedAt)}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/driver/history" searchParams={params} />
    </div>
  );
}
