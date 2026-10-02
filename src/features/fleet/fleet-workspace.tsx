"use client";
import { ArrowRight, Fuel, Satellite, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { countryFlag } from "@/lib/geo/countries";
import { formatDate, formatRelative, formatVolume, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HealthBadge, HealthDot } from "@/features/operations/health";
import { JourneyTimeline } from "@/features/operations/journey-timeline";
import { MapWorkspace, type MapObject } from "@/features/tracking/map-workspace";
import type { LiveObject } from "@/server/services/operations.service";
import { VehicleRowActions, type VehicleRow } from "./vehicle-components";

export type FleetVehicle = VehicleRow & {
  bodyLabel: string;
  currentOrder: { id: string; publicNumber: string; currentStatus: string } | null;
  trip: LiveObject | null;
};

const desktopQuery = "(min-width: 1024px)";
function useDesktop() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(desktopQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-overline">{label}</dt>
      <dd className="mt-0.5 truncate text-sm leading-5">{children}</dd>
    </div>
  );
}

/**
 * Автопарк как операционный экран: карта машин в рейсе, список с текущим маршрутом, водителем и сроком,
 * панель машины с характеристиками, рейсом и действиями (редактирование, назначение, снятие, удаление).
 */
export function FleetWorkspace({
  vehicles,
  counts,
  controls,
  footer,
  headerActions,
  canManage,
  canFuel,
  assignableOrders,
  now,
  initialSelected,
  total,
}: {
  vehicles: FleetVehicle[];
  counts: React.ReactNode;
  controls: React.ReactNode;
  footer: React.ReactNode;
  headerActions?: React.ReactNode;
  canManage: boolean;
  canFuel: boolean;
  assignableOrders: { id: string; publicNumber: string; route: string; weightKg: number }[];
  now: string;
  initialSelected?: string | null;
  total: number;
}) {
  const desktop = useDesktop();
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelected && vehicles.some((v) => v.id === initialSelected) ? initialSelected : null,
  );
  const select = React.useCallback((id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("selected", id);
    else url.searchParams.delete("selected");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const ref = new Date(now);

  const mapObjects: MapObject[] = React.useMemo(
    () =>
      vehicles
        .filter((v) => v.trip?.position)
        .map((v) => ({
          id: v.id,
          label: `${v.plateNumber}: ${v.trip!.origin} → ${v.trip!.destination}, ${v.trip!.statusLabel}`,
          health: v.trip!.health,
          position: v.trip!.position,
          route: v.trip!.routeLine ?? v.trip!.stops.filter((s) => s.point).map((s) => [s.point!.lng, s.point!.lat] as [number, number]),
        })),
    [vehicles],
  );

  React.useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  return (
    <div className="relative h-full overflow-hidden" data-testid="fleet-workspace">
      <MapWorkspace
        objects={mapObjects}
        selectedId={selectedId}
        onSelect={select}
        className="absolute inset-x-0 top-0 h-[34%] lg:h-full"
        padding={desktop ? { left: 392, right: selected ? 408 : 56, top: 56, bottom: 56 } : { left: 24, right: 24, top: 24, bottom: 24 }}
        emptyLabel="Нет машин в рейсе с координатами"
      />

      <aside
        className="bg-card border-border absolute inset-x-0 top-[34%] bottom-0 z-[3] flex flex-col border-t lg:top-3 lg:right-auto lg:bottom-3 lg:left-3 lg:w-[23rem] lg:rounded-lg lg:border lg:shadow-md"
        aria-label="Автопарк"
      >
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-h1 leading-7">Автопарк</h1>
              <p className="text-muted-foreground text-xs">Машин: {total}</p>
            </div>
            {headerActions}
          </div>
          <div className="-mx-1 mt-2">{counts}</div>
        </div>
        {controls}
        <div className="border-border min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
          {vehicles.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              Машин не найдено. {canManage ? "Добавьте машину, чтобы назначать её на перевозки." : ""}
            </p>
          ) : (
            <ul className="divide-border divide-y" data-testid="fleet-list">
              {vehicles.map((v) => {
                const isSel = v.id === selectedId;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => select(isSel ? null : v.id)}
                      aria-pressed={isSel}
                      className={cn(
                        "relative block w-full px-4 py-2.5 text-left transition-colors duration-150",
                        isSel ? "bg-accent" : "hover:bg-surface-secondary",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "bg-primary absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full",
                          isSel ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex items-center gap-2">
                        {v.trip ? (
                          <HealthDot health={v.trip.health} live={isSel} />
                        ) : (
                          <span className="bg-border-strong size-2 rounded-full" aria-hidden />
                        )}
                        <span className="id-code text-sm font-semibold">
                          {countryFlag(v.country)} {v.plateNumber}
                        </span>
                        <span className="ml-auto">
                          <StatusBadge kind="VehicleStatus" value={v.status} hideIcon />
                        </span>
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                        {v.make} {v.model} · {v.bodyLabel} · {formatWeight(v.capacityKg)}
                      </span>
                      {v.trip ? (
                        <span className="mt-1 block truncate text-sm leading-5">
                          {v.trip.origin} → {v.trip.destination}
                          <span className="text-muted-foreground">
                            {" "}
                            · {v.trip.statusLabel}
                            {v.trip.driver && <> · {v.trip.driver.fullName}</>}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground mt-1 block text-sm leading-5">
                          {v.status === "AVAILABLE" ? "Свободна — можно назначить на рейс" : "Без рейса"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {footer}
        </div>
      </aside>

      {selected && (
        <aside
          key={selected.id}
          className={cn(
            "bg-card border-border absolute z-[4] flex flex-col overflow-hidden border shadow-lg",
            desktop
              ? "animate-panel-in top-3 right-3 bottom-3 w-[24rem] rounded-lg"
              : "animate-sheet-in-bottom inset-x-0 bottom-0 max-h-[82%] rounded-t-2xl",
          )}
          aria-labelledby={`veh-${selected.id}`}
          data-testid="vehicle-panel"
        >
          <header className="border-border flex items-start gap-2 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="VehicleStatus" value={selected.status} />
                {selected.trip && <HealthBadge health={selected.trip.health} />}
              </div>
              <h2 id={`veh-${selected.id}`} className="text-h2 id-code mt-1">
                {countryFlag(selected.country)} {selected.plateNumber}
              </h2>
              <p className="text-muted-foreground text-xs">
                {selected.make} {selected.model}
                {selected.year ? `, ${selected.year}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => select(null)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-9 place-items-center rounded-md"
              aria-label="Закрыть панель"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
              <Spec label="Кузов">{selected.bodyLabel}</Spec>
              <Spec label="Грузоподъёмность">{formatWeight(selected.capacityKg)}</Spec>
              <Spec label="Объём">{formatVolume(selected.volumeM3)}</Spec>
              <Spec label="GPS">
                <span className="inline-flex items-center gap-1">
                  <Satellite className={cn("size-3.5", selected.gpsEnabled ? "text-success" : "text-muted-foreground")} aria-hidden />
                  {selected.gpsEnabled ? "подключён" : "нет"}
                </span>
              </Spec>
            </dl>
            <div className="border-border border-t px-4 py-3">
              <h3 className="text-overline mb-2">Текущий рейс</h3>
              {selected.trip ? (
                <div className="space-y-3">
                  <div>
                    <p className="id-code text-muted-foreground text-xs">{selected.trip.publicNumber}</p>
                    <p className="text-sm font-semibold">
                      {selected.trip.origin} → {selected.trip.destination}
                    </p>
                    <p className="text-meta">
                      {selected.trip.statusLabel}
                      {selected.trip.driver && <> · {selected.trip.driver.fullName}</>} · доставка до{" "}
                      <span className={cn(selected.trip.health === "delayed" && "text-delayed font-medium")}>
                        {formatDate(selected.trip.deliveryDate)}
                      </span>
                      {selected.trip.position?.at && <> · отметка {formatRelative(selected.trip.position.at, ref)}</>}
                    </p>
                  </div>
                  <JourneyTimeline status={selected.trip.status} stops={selected.trip.stops} compact />
                  <Button asChild size="sm" className="w-full">
                    <Link href={`/orders/${selected.trip.id}`}>
                      Открыть перевозку <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {selected.status === "AVAILABLE"
                    ? "Машина свободна. Назначьте её на перевозку с подписанным договором или найдите груз на бирже."
                    : selected.status === "MAINTENANCE"
                      ? "Машина на обслуживании — назначение недоступно."
                      : "Рейса нет."}
                </p>
              )}
            </div>
          </div>
          <footer className="border-border flex flex-wrap items-center gap-1.5 border-t p-3">
            {canFuel && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/fuel/vehicles/${selected.id}`}>
                  <Fuel /> Топливо
                </Link>
              </Button>
            )}
            {canManage && (
              <div className="ml-auto">
                <VehicleRowActions vehicle={selected} currentOrder={selected.currentOrder} assignableOrders={assignableOrders} />
              </div>
            )}
          </footer>
        </aside>
      )}
    </div>
  );
}
