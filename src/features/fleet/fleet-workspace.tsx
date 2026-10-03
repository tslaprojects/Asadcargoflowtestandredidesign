"use client";
import { Fuel, Satellite, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { InsetGroup, InsetList, ListRow } from "@/components/common/inset-group";
import { SplitView } from "@/components/common/split-view";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelative, formatVolume, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
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

/**
 * Автопарк в три колонки: список машин с текущим рейсом, справа — карта машин в рейсе и карточка
 * выбранной машины с характеристиками, рейсом и действиями (редактирование, назначение, снятие, удаление).
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

  const list = (
    <>
      <div className="space-y-3 px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-title1">Автопарк</h1>
            <p className="text-footnote text-muted-foreground mt-0.5">Машин: {total}</p>
          </div>
          {headerActions && <div className="shrink-0 pt-0.5">{headerActions}</div>}
        </div>
        {counts}
      </div>
      {controls}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {vehicles.length === 0 ? (
          <p className="text-subheadline text-muted-foreground px-4 py-10 text-center">
            Машин не найдено. {canManage ? "Добавьте машину, чтобы назначать её на перевозки." : ""}
          </p>
        ) : (
          <ul className="px-2 pb-2" data-testid="fleet-list">
            {vehicles.map((v, i) => {
              const isSel = v.id === selectedId;
              const prevSel = i > 0 && vehicles[i - 1].id === selectedId;
              const muted = isSel ? "opacity-85" : "text-muted-foreground";
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => select(isSel ? null : v.id)}
                    aria-pressed={isSel}
                    className={cn(
                      "block w-full rounded-md px-2.5 text-left transition-colors duration-(--duration-micro)",
                      isSel ? "bg-selection text-selection-foreground" : "hover:bg-fill-quaternary",
                    )}
                  >
                    <span className={cn("block py-2.5", i > 0 && !isSel && !prevSel && "hairline-t")}>
                      <span className="flex items-center gap-2">
                        {v.trip ? (
                          <HealthDot health={v.trip.health} live={isSel} className={cn(isSel && "ring-selection-foreground/80 ring-2")} />
                        ) : (
                          <span className={cn("size-2 rounded-full", isSel ? "bg-white/60" : "bg-border-strong")} aria-hidden />
                        )}
                        <span className="id-code font-semibold">{v.plateNumber}</span>
                        <span className={cn("text-caption font-medium tracking-wide", isSel ? "opacity-75" : "text-tertiary-foreground")}>
                          {v.country}
                        </span>
                        <span className={cn("ml-auto", isSel && "[&_*]:!text-selection-foreground")}>
                          <StatusBadge kind="VehicleStatus" value={v.status} hideIcon />
                        </span>
                      </span>
                      <span className={cn("text-footnote mt-0.5 block truncate pl-4", muted)}>
                        {v.make} {v.model} · {v.bodyLabel} · {formatWeight(v.capacityKg)}
                      </span>
                      {v.trip ? (
                        <span className="mt-0.5 block truncate pl-4">
                          {v.trip.origin} → {v.trip.destination}
                          <span className={muted}>
                            {" "}
                            · {v.trip.statusLabel}
                            {v.trip.driver && <> · {v.trip.driver.fullName}</>}
                          </span>
                        </span>
                      ) : (
                        <span className={cn("mt-0.5 block pl-4", muted)}>
                          {v.status === "AVAILABLE" ? "Свободна — можно назначить на рейс" : "Без рейса"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </div>
    </>
  );

  const detail = selected && (
    <section key={selected.id} className="flex h-full min-h-0 flex-col" aria-labelledby={`veh-${selected.id}`} data-testid="vehicle-panel">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="flex items-start gap-3 px-4 pt-4 pb-4 lg:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="VehicleStatus" value={selected.status} />
              {selected.trip && <HealthBadge health={selected.trip.health} />}
            </div>
            <h2 id={`veh-${selected.id}`} className="text-title2 id-code mt-1.5">
              {selected.plateNumber} <span className="text-subheadline text-tertiary-foreground font-medium">{selected.country}</span>
            </h2>
            <p className="text-subheadline text-muted-foreground">
              {selected.make} {selected.model}
              {selected.year ? `, ${selected.year}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => select(null)}
            className="bg-fill-tertiary text-muted-foreground hover:bg-fill-secondary hover:text-foreground hidden size-7 shrink-0 place-items-center rounded-full lg:grid"
            aria-label="Закрыть панель"
          >
            <X className="size-3.5 [stroke-width:2.5]" aria-hidden />
          </button>
        </header>
        <div className="grid gap-6 px-4 pb-6 lg:px-6 xl:grid-cols-2">
          <InsetGroup header={t("ui.specs")}>
            <InsetList>
              <ListRow title="Кузов" value={selected.bodyLabel} />
              <ListRow title="Грузоподъёмность" value={<span className="num">{formatWeight(selected.capacityKg)}</span>} />
              <ListRow title="Объём" value={<span className="num">{formatVolume(selected.volumeM3)}</span>} />
              <ListRow
                title="GPS"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Satellite className={cn("size-3.5", selected.gpsEnabled && "text-success")} aria-hidden />
                    {selected.gpsEnabled ? "подключён" : "нет"}
                  </span>
                }
              />
            </InsetList>
          </InsetGroup>
          <InsetGroup header={t("ui.currentTrip")}>
            <div className="px-4 py-3.5">
              {selected.trip ? (
                <div className="space-y-3">
                  <div>
                    <p className="id-code text-footnote text-muted-foreground">{selected.trip.publicNumber}</p>
                    <p className="font-semibold">
                      {selected.trip.origin} → {selected.trip.destination}
                    </p>
                    <p className="text-footnote text-muted-foreground">
                      {selected.trip.statusLabel}
                      {selected.trip.driver && <> · {selected.trip.driver.fullName}</>} · доставка до{" "}
                      <span className={cn("num", selected.trip.health === "delayed" && "text-delayed font-medium")}>
                        {formatDate(selected.trip.deliveryDate)}
                      </span>
                      {selected.trip.position?.at && <> · отметка {formatRelative(selected.trip.position.at, ref)}</>}
                    </p>
                  </div>
                  <JourneyTimeline status={selected.trip.status} stops={selected.trip.stops} compact />
                </div>
              ) : (
                <p className="text-subheadline text-muted-foreground">
                  {selected.status === "AVAILABLE"
                    ? "Машина свободна. Назначьте её на перевозку с подписанным договором или найдите груз на бирже."
                    : selected.status === "MAINTENANCE"
                      ? "Машина на обслуживании — назначение недоступно."
                      : "Рейса нет."}
                </p>
              )}
            </div>
          </InsetGroup>
        </div>
      </div>
      <footer className="material-bar hairline-t flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
        {selected.trip && (
          <Button asChild>
            <Link href={`/orders/${selected.trip.id}`}>Открыть перевозку</Link>
          </Button>
        )}
        {canFuel && (
          <Button asChild variant="secondary">
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
    </section>
  );

  return (
    <SplitView
      testId="fleet-workspace"
      listLabel="Автопарк"
      backLabel="Автопарк"
      hasDetail={Boolean(selected)}
      onBack={() => select(null)}
      list={list}
      map={
        <MapWorkspace
          objects={mapObjects}
          selectedId={selectedId}
          onSelect={select}
          className="absolute inset-0"
          emptyLabel="Нет машин в рейсе с координатами"
        />
      }
      detail={detail}
    />
  );
}
