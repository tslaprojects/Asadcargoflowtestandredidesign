import { ArrowRight, Calendar, Gauge, MapPin, Navigation, Route, Scale, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryFlag } from "@/lib/geo/countries";
import { formatDate, formatDateRange, formatWeight } from "@/lib/format";
import { label } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CancelPlanButton, NextLoadPlanner, type PlannerVehicle } from "@/features/next-load/planner";
import { MapView, type MapLine, type MapPoint } from "@/features/tracking/map-view";
import { guard, navKindFor, pageActor, sp, type SearchParams } from "@/server/page-context";
import { getMovementMatches, nextLoadContext } from "@/server/services/next-load.service";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Следующий рейс" };

const SORTS = [
  { value: "efficiency", label: "Меньше пустого пробега" },
  { value: "pickup", label: "Ближе погрузка" },
  { value: "deviation", label: "Меньше крюк" },
  { value: "rate", label: "Выше ставка за км" },
  { value: "date", label: "Раньше загрузка" },
] as const;

type Sort = (typeof SORTS)[number]["value"];

export default async function NextLoadPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  if (navKindFor(actor) !== "carrier")
    redirect("/forbidden?reason=" + encodeURIComponent("Раздел «Следующий рейс» доступен перевозчикам."));
  const params = await searchParams;
  const ctx = await guard(nextLoadContext(actor));
  const movementParam = sp(params, "movement");
  const sortParam = (sp(params, "sort") ?? "efficiency") as Sort;
  const sort: Sort = SORTS.some((s) => s.value === sortParam) ? sortParam : "efficiency";

  const vehicleParam = sp(params, "vehicle");
  const selected =
    ctx.vehicles.find((v) => v.id === vehicleParam) ??
    (movementParam ? ctx.vehicles.find((v) => v.movement?.id === movementParam) : undefined) ??
    ctx.vehicles.find((v) => v.movement) ??
    ctx.vehicles.find((v) => v.situation.phase !== "FREE" || v.situation.freePoint) ??
    ctx.vehicles[0] ??
    null;
  const movementId = movementParam ?? selected?.movement?.id ?? null;
  const result = movementId ? await guard(getMovementMatches(actor, movementId, sort)) : null;
  const movement = result?.movement ?? null;

  const vehicleHref = (id: string) => `/next-load?vehicle=${id}`;
  const sortHref = (s: string) =>
    `/next-load?${selected ? `vehicle=${selected.id}&` : ""}${movementId ? `movement=${movementId}&` : ""}sort=${s}`;

  // Карта: текущая точка, направления (коридоры), погрузки и маршруты подходящих грузов
  const top = result?.matches.slice(0, 15) ?? [];
  const points: MapPoint[] = [];
  const lines: MapLine[] = [];
  if (movement) {
    points.push({ lat: movement.originLat, lng: movement.originLng, label: `Сейчас: ${movement.originLabel}`, kind: "VEHICLE" });
    for (const d of movement.destinations) {
      points.push({ lat: d.latitude, lng: d.longitude, label: `Направление: ${d.label}`, kind: "TARGET" });
      lines.push({
        coordinates: [
          [movement.originLng, movement.originLat],
          [d.longitude, d.latitude],
        ],
        color: "#7c3aed",
        dashed: true,
        width: 4,
        opacity: 0.5,
      });
    }
    for (const m of top) {
      const s = m.load.stops;
      const a = s[0];
      const b = s[s.length - 1];
      if (a?.latitude == null || b?.latitude == null) continue;
      points.push({ lat: a.latitude, lng: a.longitude!, label: `${m.load.publicNumber}: погрузка ${a.city}`, kind: "PICKUP" });
      points.push({ lat: b.latitude, lng: b.longitude!, label: `${m.load.publicNumber}: выгрузка ${b.city}`, kind: "DELIVERY" });
      lines.push({
        coordinates: [
          [a.longitude!, a.latitude],
          [b.longitude!, b.latitude],
        ],
        color: "#0891b2",
        width: 2.5,
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Следующий рейс"
        description="Меньше пустого пробега: грузы рядом с точкой разгрузки или по пути в выбранном направлении"
      />
      {ctx.vehicles.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="В автопарке нет автомобилей"
          description="Добавьте автомобиль, чтобы подбирать следующий груз с учётом кузова и грузоподъёмности."
          action={{ href: "/vehicles", label: "Добавить автомобиль" }}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Автомобили</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2" data-testid="nl-vehicles">
                {ctx.vehicles.map((v) => {
                  const st = v.situation;
                  const where =
                    st.phase === "IN_TRIP"
                      ? `В рейсе → ${st.freePoint?.label ?? "—"}${st.remainingKm != null ? `, осталось ≈ ${st.remainingKm} км` : ""}`
                      : st.freePoint
                        ? `Свободен: ${st.freePoint.label}`
                        : "Позиция неизвестна";
                  return (
                    <Link
                      key={v.id}
                      href={vehicleHref(v.id)}
                      className={cn(
                        "border-border hover:border-primary/40 block rounded-xl border p-3 text-sm transition-colors",
                        selected?.id === v.id && "border-primary bg-primary/5",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold">{v.plateNumber}</span>
                        <span className="text-muted-foreground text-xs">
                          {label("BodyType", v.bodyType)} · {formatWeight(v.capacityKg)}
                        </span>
                      </span>
                      <span className="text-muted-foreground mt-1 flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" aria-hidden /> {where}
                      </span>
                      {v.movement && (
                        <span className="text-primary mt-1 flex items-center gap-1.5 text-xs">
                          <Navigation className="size-3.5" aria-hidden /> План:{" "}
                          {v.movement.destinations.length
                            ? v.movement.destinations.map((d: { label: string }) => d.label).join(", ")
                            : "грузы рядом"}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{selected ? `Что дальше для ${selected.plateNumber}?` : "Что дальше?"}</CardTitle>
              </CardHeader>
              <CardContent>
                <NextLoadPlanner
                  key={selected?.id ?? "none"}
                  vehicle={selected as unknown as PlannerVehicle}
                  cities={ctx.cities}
                  initial={
                    movement ? { allowedDeviationKm: movement.allowedDeviationKm, maxPickupDistanceKm: movement.maxPickupDistanceKm } : null
                  }
                />
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 space-y-5">
            {!movement || !result ? (
              <EmptyState
                icon={Route}
                title="Укажите, что планируете после доставки"
                description="Вернуться обратно, ехать в конкретный город, выбрать направление на карте или посмотреть грузы рядом. Можно указать несколько направлений."
                className="py-16"
              />
            ) : (
              <>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5 text-sm" data-testid="nl-plan">
                    <div className="space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                        <MapPin className="text-destructive size-4" aria-hidden /> {movement.originLabel}
                        <ArrowRight className="size-4" aria-hidden />
                        {movement.destinations.length
                          ? movement.destinations.map((d: { label: string }) => d.label).join(" / ")
                          : "любое направление"}
                        <Badge tone={movement.status === "ACTIVE" ? "info" : "neutral"}>{label("MovementIntent", movement.intent)}</Badge>
                      </p>
                      <p className="text-muted-foreground">
                        {movement.destinations.length
                          ? `Допустимый крюк до ${movement.allowedDeviationKm} км`
                          : `Погрузка в радиусе ${movement.maxPickupDistanceKm} км`}{" "}
                        · свободен {formatDate(movement.availableFrom)} — {formatDate(movement.availableUntil)}
                        {movement.vehicle ? ` · ${movement.vehicle.plateNumber}` : " · автомобиль не выбран"}
                      </p>
                    </div>
                    {movement.status === "ACTIVE" ? (
                      <CancelPlanButton movementId={movement.id} vehicleId={movement.vehicleId} />
                    ) : (
                      <Badge tone="neutral">План {label("MovementStatus", movement.status).toLowerCase()}</Badge>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-5">
                    <MapView points={points} lines={lines} className="h-[380px] w-full overflow-hidden rounded-xl" />
                    <p className="text-muted-foreground mt-2 text-xs">
                      Фиолетовый пунктир — направление движения, голубые линии — маршруты подходящих грузов. Расстояния — оценка по прямой с
                      коэффициентом дороги 1,2, а не навигационный маршрут.
                    </p>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold" data-testid="nl-count">
                    Подходящие грузы: {result.matches.length}
                  </h2>
                  <nav className="flex flex-wrap gap-1" aria-label="Сортировка">
                    {SORTS.map((s) => (
                      <Button key={s.value} size="sm" variant={s.value === sort ? "default" : "ghost"} asChild>
                        <Link href={sortHref(s.value)} scroll={false}>
                          {s.label}
                        </Link>
                      </Button>
                    ))}
                  </nav>
                </div>

                {result.matches.length === 0 ? (
                  <EmptyState
                    icon={Route}
                    title="Подходящих грузов пока нет"
                    description="Увеличьте допустимый крюк, добавьте направление или расширьте период доступности. Ниже — почему не подошли остальные грузы."
                  />
                ) : (
                  <div className="grid gap-3 2xl:grid-cols-2" data-testid="nl-matches">
                    {result.matches.map((m) => (
                      <MatchCard key={m.loadId} m={m} />
                    ))}
                  </div>
                )}

                {result.rejectedCount > 0 && (
                  <details className="border-border bg-card rounded-xl border p-4 text-sm">
                    <summary className="cursor-pointer font-medium">Почему не показаны другие грузы ({result.rejectedCount})</summary>
                    <ul className="mt-3 space-y-2">
                      {result.rejected.map((r) => (
                        <li key={r.loadId}>
                          <Link href={`/loads/${r.loadId}`} className="text-primary hover:underline">
                            {r.publicNumber}
                          </Link>{" "}
                          {r.title}
                          <span className="text-muted-foreground block text-xs">{r.reasons.join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

type Match = Awaited<ReturnType<typeof getMovementMatches>>["matches"][number];

function MatchCard({ m }: { m: Match }) {
  const s = m.load.stops;
  const a = s[0];
  const b = s[s.length - 1];
  const myBid = m.load.bids.find((x) => x.status === "PENDING" || x.status === "ACCEPTED");
  const metrics = [
    { icon: MapPin, label: "До погрузки", value: `≈ ${m.pickupDistanceKm} км` },
    {
      icon: Route,
      label: m.directionMatch === "ON_ROUTE" ? "Крюк" : "Направление",
      value: m.directionMatch === "ON_ROUTE" ? `≈ ${m.detourKm} км` : "любое",
    },
    { icon: Truck, label: "С грузом", value: `≈ ${m.loadedDistanceKm} км` },
    { icon: Gauge, label: "Общий пробег", value: `≈ ${m.estimatedTotalDistanceKm} км` },
  ];
  return (
    <article className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-xs" data-testid="nl-match">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{m.load.publicNumber}</p>
          <p className="truncate font-semibold">{m.load.title}</p>
          <p className="mt-1 text-sm font-medium">
            {countryFlag(a.country)} {a.city} → {countryFlag(b.country)} {b.city}
          </p>
        </div>
        <Badge tone={m.directionMatch === "ON_ROUTE" ? "success" : "info"} className="shrink-0">
          {m.directionMatch === "ON_ROUTE" ? `По пути: ${m.destinationLabel}` : "Рядом"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {metrics.map((x) => (
          <div key={x.label} className="bg-muted/50 rounded-lg p-2">
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <x.icon className="size-3" aria-hidden /> {x.label}
            </p>
            <p className="font-semibold">{x.value}</p>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-4" aria-hidden /> {formatDateRange(m.load.loadingDateFrom, m.load.loadingDateTo)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Scale className="size-4" aria-hidden /> {formatWeight(m.load.weightKg)} ·{" "}
          {m.load.bodyType ? label("BodyType", m.load.bodyType) : "любой кузов"}
        </span>
      </div>
      <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
        {m.matchReason.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {m.compatibility.warnings.map((w) => (
          <li key={w} className="text-warning">
            {w}
          </li>
        ))}
      </ul>
      <div className="border-border mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div>
          {m.estimatedPrice != null ? (
            <>
              <MoneyDisplay amount={m.estimatedPrice} currency={m.currency} className="text-lg font-semibold" />
              {m.ratePerKm != null && (
                <span className="text-muted-foreground ml-2 text-xs">
                  ≈ {m.ratePerKm} {m.currency}/км
                </span>
              )}
            </>
          ) : (
            <span className="font-semibold">Запрос цены</span>
          )}
        </div>
        {myBid ? (
          <Badge tone={myBid.status === "ACCEPTED" ? "success" : "info"}>
            Ваше предложение: <MoneyDisplay amount={myBid.amount} currency={myBid.currency} />
          </Badge>
        ) : (
          <Button size="sm" asChild>
            <Link href={`/loads/${m.load.id}`}>Предложить цену</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
