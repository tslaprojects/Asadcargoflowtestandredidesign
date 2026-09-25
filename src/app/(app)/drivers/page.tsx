import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { toPlain } from "@/lib/serialize";
import { AddDriverButton, EditDriverButton, InviteDriverButton, type DriverRow } from "@/features/fleet/driver-components";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listDrivers } from "@/server/services/fleet.service";

export const metadata: Metadata = { title: "Водители" };

export default async function DriversPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("DRIVER_VIEW");
  const params = await searchParams;
  const data = toPlain(await listDrivers(actor, { q: sp(params, "q"), page: pageNum(params), pageSize: 20 }));
  const canManage = actor.permissions.has("DRIVER_MANAGE");
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Водители" description={`Всего: ${data.total}`} actions={canManage && <AddDriverButton />} />
      <FilterBar fields={[{ type: "search", name: "q", placeholder: "ФИО или телефон" }]} />
      <DataTable<Row>
        rows={data.items}
        rowKey={(d) => d.id}
        caption="Водители"
        empty={
          <EmptyState
            title="Водители ещё не добавлены"
            description="Добавьте водителей и пригласите их в приложение, чтобы назначать на рейсы."
          />
        }
        columns={[
          { key: "name", header: "Имя", primary: true, cell: (d) => <span className="font-medium">{d.fullName}</span> },
          {
            key: "phone",
            header: "Телефон",
            cell: (d) => (
              <a href={`tel:${d.phone}`} className="text-primary hover:underline">
                {d.phone}
              </a>
            ),
          },
          { key: "status", header: "Статус", cell: (d) => <StatusBadge kind="DriverStatus" value={d.status} /> },
          { key: "cat", header: "Категория", cell: (d) => d.licenseCategory },
          { key: "exp", header: "Удостоверение до", cell: (d) => formatDate(d.licenseExpiry), hideOnMobile: true },
          {
            key: "trips",
            header: "Активные рейсы",
            cell: (d) =>
              d.orders.length === 0 ? (
                <span className="text-muted-foreground">нет</span>
              ) : (
                d.orders.map((o) => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="text-primary mr-2 hover:underline">
                    {o.publicNumber}
                  </Link>
                ))
              ),
          },
          {
            key: "app",
            header: "Приложение",
            cell: (d) =>
              d.userId ? (
                <Badge tone="success">подключён</Badge>
              ) : d.pendingInvite ? (
                <Badge tone="warning">приглашён</Badge>
              ) : (
                <Badge tone="neutral">нет доступа</Badge>
              ),
          },
          ...(canManage
            ? [
                {
                  key: "actions",
                  header: "Действия",
                  className: "text-right",
                  cell: (d: Row) => (
                    <div className="flex justify-end gap-1">
                      {!d.userId && <InviteDriverButton driverId={d.id} name={d.fullName} />}
                      <EditDriverButton driver={d as unknown as DriverRow} />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/drivers" searchParams={params} />
    </>
  );
}
