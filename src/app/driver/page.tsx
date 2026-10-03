import { Truck } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { countryFlag } from "@/lib/geo/countries";
import { formatDateTime, formatWeight } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { RouteDistance } from "@/components/common/route-distance";
import { DriverTripActions } from "@/features/driver/driver-trip";
import { NavigatorLinks } from "@/features/driver/navigator-links";
import { pageActor } from "@/server/page-context";
import { getMyTrip } from "@/server/services/driver-trip.service";
import { driverMovement } from "@/server/services/next-load.service";
import { DriverNextStep } from "@/features/next-load/driver-next-step";

export const metadata: Metadata = { title: "Мой рейс" };

export default async function DriverHomePage() {
  const actor = await pageActor();
  const trip = toPlain(await getMyTrip(actor));
  if (!trip) {
    return (
      <div className="pt-4">
        <h1 className="text-title1 mb-4 font-semibold">Мой рейс</h1>
        <EmptyState
          icon={Truck}
          title="У вас нет назначенных рейсов"
          description="Когда диспетчер назначит вас на перевозку, рейс появится здесь, а вы получите уведомление."
        />
      </div>
    );
  }
  const { order, lastLocation, documents } = trip;
  const stops = order.load.stops;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const showNext = ["AT_DELIVERY", "DELIVERED"].includes(order.currentStatus) && Boolean(order.vehicle);
  const plan = showNext ? await driverMovement(actor) : null;
  return (
    <div className="space-y-3 pt-1" data-testid="driver-trip">
      <div className="bg-sidebar rounded-2xl p-4 text-white">
        <p className="text-sidebar-foreground text-body">Рейс</p>
        <p className="text-title1 font-bold" data-testid="driver-trip-number">
          #{order.publicNumber}
        </p>
        <p className="text-title2 mt-2 font-semibold">
          {countryFlag(first.country)} {first.city} → {countryFlag(last.country)} {last.city}
        </p>
        {order.vehicle && (
          <p className="text-sidebar-foreground mt-2 text-base">
            {order.vehicle.make} {order.vehicle.model} · <span className="font-mono font-semibold">{order.vehicle.plateNumber}</span>
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sidebar-foreground text-body">Статус:</span>
          <StatusBadge kind="OrderStatus" value={order.currentStatus} size="lg" className="uppercase" />
        </div>
      </div>

      <DriverTripActions
        orderId={order.id}
        status={order.currentStatus}
        lastLocationAt={lastLocation ? new Date(lastLocation.createdAt).toISOString() : null}
        documents={documents.map((d) => ({ ...d, createdAt: new Date(d.createdAt).toISOString() }))}
        carrierPhone={order.carrier.phone}
      />

      {showNext && (
        <DriverNextStep
          orderId={order.id}
          deliveryCity={last.city}
          returnCity={first.city !== last.city ? first.city : null}
          plan={
            plan ? { destinations: plan.movement.destinations.map((d: { label: string }) => d.label), matches: plan.matchesCount } : null
          }
        />
      )}

      <div className="bg-card rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-body font-semibold">Маршрут</p>
          {order.load.routeDistanceKm != null && <RouteDistance route={order.load} className="text-body" />}
        </div>
        <ol className="space-y-3">
          {stops.map((s, i) => (
            <li key={s.id} className="flex gap-3">
              <span className="bg-muted text-footnote grid size-7 shrink-0 place-items-center rounded-full font-semibold">{i + 1}</span>
              <div className="text-body min-w-0">
                <p className="font-medium">
                  {label("StopType", s.type)}: {countryFlag(s.country)} {s.city}
                </p>
                {s.fullAddress && <p className="text-muted-foreground">{s.fullAddress}</p>}
                {s.plannedDateFrom && (
                  <p className="text-muted-foreground">{formatDateTime(s.plannedDateFrom, s.timezone ?? undefined)} (местное)</p>
                )}
                {s.contactPhone && (
                  <a className="text-link" href={`tel:${s.contactPhone}`}>
                    {s.contactName ?? "Контакт"}: {s.contactPhone}
                  </a>
                )}
                <NavigatorLinks
                  className="mt-2"
                  testId={`driver-navigator-${i + 1}`}
                  target={{ lat: s.latitude, lng: s.longitude, address: s.fullAddress, city: s.city }}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="bg-card text-body rounded-2xl p-4">
        <p className="mb-2 font-semibold">Груз</p>
        <p>
          {order.load.title} · {formatWeight(order.load.weightKg)}
          {order.load.packagesCount ? ` · ${order.load.packagesCount} ${order.load.packageType ?? "мест"}` : ""}
        </p>
        {order.load.temperatureFrom !== null && (
          <p>
            Температура: {order.load.temperatureFrom}…{order.load.temperatureTo} °C
          </p>
        )}
        {order.load.notes && <p className="text-muted-foreground">{order.load.notes}</p>}
      </div>
    </div>
  );
}
