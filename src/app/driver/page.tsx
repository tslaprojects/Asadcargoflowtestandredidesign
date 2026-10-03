import { Truck } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/common/misc";
import { InsetGroup } from "@/components/common/inset-group";
import { statusLabel } from "@/components/common/status-badge";
import { formatDateTime, formatWeight } from "@/lib/format";
import { label, t } from "@/lib/i18n";
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
      <div className="pt-2">
        <h1 className="text-large-title">Мой рейс</h1>
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
    <div className="space-y-6 pt-2" data-testid="driver-trip">
      <h1 className="text-large-title">Мой рейс</h1>

      {/* Карточка рейса в духе посадочного талона Wallet */}
      <section className="bg-primary text-primary-foreground overflow-hidden rounded-2xl" aria-label="Рейс">
        <div className="px-5 pt-4 pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-subheadline opacity-80">{t("ui.tripPass")}</p>
            <p className="id-code text-headline" data-testid="driver-trip-number">
              #{order.publicNumber}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="min-w-0">
              <p className="text-footnote opacity-75">{first.country}</p>
              <p className="text-title1 truncate">{first.city}</p>
            </div>
            <span className="text-title2 pb-0.5 opacity-70" aria-hidden>
              →
            </span>
            <div className="min-w-0 text-right">
              <p className="text-footnote opacity-75">{last.country}</p>
              <p className="text-title1 truncate">{last.city}</p>
            </div>
          </div>
        </div>
        <div className="relative border-t border-dashed border-white/35">
          <span className="bg-background absolute -top-2.5 -left-2.5 size-5 rounded-full" aria-hidden />
          <span className="bg-background absolute -top-2.5 -right-2.5 size-5 rounded-full" aria-hidden />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pt-3.5 pb-4">
          <div className="min-w-0">
            <dt className="text-footnote opacity-75">Статус</dt>
            <dd className="font-semibold">{statusLabel("OrderStatus", order.currentStatus)}</dd>
          </div>
          {order.vehicle && (
            <div className="min-w-0 text-right">
              <dt className="text-footnote opacity-75">Машина</dt>
              <dd className="truncate font-semibold">
                <span className="id-code">{order.vehicle.plateNumber}</span>
              </dd>
              <dd className="text-footnote truncate opacity-75">
                {order.vehicle.make} {order.vehicle.model}
              </dd>
            </div>
          )}
        </dl>
      </section>

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

      <InsetGroup
        header="Маршрут"
        action={order.load.routeDistanceKm != null ? <RouteDistance route={order.load} className="text-muted-foreground" /> : undefined}
      >
        <ol className="[&>li+li>div]:hairline-t">
          {stops.map((s, i) => (
            <li key={s.id} className="flex gap-3 pl-4">
              <span className="bg-fill-tertiary text-footnote num mt-3.5 grid size-6 shrink-0 place-items-center rounded-full font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 py-3 pr-4">
                <p className="text-footnote text-muted-foreground">{label("StopType", s.type)}</p>
                <p className="font-semibold">
                  {s.city} <span className="text-caption text-tertiary-foreground font-medium">{s.country}</span>
                </p>
                {s.fullAddress && <p className="text-subheadline text-muted-foreground">{s.fullAddress}</p>}
                {s.plannedDateFrom && (
                  <p className="text-subheadline text-muted-foreground num">
                    {formatDateTime(s.plannedDateFrom, s.timezone ?? undefined)} (местное)
                  </p>
                )}
                {s.contactPhone && (
                  <a className="text-link text-subheadline" href={`tel:${s.contactPhone}`}>
                    {s.contactName ?? "Контакт"}: {s.contactPhone}
                  </a>
                )}
                <NavigatorLinks
                  className="mt-2.5"
                  testId={`driver-navigator-${i + 1}`}
                  target={{ lat: s.latitude, lng: s.longitude, address: s.fullAddress, city: s.city }}
                />
              </div>
            </li>
          ))}
        </ol>
      </InsetGroup>

      <InsetGroup header="Груз">
        <div className="space-y-0.5 px-4 py-3">
          <p className="font-medium">{order.load.title}</p>
          <p className="text-subheadline text-muted-foreground num">
            {formatWeight(order.load.weightKg)}
            {order.load.packagesCount ? ` · ${order.load.packagesCount} ${order.load.packageType ?? "мест"}` : ""}
            {order.load.temperatureFrom !== null && ` · ${order.load.temperatureFrom}…${order.load.temperatureTo} °C`}
          </p>
          {order.load.notes && <p className="text-subheadline text-muted-foreground">{order.load.notes}</p>}
        </div>
      </InsetGroup>
    </div>
  );
}
