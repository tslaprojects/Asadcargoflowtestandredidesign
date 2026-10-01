import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/common/filter-bar";
import { Pagination } from "@/components/common/pagination";
import { prisma } from "@/lib/db/prisma";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { FleetWorkspace, type FleetVehicle } from "@/features/fleet/fleet-workspace";
import { AddVehicleButton } from "@/features/fleet/vehicle-components";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listVehicles } from "@/server/services/fleet.service";
import { fleetAssignments } from "@/server/services/operations.service";

export const metadata: Metadata = { title: "Автопарк" };

const STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "INACTIVE"] as const;
const STATUS_SHORT: Record<(typeof STATUSES)[number], string> = {
  AVAILABLE: "Свободны",
  ASSIGNED: "В рейсе",
  MAINTENANCE: "Сервис",
  INACTIVE: "Неактивны",
};

/** Автопарк — Fleet Operations: карта машин в рейсе + список + панель машины (действия сохранены). */
export default async function VehiclesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("VEHICLE_VIEW");
  const params = await searchParams;
  const status = sp(params, "status");
  const companyId = actor.active!.companyId;
  const validStatus = status && (STATUSES as readonly string[]).includes(status) ? status : undefined;
  const [data, trips, grouped, awaitingRaw] = await Promise.all([
    listVehicles(actor, { q: sp(params, "q"), status: validStatus, page: pageNum(params), pageSize: 30 }).then(toPlain),
    fleetAssignments(actor),
    prisma.vehicle.groupBy({ by: ["status"], where: { companyId, deletedAt: null }, _count: { _all: true } }),
    prisma.transportOrder.findMany({
      where: { carrierCompanyId: companyId, currentStatus: "CONTRACT_SIGNED" },
      select: { id: true, publicNumber: true, load: { select: { originCity: true, destinationCity: true, weightKg: true } } },
    }),
  ]);
  const awaiting = toPlain(awaitingRaw).map((o) => ({
    id: o.id,
    publicNumber: o.publicNumber,
    route: `${o.load.originCity} → ${o.load.destinationCity}`,
    weightKg: o.load.weightKg,
  }));
  const tripByVehicle = new Map(trips.filter((t) => t.vehicle).map((t) => [t.vehicle!.id, t]));
  const vehicles: FleetVehicle[] = data.items.map((v) => ({
    id: v.id,
    plateNumber: v.plateNumber,
    country: v.country,
    make: v.make,
    model: v.model,
    year: v.year,
    vehicleType: v.vehicleType,
    bodyType: v.bodyType,
    capacityKg: v.capacityKg,
    volumeM3: v.volumeM3,
    vin: v.vin,
    gpsEnabled: v.gpsEnabled,
    status: v.status,
    bodyLabel: label("BodyType", v.bodyType),
    currentOrder: v.orders[0] ?? null,
    trip: tripByVehicle.get(v.id) ?? null,
  }));
  const count = (s?: string) => grouped.filter((g) => !s || g.status === s).reduce((a, g) => a + g._count._all, 0);
  const href = (s?: string) => {
    const q = new URLSearchParams();
    const text = sp(params, "q");
    if (text) q.set("q", text);
    if (s) q.set("status", s);
    const qs = q.toString();
    return qs ? `/vehicles?${qs}` : "/vehicles";
  };
  const canManage = actor.permissions.has("VEHICLE_MANAGE");

  const counts = (
    <nav aria-label="Фильтр по статусу" className="grid grid-cols-5 gap-0.5" data-testid="fleet-counts">
      {[undefined, ...STATUSES].map((s) => {
        const active = (validStatus ?? undefined) === s;
        return (
          <Link
            key={s ?? "all"}
            href={href(s)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex min-w-0 flex-col rounded-md px-1.5 py-1 transition-colors duration-150",
              active ? "bg-accent ring-primary/30 ring-1" : "hover:bg-muted",
            )}
          >
            <span className="text-metric">{count(s)}</span>
            <span className="text-muted-foreground truncate text-[0.6875rem] leading-4 font-medium">{s ? STATUS_SHORT[s] : "Все"}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <FleetWorkspace
      key="fleet"
      vehicles={vehicles}
      total={data.total}
      counts={counts}
      controls={
        <FilterBar key="filters" bare inlineFields={0} fields={[{ type: "search", name: "q", placeholder: "Госномер, марка, модель…" }]} />
      }
      footer={
        <div key="pagination" className="px-3 pb-3">
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/vehicles" searchParams={params} />
        </div>
      }
      headerActions={canManage ? <AddVehicleButton key="add" /> : undefined}
      canManage={canManage}
      canFuel={actor.permissions.has("FUEL_VIEW")}
      assignableOrders={awaiting}
      now={new Date().toISOString()}
      initialSelected={sp(params, "selected") ?? null}
    />
  );
}
