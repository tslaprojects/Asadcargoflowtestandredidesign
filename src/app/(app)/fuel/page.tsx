import { AlertTriangle, Droplets, Fuel, Gauge, MapPin, Receipt, Route, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, KpiCard, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { UrlTabs } from "@/components/common/url-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/lib/format";
import { DEMO_STATIONS } from "@/lib/fuel/demo-stations";
import { enumOptions, label } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { toPlain } from "@/lib/serialize";
import { CardActions, IssueCardDialog, SimulateRefuelDialog, TopUpDialog } from "@/features/fuel/fuel-actions";
import { limitsFromCard } from "@/features/fuel/limits-form";
import { DemoBanner, DemoBadge, DeviationText, FuelHealthBadge, Metric, TankGauge } from "@/features/fuel/fuel-ui";
import { MapView, type MapPoint } from "@/features/tracking/map-view";
import { fuelListQuerySchema } from "@/lib/validation/fuel";
import { guard, navKindFor, pageActor, type SearchParams } from "@/server/page-context";
import { getAccounts, listFuelCards } from "@/server/services/fuel-card.service";
import { listAnomalies, listInvestigations } from "@/server/services/fuel-investigation.service";
import { fuelDashboard } from "@/server/services/fuel-report.service";
import { listFuelTransactions } from "@/server/services/fuel-transaction.service";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Топливо" };

export default async function FuelPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  if (navKindFor(actor) !== "carrier") redirect("/forbidden?reason=" + encodeURIComponent("Раздел «Топливо» доступен перевозчикам."));
  if (!actor.permissions.has("FUEL_VIEW")) redirect("/forbidden?need=FUEL_VIEW");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = fuelListQuerySchema.safeParse(raw);
  const q = parsed.success ? parsed.data : fuelListQuerySchema.parse({});
  const canManage = actor.permissions.has("FUEL_MANAGE");
  const canFinance = actor.permissions.has("FUEL_FINANCE_VIEW");
  const companyId = actor.active!.companyId;

  const [dash, txs, cards, accounts, anomalies, investigations, vehicles, drivers] = await Promise.all([
    guard(fuelDashboard(actor, q)).then(toPlain),
    listFuelTransactions(actor, q).then(toPlain),
    listFuelCards(actor).then(toPlain),
    canFinance ? getAccounts(actor).then(toPlain) : Promise.resolve(null),
    listAnomalies(actor, { page: 1, pageSize: 50 }).then(toPlain),
    listInvestigations(actor, {}).then(toPlain),
    prisma.vehicle.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { plateNumber: "asc" },
      select: { id: true, plateNumber: true, make: true, model: true },
    }),
    prisma.driverProfile.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);
  const vehicleOpts = vehicles.map((v) => ({ id: v.id, label: `${v.plateNumber} · ${v.make} ${v.model}` }));
  const driverOpts = drivers.map((d) => ({ id: d.id, label: d.fullName }));
  const demo = cards.some((c) => c.isDemo) || dash.fleet.some((v) => v.demo);
  const openAnomalies = anomalies.items.filter((a) => a.status === "OPEN" || a.status === "CONFIRMED" || a.status === "INVESTIGATING");

  const points: MapPoint[] = [
    ...dash.fleet
      .filter((v) => v.location)
      .map((v) => ({
        lat: v.location!.lat,
        lng: v.location!.lng,
        label: `${v.plateNumber}: ${v.location!.label}`,
        kind: "VEHICLE" as const,
      })),
    ...dash.mapRefuels.map((r) => ({
      lat: r.latitude!,
      lng: r.longitude!,
      label: `${r.vehicle?.plateNumber ?? ""} · ${r.stationName} · ${r.liters} л · ${label("FuelMatchStatus", r.matchStatus)}`,
      kind: (r.matchStatus === "MISMATCH" ? "FUEL_ALERT" : r.matchStatus === "MATCHED" ? "FUEL_OK" : "FUEL_UNVERIFIED") as MapPoint["kind"],
    })),
  ];

  const overview = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-3" data-testid="fleet-cards">
        <h2 className="text-base font-semibold">Мой автопарк</h2>
        {dash.fleet.length === 0 ? (
          <EmptyState title="В автопарке нет автомобилей" action={{ href: "/vehicles", label: "Добавить автомобиль" }} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {dash.fleet.map((v) => (
              <Link
                key={v.id}
                href={`/fuel/vehicles/${v.id}`}
                className="bg-card hover:bg-surface-secondary flex flex-col gap-3 rounded-lg p-4 transition-colors"
                data-testid="fleet-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {v.make} {v.model}
                    </p>
                    <p className="text-muted-foreground text-body font-mono">{v.plateNumber}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <FuelHealthBadge health={v.health} />
                    {v.demo && <DemoBadge />}
                  </div>
                </div>
                <dl className="text-body grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <dt className="text-muted-foreground text-footnote">Водитель</dt>
                    <dd>{v.driver?.fullName ?? <span className="text-muted-foreground">не назначен</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-footnote">Рейс</dt>
                    <dd>{v.trip ? `${v.trip.route}` : <span className="text-muted-foreground">нет активного</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-footnote">GPS</dt>
                    <dd>
                      {v.location ? (
                        <span title={formatDateTime(v.location.at)}>
                          {v.location.label} · {formatRelative(v.location.at)}
                        </span>
                      ) : (
                        <Metric value={null} />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-footnote">Средний расход (30 дн.)</dt>
                    <dd>
                      <Metric value={v.consumption.per100Km} unit="л/100 км" />{" "}
                      {v.fuelNormPer100Km && v.deviationPct != null && (
                        <span className="text-footnote">
                          (норма {v.fuelNormPer100Km}, <DeviationText pct={v.deviationPct} />)
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-footnote">Последняя заправка</dt>
                    <dd>
                      {v.lastRefuel ? (
                        `${v.lastRefuel.liters} л · ${formatRelative(v.lastRefuel.transactionDate)}`
                      ) : (
                        <Metric value={null} na="нет" />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-footnote">Топливо</dt>
                    <dd>
                      <TankGauge liters={v.fuelLevel?.liters ?? null} capacity={v.tankCapacityLiters} />
                    </dd>
                  </div>
                </dl>
                {v.openAnomalies > 0 && (
                  <p className="text-danger text-body flex items-center gap-1.5">
                    <AlertTriangle className="size-4" aria-hidden /> Требуют проверки: {v.openAnomalies}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
      <aside className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4" aria-hidden /> Карта
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MapView points={points} lines={[]} className="h-[320px] w-full overflow-hidden rounded-lg" />
            <ul className="text-muted-foreground text-footnote mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Обозначения">
              <li>
                <span className="mr-1 inline-block size-2.5 rounded-full bg-[var(--map-attention)]" aria-hidden />
                автомобиль
              </li>
              <li>
                <span className="mr-1 inline-block size-2.5 rounded-full bg-[var(--map-done)]" aria-hidden />
                заправка совпадает
              </li>
              <li>
                <span className="mr-1 inline-block size-2.5 rounded-full bg-[var(--map-delayed)]" aria-hidden />
                требует проверки
              </li>
              <li>
                <span className="mr-1 inline-block size-2.5 rounded-full bg-[var(--map-cancelled)]" aria-hidden />
                нет данных для проверки
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card data-testid="attention">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Требует внимания</CardTitle>
            <Link href="/fuel?tab=checks" className="text-link text-body hover:underline">
              Все проверки →
            </Link>
          </CardHeader>
          <CardContent>
            {openAnomalies.length === 0 ? (
              <p className="text-muted-foreground text-body">Несоответствий нет.</p>
            ) : (
              <ul className="space-y-2">
                {openAnomalies.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/fuel/anomalies/${a.id}`}
                      className="text-body bg-fill-quaternary hover:bg-fill-tertiary block rounded-lg p-2.5 transition-colors"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{label("FuelAnomalyType", a.type)}</span>
                        <StatusBadge kind="FuelAnomalySeverity" value={a.severity} />
                      </span>
                      <span className="text-muted-foreground text-footnote block">
                        {a.vehicle.plateNumber} · {formatDateTime(a.detectedAt)} · {label("FuelAnomalyStatus", a.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {dash.overNorm.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Расход выше нормы</CardTitle>
            </CardHeader>
            <CardContent className="text-body space-y-1.5">
              {dash.overNorm.map((v) => (
                <p key={v.id} className="flex justify-between gap-2">
                  <Link href={`/fuel/vehicles/${v.id}`} className="text-link hover:underline">
                    {v.plateNumber}
                  </Link>
                  <span>
                    {v.consumption.per100Km} л/100 км · <DeviationText pct={v.deviationPct} />
                  </span>
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );

  type Tx = (typeof txs.items)[number];
  const transactions = (
    <div>
      <DataTable<Tx>
        rows={txs.items}
        rowKey={(t) => t.id}
        rowHref={(t) => (t.vehicle ? `/fuel/vehicles/${t.vehicle.id}` : "/fuel?tab=transactions")}
        empty={<EmptyState icon={Fuel} title="Заправок нет" description="Операции по топливным картам появятся здесь автоматически." />}
        columns={[
          { key: "date", header: "Дата", primary: true, cell: (t) => formatDateTime(t.transactionDate) },
          { key: "vehicle", header: "Автомобиль", cell: (t) => t.vehicle?.plateNumber ?? "—" },
          { key: "driver", header: "Водитель", cell: (t) => t.driver?.fullName ?? "—", hideOnMobile: true },
          { key: "station", header: "АЗС", cell: (t) => t.stationName },
          { key: "liters", header: "Литры", cell: (t) => `${t.liters} л` },
          ...(canFinance
            ? [
                {
                  key: "amount",
                  header: "Сумма",
                  cell: (t: Tx) => (t.totalAmount != null ? <MoneyDisplay amount={t.totalAmount} currency={t.currency} /> : "—"),
                },
              ]
            : []),
          { key: "trip", header: "Рейс", cell: (t) => t.order?.publicNumber ?? "—", hideOnMobile: true },
          {
            key: "status",
            header: "Статус",
            cell: (t) => (
              <span className="flex flex-col items-start gap-1">
                <StatusBadge kind="FuelTransactionStatus" value={t.status} />
                {t.status !== "DECLINED" && <StatusBadge kind="FuelMatchStatus" value={t.matchStatus} />}
                {t.isDemo && <DemoBadge />}
              </span>
            ),
          },
        ]}
      />
      <Pagination
        page={txs.page}
        pageSize={txs.pageSize}
        total={txs.total}
        basePath="/fuel"
        searchParams={{ ...raw, tab: "transactions" }}
      />
    </div>
  );

  const cardsTab = (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Топливные карты</CardTitle>
        {canManage && <IssueCardDialog vehicles={vehicleOpts} drivers={driverOpts} />}
      </CardHeader>
      <CardContent>
        {cards.length === 0 ? (
          <EmptyState title="Карт нет" description="Выпустите карту и привяжите её к автомобилю и водителю." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Карта</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Автомобиль / водитель</TableHead>
                  <TableHead>Лимиты</TableHead>
                  {canManage && <TableHead className="text-right">Действия</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c) => (
                  <TableRow key={c.id} data-testid={`card-row-${c.label}`}>
                    <TableCell>
                      <p className="font-medium">{c.label}</p>
                      <p className="text-muted-foreground text-footnote">
                        {c.last4 ? `•••• ${c.last4}` : "—"} · {c.account.currency}
                        {c.isDemo && " · DEMO"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="FuelCardStatus" value={c.status} />
                      {c.blockedReason && <p className="text-muted-foreground text-footnote mt-1 max-w-48">{c.blockedReason}</p>}
                    </TableCell>
                    <TableCell className="text-body">
                      <p>{c.vehicle ? `${c.vehicle.plateNumber} · ${c.vehicle.make} ${c.vehicle.model}` : "—"}</p>
                      <p className="text-muted-foreground">{c.driver?.fullName ?? "водитель не назначен"}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-footnote">
                      {[
                        c.limits.perTransactionLiters && `${c.limits.perTransactionLiters} л/заправка`,
                        c.limits.dailyLiters && `${c.limits.dailyLiters} л/день`,
                        c.limits.monthlyLiters && `${c.limits.monthlyLiters} л/мес`,
                        c.limits.dailyAmount && `${formatMoney(c.limits.dailyAmount, c.account.currency)}/день`,
                        c.limits.allowedFuelTypes.length && c.limits.allowedFuelTypes.map((f) => label("FuelType", f)).join(", "),
                        c.limits.allowedFromMinute != null &&
                          `${String(Math.floor(c.limits.allowedFromMinute / 60)).padStart(2, "0")}:${String(c.limits.allowedFromMinute % 60).padStart(2, "0")}–${String(Math.floor(c.limits.allowedToMinute! / 60)).padStart(2, "0")}:${String(c.limits.allowedToMinute! % 60).padStart(2, "0")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "без лимитов"}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <CardActions
                          card={{
                            id: c.id,
                            label: c.label,
                            status: c.status,
                            vehicleId: c.vehicleId,
                            driverId: c.driverId,
                            currency: c.account.currency,
                            limits: limitsFromCard(c.limits, c.driverCanSeeFuelLevel),
                          }}
                          vehicles={vehicleOpts}
                          drivers={driverOpts}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const accountTab = accounts && (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-body max-w-2xl">
          Баланс корпоративного топливного счёта видят только владелец и руководство. Водители видят лишь «Оплата разрешена».
        </p>
        <TopUpDialog demo={demo} />
      </div>
      {accounts.accounts.length === 0 ? (
        <EmptyState title="Топливный счёт ещё не создан" description="Он создаётся при выпуске первой карты или первом пополнении." />
      ) : (
        <div className="grid gap-3 md:grid-cols-3" data-testid="fuel-account">
          {accounts.accounts.map((a) => (
            <div key={a.id} className="contents">
              <KpiCard label={`Баланс (${a.currency})`} value={<MoneyDisplay amount={a.balance} currency={a.currency} />} icon={Receipt} />
              <KpiCard
                label="Зарезервировано"
                value={<MoneyDisplay amount={a.reserved} currency={a.currency} />}
                hint="авторизованные, не завершённые заправки"
              />
              <KpiCard label="Доступно" value={<MoneyDisplay amount={a.available} currency={a.currency} />} tone="success" />
            </div>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>История операций</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.entries.length === 0 ? (
            <p className="text-muted-foreground text-body">Операций нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Операция</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Баланс после</TableHead>
                  <TableHead>Основание</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell>{label("FuelAccountEntryType", e.type)}</TableCell>
                    <TableCell>
                      <MoneyDisplay amount={["CHARGE", "RESERVE"].includes(e.type) ? -e.amount : e.amount} currency={e.currency} />
                    </TableCell>
                    <TableCell>
                      <MoneyDisplay amount={e.balanceAfter} currency={e.currency} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-body max-w-64 truncate">
                      {e.externalReference ?? e.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const checks = (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Несоответствия</CardTitle>
        </CardHeader>
        <CardContent>
          {anomalies.items.length === 0 ? (
            <p className="text-muted-foreground text-body">Несоответствий не обнаружено.</p>
          ) : (
            <ul className="space-y-2" data-testid="anomaly-list">
              {anomalies.items.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/fuel/anomalies/${a.id}`}
                    className="text-body bg-fill-quaternary hover:bg-fill-tertiary block rounded-lg p-3 transition-colors"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{label("FuelAnomalyType", a.type)}</span>
                      <span className="flex gap-1">
                        <StatusBadge kind="FuelAnomalySeverity" value={a.severity} />
                        <StatusBadge kind="FuelAnomalyStatus" value={a.status} />
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-1 block">{a.explanation}</span>
                    <span className="text-muted-foreground text-footnote mt-1 block">
                      {a.vehicle.plateNumber} · {formatDateTime(a.detectedAt)} · балл {a.score}
                      {a.isDemo && " · DEMO"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Расследования</CardTitle>
        </CardHeader>
        <CardContent>
          {investigations.length === 0 ? (
            <p className="text-muted-foreground text-body">Расследований нет. Открыть расследование можно со страницы несоответствия.</p>
          ) : (
            <ul className="space-y-2">
              {investigations.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/fuel/investigations/${i.id}`}
                    className="text-body bg-fill-quaternary hover:bg-fill-tertiary block rounded-lg p-3 transition-colors"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i.title}</span>
                      <StatusBadge kind="FuelInvestigationStatus" value={i.status} />
                    </span>
                    <span className="text-muted-foreground text-footnote">
                      {i.vehicle.plateNumber} · несоответствий: {i._count.anomalies} · комментариев: {i._count.comments} ·{" "}
                      {formatDateTime(i.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const k = dash.kpi;
  return (
    <>
      <PageHeader
        title="Топливо"
        description="Заправки, карты, расход и проверки: деньги → карта → автомобиль → водитель → GPS → уровень топлива → рейс"
        actions={
          canManage && demo ? (
            <SimulateRefuelDialog
              cards={cards
                .filter((c) => c.isDemo && c.status === "ACTIVE")
                .map((c) => ({ id: c.id, label: `${c.label} · ${c.vehicle?.plateNumber ?? "без авто"}` }))}
              stations={DEMO_STATIONS}
            />
          ) : undefined
        }
      />
      {demo && <DemoBanner />}
      <FilterBar
        fields={[
          { type: "date", name: "from", label: "С" },
          { type: "date", name: "to", label: "По" },
          { type: "select", name: "vehicleId", label: "Автомобиль", options: vehicleOpts.map((v) => ({ value: v.id, label: v.label })) },
          { type: "select", name: "driverId", label: "Водитель", options: driverOpts.map((d) => ({ value: d.id, label: d.label })) },
          { type: "select", name: "fuelType", label: "Топливо", options: enumOptions("FuelType") },
          { type: "text", name: "station", label: "АЗС", placeholder: "Название" },
          { type: "select", name: "status", label: "Статус", options: enumOptions("FuelTransactionStatus") },
          { type: "select", name: "match", label: "Сопоставление", options: enumOptions("FuelMatchStatus") },
        ]}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6" data-testid="fuel-kpi">
        <KpiCard
          label="Расходы"
          icon={Receipt}
          value={k.spend ? (k.spend.length ? k.spend.map((s) => formatMoney(s.amount, s.currency)).join(" · ") : "0") : "—"}
          hint={k.spend ? "за период" : "нет доступа к финансам"}
        />
        <KpiCard label="Литры" icon={Droplets} value={`${k.liters.toLocaleString("ru-RU")} л`} tone="info" />
        <KpiCard
          label="Средний расход"
          icon={Gauge}
          value={k.avgPer100Km != null ? `${k.avgPer100Km} л/100 км` : "нет данных"}
          hint={k.distanceKm ? `пробег ${k.distanceKm.toLocaleString("ru-RU")} км (одометр)` : "нужна телематика с одометром"}
        />
        <KpiCard
          label="Стоимость / км"
          icon={Route}
          value={k.costPerKm?.length ? k.costPerKm.map((c) => formatMoney(c.amount, c.currency)).join(" · ") : "нет данных"}
        />
        <KpiCard label="Заправок" icon={Fuel} value={k.refuels} />
        <KpiCard
          label="Несоответствия"
          icon={AlertTriangle}
          value={k.anomalies}
          tone={k.anomalies ? "danger" : "success"}
          href="/fuel?tab=checks"
        />
      </div>
      <UrlTabs
        defaultTab="overview"
        tabs={[
          { value: "overview", label: "Автопарк", content: overview },
          { value: "transactions", label: `Заправки (${txs.total})`, content: transactions },
          { value: "cards", label: `Карты (${cards.length})`, content: cardsTab },
          { value: "account", label: "Топливный счёт", content: accountTab, hidden: !canFinance },
          { value: "checks", label: openAnomalies.length ? `Проверки (${openAnomalies.length})` : "Проверки", content: checks },
        ]}
      />
      <p className="text-muted-foreground text-footnote mt-6 flex items-center gap-1.5">
        <Truck className="size-3.5" aria-hidden /> Несоответствие — это сигнал для проверки, а не вывод о нарушении. Решение принимает
        владелец.
      </p>
    </>
  );
}
