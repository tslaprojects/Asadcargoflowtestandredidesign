import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db/prisma";
import { countryFlag } from "@/lib/geo/countries";
import { formatVolume, formatWeight } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { AddVehicleButton, VehicleRowActions, type VehicleRow } from "@/features/fleet/vehicle-components";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listVehicles } from "@/server/services/fleet.service";
import Link from "next/link";

export const metadata: Metadata = { title: "Автомобили" };

export default async function VehiclesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("VEHICLE_VIEW");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await listVehicles(actor, {
      q: sp(params, "q"),
      status: status && ["AVAILABLE", "ASSIGNED", "INACTIVE", "MAINTENANCE"].includes(status) ? status : undefined,
      page: pageNum(params),
      pageSize: 20,
    }),
  );
  const awaiting = toPlain(
    await prisma.transportOrder.findMany({
      where: { carrierCompanyId: actor.active!.companyId, currentStatus: "CONTRACT_SIGNED" },
      select: { id: true, publicNumber: true, load: { select: { originCity: true, destinationCity: true, weightKg: true } } },
    }),
  ).map((o) => ({
    id: o.id,
    publicNumber: o.publicNumber,
    route: `${o.load.originCity} → ${o.load.destinationCity}`,
    weightKg: o.load.weightKg,
  }));
  const canManage = actor.permissions.has("VEHICLE_MANAGE");
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader
        title="Мои автомобили"
        description={`Всего: ${data.total}${awaiting.length ? ` · ожидают назначения: ${awaiting.length}` : ""}`}
        actions={canManage && <AddVehicleButton />}
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Госномер, марка, модель…" },
          { type: "select", name: "status", label: "Статус", options: enumOptions("VehicleStatus") },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(v) => v.id}
        caption="Автомобили"
        empty={<EmptyState title="Автомобили ещё не добавлены" description="Добавьте автомобили, чтобы назначать их на перевозки." />}
        columns={[
          {
            key: "plate",
            header: "Номер",
            primary: true,
            cell: (v) => (
              <span className="font-mono font-semibold">
                {countryFlag(v.country)} {v.plateNumber}
              </span>
            ),
          },
          { key: "make", header: "Марка", cell: (v) => `${v.make} ${v.model}${v.year ? ` (${v.year})` : ""}` },
          { key: "body", header: "Кузов", cell: (v) => label("BodyType", v.bodyType) },
          { key: "cap", header: "Грузоподъёмность", cell: (v) => formatWeight(v.capacityKg) },
          { key: "vol", header: "Объём", cell: (v) => formatVolume(v.volumeM3), hideOnMobile: true },
          {
            key: "gps",
            header: "GPS",
            cell: (v) => (v.gpsEnabled ? <Badge tone="success">есть</Badge> : <Badge tone="neutral">нет</Badge>),
          },
          { key: "status", header: "Статус", cell: (v) => <StatusBadge kind="VehicleStatus" value={v.status} /> },
          {
            key: "order",
            header: "Рейс",
            cell: (v) =>
              v.orders[0] ? (
                <Link className="text-primary hover:underline" href={`/orders/${v.orders[0].id}`}>
                  {v.orders[0].publicNumber}
                </Link>
              ) : (
                "—"
              ),
          },
          ...(canManage
            ? [
                {
                  key: "actions",
                  header: "Действия",
                  className: "text-right",
                  cell: (v: Row) => (
                    <VehicleRowActions
                      vehicle={v as unknown as VehicleRow}
                      currentOrder={v.orders[0] ?? null}
                      assignableOrders={awaiting}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/vehicles" searchParams={params} />
    </>
  );
}
