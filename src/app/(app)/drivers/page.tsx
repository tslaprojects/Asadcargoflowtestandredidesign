import { AlertTriangle, Phone, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatRelative } from "@/lib/format";
import { toPlain } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { AddDriverButton, EditDriverButton, InviteDriverButton, type DriverRow } from "@/features/fleet/driver-components";
import { HealthBadge } from "@/features/operations/health";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listDrivers } from "@/server/services/fleet.service";
import { fleetAssignments } from "@/server/services/operations.service";

export const metadata: Metadata = { title: "Водители" };

const DAY = 86_400_000;

/**
 * Водители — операционный ростер: кто свободен, кто в рейсе (машина, груз, маршрут, срок),
 * последнее событие, доступ к приложению и истекающие документы. Управление (добавить, изменить, пригласить) сохранено.
 */
export default async function DriversPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("DRIVER_VIEW");
  const params = await searchParams;
  const [data, trips] = await Promise.all([
    listDrivers(actor, { q: sp(params, "q"), page: pageNum(params), pageSize: 30 }).then(toPlain),
    fleetAssignments(actor),
  ]);
  const tripByDriver = new Map(trips.filter((t) => t.driver).map((t) => [t.driver!.id, t]));
  const canManage = actor.permissions.has("DRIVER_MANAGE");
  const now = new Date();
  // Доставленный рейс (ждёт подтверждения получения) водителя уже не занимает
  const onTrip = (id: string) => {
    const t = tripByDriver.get(id);
    return !!t && t.health !== "done";
  };
  const busy = data.items.filter((d) => onTrip(d.id)).length;
  const free = data.items.filter((d) => !onTrip(d.id) && d.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        title="Водители"
        description={`Всего: ${data.total} · в рейсе: ${busy} · свободны: ${free}`}
        actions={canManage && <AddDriverButton />}
      />
      <FilterBar fields={[{ type: "search", name: "q", placeholder: "ФИО или телефон" }]} />
      {data.items.length === 0 ? (
        <EmptyState
          title="Водители ещё не добавлены"
          description="Добавьте водителей и пригласите их в приложение — тогда их можно назначать на рейсы, а они будут отмечать этапы и позицию."
        />
      ) : (
        <section className="bg-card overflow-hidden rounded-lg" aria-label="Ростер водителей" data-testid="driver-roster">
          <div className="text-section bg-surface-secondary hairline-b hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-4 px-4 py-2 lg:grid">
            <span>Водитель</span>
            <span>Текущий рейс</span>
            <span>Последнее событие</span>
            <span className="text-right">Действия</span>
          </div>
          <ul className="divide-y-(length:--hairline)">
            {data.items.map((d) => {
              const trip = tripByDriver.get(d.id);
              const expiry = d.licenseExpiry ? new Date(d.licenseExpiry).getTime() : null;
              const expiring = expiry !== null && expiry - now.getTime() < 30 * DAY;
              const initials = d.fullName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase();
              return (
                <li
                  key={d.id}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "text-footnote grid size-9 shrink-0 place-items-center rounded-md font-semibold",
                        trip
                          ? "bg-info-bg text-info"
                          : d.status === "ACTIVE"
                            ? "bg-success-bg text-success"
                            : "bg-muted text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-body truncate font-semibold">{d.fullName}</p>
                      <p className="text-footnote text-muted-foreground tabular flex flex-wrap items-center gap-x-2">
                        <a href={`tel:${d.phone.replace(/\s/g, "")}`} className="text-link inline-flex items-center gap-1 hover:underline">
                          <Phone className="size-3" aria-hidden /> {d.phone}
                        </a>
                        <span>кат. {d.licenseCategory}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {onTrip(d.id) ? (
                          <Badge tone="info">В рейсе</Badge>
                        ) : d.status === "ACTIVE" ? (
                          <Badge tone="success">Свободен</Badge>
                        ) : (
                          <StatusBadge kind="DriverStatus" value={d.status} />
                        )}
                        {d.userId ? (
                          <Badge tone="outline">
                            <Smartphone aria-hidden /> в приложении
                          </Badge>
                        ) : d.pendingInvite ? (
                          <Badge tone="warning">приглашён</Badge>
                        ) : (
                          <Badge tone="neutral">нет доступа</Badge>
                        )}
                        {expiring && (
                          <Badge tone={expiry! < now.getTime() ? "danger" : "warning"}>
                            <AlertTriangle aria-hidden /> права до {formatDate(d.licenseExpiry)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-body min-w-0">
                    {trip ? (
                      <Link href={`/orders/${trip.id}`} className="group block rounded-md">
                        <span className="flex items-center gap-2">
                          <span className="id-code text-muted-foreground text-footnote">{trip.publicNumber}</span>
                          <HealthBadge health={trip.health} />
                        </span>
                        <span className="group-hover:text-link block truncate font-medium transition-colors">
                          {trip.origin} → {trip.destination}
                        </span>
                        <span className="text-footnote text-muted-foreground tabular block truncate">
                          {trip.statusLabel}
                          {trip.vehicle && <> · {trip.vehicle.plateNumber}</>} · до {formatDate(trip.deliveryDate)}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Нет активного рейса</span>
                    )}
                  </div>

                  <div className="text-footnote text-muted-foreground tabular min-w-0">
                    {trip ? (
                      <>
                        <span className="text-foreground block">{trip.statusLabel}</span>
                        {formatRelative(trip.statusChangedAt, now)}
                        {trip.position?.source === "tracking" && trip.position.at && (
                          <> · позиция {formatRelative(trip.position.at, now)}</>
                        )}
                      </>
                    ) : d.user?.lastLoginAt ? (
                      <>в приложении {formatRelative(d.user.lastLoginAt, now)}</>
                    ) : (
                      "—"
                    )}
                  </div>

                  {canManage ? (
                    <div className="flex justify-start gap-1 lg:justify-end">
                      {!d.userId && <InviteDriverButton driverId={d.id} name={d.fullName} />}
                      <EditDriverButton driver={d as unknown as DriverRow} />
                    </div>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/drivers" searchParams={params} />
    </>
  );
}
