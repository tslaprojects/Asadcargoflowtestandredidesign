import type { Metadata } from "next";
import Link from "next/link";
import { DefinitionList, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { AnomalyActions } from "@/features/fuel/fuel-actions";
import { AnalysisChecks, TelemetryTable } from "@/features/fuel/fuel-evidence";
import { DemoBadge } from "@/features/fuel/fuel-ui";
import { MapView, type MapPoint } from "@/features/tracking/map-view";
import { guard, pageActorWith } from "@/server/page-context";
import { getAnomaly } from "@/server/services/fuel-investigation.service";

export const metadata: Metadata = { title: "Проверка по топливу" };

export default async function AnomalyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActorWith("FUEL_VIEW");
  const { anomaly: a, telemetry, reviewer } = toPlain(await guard(getAnomaly(actor, id)));
  const t = a.transaction;
  const analysis = (t?.analysis ?? null) as { checks?: Parameters<typeof AnalysisChecks>[0]["checks"]; score?: number } | null;
  const details = a.details as Record<string, number>;
  const points: MapPoint[] = [];
  if (t?.latitude != null && t.longitude != null)
    points.push({ lat: t.latitude, lng: t.longitude, label: `АЗС: ${t.stationName}`, kind: "FUEL_ALERT" });
  if (details.positionLat != null)
    points.push({ lat: details.positionLat, lng: details.positionLng, label: "GPS автомобиля в момент заправки", kind: "VEHICLE" });
  const lines =
    points.length === 2 ? [{ coordinates: points.map((p) => [p.lng, p.lat] as [number, number]), color: "#c2410c", dashed: true }] : [];
  return (
    <>
      <PageHeader
        back={actor.isAdmin ? { href: "/admin/fuel", label: "Топливо: проверки" } : { href: "/fuel?tab=checks", label: "Проверки" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {label("FuelAnomalyType", a.type)}
            <StatusBadge kind="FuelAnomalySeverity" value={a.severity} size="lg" />
            <StatusBadge kind="FuelAnomalyStatus" value={a.status} size="lg" />
            {a.isDemo && <DemoBadge />}
          </span>
        }
        description={`${a.vehicle.make} ${a.vehicle.model} · ${a.vehicle.plateNumber} · ${formatDateTime(a.detectedAt)}${actor.isAdmin ? ` · ${a.company.legalName}` : ""}`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Обнаружено потенциальное несоответствие</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-base" data-testid="anomaly-explanation">
                {a.explanation}
              </p>
              <p className="text-muted-foreground text-sm">
                Балл по правилу: <b>{a.score}</b>
                {analysis?.score != null && (
                  <>
                    {" "}
                    · итоговый балл заправки: <b>{analysis.score}</b> из 100
                  </>
                )}
                . Это сигнал для проверки, а не вывод о нарушении.
              </p>
              <AnomalyActions anomalyId={a.id} status={a.status} canInvestigate={actor.permissions.has("FUEL_INVESTIGATE")} />
              {a.investigation && (
                <p className="text-sm">
                  Расследование:{" "}
                  <Link href={`/fuel/investigations/${a.investigation.id}`} className="text-primary hover:underline">
                    {a.investigation.title}
                  </Link>{" "}
                  <StatusBadge kind="FuelInvestigationStatus" value={a.investigation.status} />
                </p>
              )}
              {a.reviewComment && (
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <p className="font-medium">Результат проверки{reviewer ? ` · ${reviewer.firstName} ${reviewer.lastName}` : ""}</p>
                  <p>{a.reviewComment}</p>
                  {a.reviewedAt && <p className="text-muted-foreground text-xs">{formatDateTime(a.reviewedAt)}</p>}
                </div>
              )}
            </CardContent>
          </Card>
          {t && (
            <Card>
              <CardHeader>
                <CardTitle>Какие данные сопоставлены</CardTitle>
              </CardHeader>
              <CardContent>
                <AnalysisChecks checks={analysis?.checks ?? null} liters={t.liters} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Телематика ±3 часа</CardTitle>
            </CardHeader>
            <CardContent>
              <TelemetryTable points={telemetry} />
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-5">
          {t && (
            <Card>
              <CardHeader>
                <CardTitle>Заправка</CardTitle>
              </CardHeader>
              <CardContent>
                <DefinitionList
                  items={[
                    { label: "АЗС", value: `${t.stationName}${t.stationAddress ? `, ${t.stationAddress}` : ""}` },
                    { label: "Время", value: formatDateTime(t.transactionDate) },
                    { label: "Литры", value: `${t.liters} л` },
                    ...(actor.permissions.has("FUEL_FINANCE_VIEW")
                      ? [{ label: "Сумма", value: <MoneyDisplay amount={t.totalAmount} currency={t.currency} /> }]
                      : []),
                    { label: "Карта", value: t.card.label },
                    { label: "Водитель", value: t.driver?.fullName ?? "не назначен" },
                    {
                      label: "Рейс",
                      value: t.order ? (
                        <Link className="text-primary hover:underline" href={`/orders/${t.order.id}?tab=fuel`}>
                          {t.order.publicNumber}
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    { label: "Сопоставление", value: <StatusBadge kind="FuelMatchStatus" value={t.matchStatus} /> },
                  ]}
                />
              </CardContent>
            </Card>
          )}
          {points.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>АЗС и GPS</CardTitle>
              </CardHeader>
              <CardContent>
                <MapView points={points} lines={lines} className="h-[260px] w-full overflow-hidden rounded-lg" />
              </CardContent>
            </Card>
          )}
          {!actor.isAdmin && (
            <p className="text-sm">
              <Link href={`/fuel/vehicles/${a.vehicle.id}`} className="text-primary hover:underline">
                Все данные автомобиля →
              </Link>
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
