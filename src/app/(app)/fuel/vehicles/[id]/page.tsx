import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DefinitionList, EmptyState, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONSUMPTION_METHOD_LABELS } from "@/lib/fuel/consumption";
import { formatDateTime, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { FuelTxActions, VehicleFuelSettingsDialog } from "@/features/fuel/fuel-actions";
import { FuelLevelChart } from "@/features/fuel/fuel-level-chart";
import { DemoBadge, DeviationText, FuelHealthBadge, Metric, TankGauge } from "@/features/fuel/fuel-ui";
import { MapView, type MapPoint } from "@/features/tracking/map-view";
import { guard, pageActorWith } from "@/server/page-context";
import { vehicleFuelReport } from "@/server/services/fuel-report.service";

export const metadata: Metadata = { title: "Топливо автомобиля" };

export default async function VehicleFuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActorWith("FUEL_VIEW");
  const r = toPlain(await guard(vehicleFuelReport(actor, id)));
  const v = r.vehicle;
  const s = r.summary;
  const canManage = actor.permissions.has("FUEL_MANAGE");
  const canFinance = actor.permissions.has("FUEL_FINANCE_VIEW");
  const lvl = r.state.fuelLevel.status === "AVAILABLE" ? r.state.fuelLevel : null;
  const odo = r.state.odometer.status === "AVAILABLE" ? r.state.odometer : null;
  const eng = r.state.engine.status === "AVAILABLE" ? r.state.engine : null;

  const points: MapPoint[] = [
    ...(s.location ? [{ lat: s.location.lat, lng: s.location.lng, label: `Сейчас: ${s.location.label}`, kind: "VEHICLE" as const }] : []),
    ...r.transactions
      .filter((t) => t.latitude != null && t.longitude != null && t.status !== "DECLINED")
      .map((t) => ({
        lat: t.latitude!,
        lng: t.longitude!,
        label: `${t.stationName} · ${t.liters} л · ${formatDateTime(t.transactionDate)}`,
        kind: (t.matchStatus === "MISMATCH"
          ? "FUEL_ALERT"
          : t.matchStatus === "MATCHED"
            ? "FUEL_OK"
            : "FUEL_UNVERIFIED") as MapPoint["kind"],
      })),
  ];
  const trackLine =
    r.track.length > 1
      ? [{ coordinates: r.track.map((p) => [p.lng, p.lat] as [number, number]), color: "#1d4ed8", width: 2, opacity: 0.6 }]
      : [];

  return (
    <>
      <PageHeader
        back={{ href: "/fuel", label: "Топливо" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {v.make} {v.model} <span className="text-muted-foreground text-title3 font-mono">{v.plateNumber}</span>
            <FuelHealthBadge health={s.health} />
            {r.state.demo && <DemoBadge />}
          </span>
        }
        description={`${label("VehicleType", v.vehicleType)} · ${v.fuelType ? label("FuelType", v.fuelType) : "тип топлива не указан"}${v.engineType ? ` · ${v.engineType}` : ""}${v.vin ? ` · VIN ${v.vin}` : ""}`}
        actions={canManage ? <VehicleFuelSettingsDialog vehicleId={v.id} initial={v} /> : undefined}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="vehicle-fuel-summary">
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-body">Текущий уровень</p>
            <TankGauge liters={lvl?.value.liters ?? null} capacity={v.tankCapacityLiters} />
            <p className="text-muted-foreground text-footnote mt-1">
              {lvl ? `${label("FuelLevelSource", lvl.value.source)} · ${formatRelative(lvl.recordedAt)}` : "датчик уровня не подключён"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-body">Средний расход (30 дней)</p>
            <p className="text-title3 font-semibold">
              <Metric value={r.consumption.per100Km} unit="л/100 км" />
            </p>
            <p className="text-muted-foreground text-footnote">
              {r.consumption.method ? CONSUMPTION_METHOD_LABELS[r.consumption.method] : "нужны одометр и уровень топлива"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-body">Норма / отклонение</p>
            <p className="text-title3 font-semibold">
              <Metric value={v.fuelNormPer100Km} unit="л/100 км" na="не задана" /> · <DeviationText pct={r.deviationPct} />
            </p>
            <p className="text-muted-foreground text-footnote">норму задаёт владелец для этого автомобиля</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-body">Несоответствия</p>
            <p className={s.openAnomalies ? "text-danger text-title3 font-semibold" : "text-title3 font-semibold"}>
              {s.openAnomalies} требуют внимания
            </p>
            <p className="text-muted-foreground text-footnote">всего за период: {r.anomalies.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Уровень топлива (3 дня)</CardTitle>
            </CardHeader>
            <CardContent>
              <FuelLevelChart
                points={r.levelSeries}
                capacity={v.tankCapacityLiters}
                refuels={r.transactions
                  .filter((t) => t.status !== "DECLINED" && t.status !== "REVERSED")
                  .map((t) => ({ at: t.transactionDate, liters: t.liters, alert: t.matchStatus === "MISMATCH" }))}
              />
              {r.levelSeries.length > 0 && (
                <details className="text-body mt-2">
                  <summary className="text-link cursor-pointer">Показания таблицей</summary>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Время</TableHead>
                        <TableHead>Уровень</TableHead>
                        <TableHead>Источник</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.levelSeries.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>{formatDateTime(p.at)}</TableCell>
                          <TableCell>{Math.round(p.liters)} л</TableCell>
                          <TableCell>{p.source ? label("FuelLevelSource", p.source) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Последние заправки</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {r.transactions.length === 0 ? (
                <p className="text-muted-foreground text-body">Заправок нет.</p>
              ) : (
                <Table data-testid="vehicle-transactions">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>АЗС</TableHead>
                      <TableHead>Литры</TableHead>
                      {canFinance && <TableHead>Сумма</TableHead>}
                      <TableHead>Водитель</TableHead>
                      <TableHead>Рейс</TableHead>
                      <TableHead>Статус</TableHead>
                      {canManage && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(t.transactionDate)}</TableCell>
                        <TableCell>
                          {t.stationName}
                          {t.status === "DECLINED" && t.declineReason && (
                            <span className="text-danger text-footnote block">{t.declineReason}</span>
                          )}
                          {t.levelBefore != null && t.levelAfter != null && (
                            <span className="text-muted-foreground text-footnote block">
                              уровень {Math.round(t.levelBefore)} → {Math.round(t.levelAfter)} л
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{t.liters} л</TableCell>
                        {canFinance && (
                          <TableCell>
                            {t.totalAmount != null ? <MoneyDisplay amount={t.totalAmount} currency={t.currency} /> : "—"}
                          </TableCell>
                        )}
                        <TableCell>{t.driver?.fullName ?? "—"}</TableCell>
                        <TableCell>
                          {t.order ? (
                            <Link className="text-link hover:underline" href={`/orders/${t.order.id}?tab=fuel`}>
                              {t.order.publicNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-col items-start gap-1">
                            <StatusBadge kind="FuelTransactionStatus" value={t.status} />
                            {t.status !== "DECLINED" && <StatusBadge kind="FuelMatchStatus" value={t.matchStatus} />}
                          </span>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <FuelTxActions id={t.id} status={t.status} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Карта: трек и заправки</CardTitle>
            </CardHeader>
            <CardContent>
              <MapView points={points} lines={trackLine} className="h-[300px] w-full overflow-hidden rounded-lg" />
              <p className="text-muted-foreground text-footnote mt-2">
                Синяя линия — трек за 3 дня (телематика). Зелёный — заправка совпадает, оранжевый — требует проверки, серый — нет данных.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Автомобиль сейчас</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: "Водитель", value: s.driver?.fullName ?? "не назначен" },
                  {
                    label: "Рейс",
                    value: s.trip ? (
                      <Link className="text-link hover:underline" href={`/orders/${s.trip.id}?tab=fuel`}>
                        {s.trip.publicNumber} · {s.trip.route}
                      </Link>
                    ) : (
                      "нет активного"
                    ),
                  },
                  {
                    label: "GPS",
                    value: s.location
                      ? `${s.location.label} · ${formatRelative(s.location.at)}${s.location.source === "DRIVER_APP" ? " (приложение водителя)" : ""}`
                      : "нет данных",
                  },
                  { label: "Двигатель", value: eng ? (eng.value.engineOn ? "заведён" : "заглушен") : "нет данных" },
                  { label: "Одометр", value: odo ? `${Math.round(odo.value).toLocaleString("ru-RU")} км` : "нет данных" },
                  {
                    label: "Телематика",
                    value: v.telematicsDeviceId ? `${v.telematicsProvider ?? ""} · ${v.telematicsDeviceId}` : "не подключена",
                  },
                  {
                    label: "Топливные карты",
                    value: r.cards.length
                      ? r.cards.map((c) => `${c.label} (${label("FuelCardStatus", c.status).toLowerCase()})`).join(", ")
                      : "нет",
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Несоответствия</CardTitle>
            </CardHeader>
            <CardContent>
              {r.anomalies.length === 0 ? (
                <EmptyState title="Несоответствий нет" className="py-6" />
              ) : (
                <ul className="space-y-2">
                  {r.anomalies.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/fuel/anomalies/${a.id}`}
                        className="text-body bg-fill-quaternary hover:bg-fill-tertiary block rounded-lg p-2.5"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="size-3.5" aria-hidden /> {label("FuelAnomalyType", a.type)}
                          </span>
                          <StatusBadge kind="FuelAnomalyStatus" value={a.status} />
                        </span>
                        <span className="text-muted-foreground text-footnote">{formatDateTime(a.detectedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
