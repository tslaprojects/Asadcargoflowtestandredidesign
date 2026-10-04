import Link from "next/link";
import { MoneyDisplay } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONSUMPTION_METHOD_LABELS, type Consumption } from "@/lib/fuel/consumption";
import { formatDateTime } from "@/lib/format";
import { DeviationText, Metric } from "./fuel-ui";

type Report = {
  route: string;
  finished: boolean;
  liters: number;
  cost: { currency: string; amount: number }[];
  refuels: number;
  anomalies: number;
  consumption: Consumption | null;
  norm: number | null;
  deviationPct: number | null;
  vehicle: { id: string; plateNumber: string } | null;
  transactions: {
    id: string;
    transactionDate: Date | string;
    stationName: string;
    liters: number;
    status: string;
    matchStatus: string;
    driver: { fullName: string } | null;
  }[];
};

/** Fuel Report по рейсу: маршрут, расстояние, литры, расход, стоимость, норма, отклонение, заправки, несоответствия. */
export function TripFuelReport({ r, canFinance }: { r: Report; canFinance: boolean }) {
  const c = r.consumption;
  const tiles: [string, React.ReactNode][] = [
    ["Маршрут", r.route],
    [
      "Расстояние",
      c?.distanceKm != null ? (
        <>
          <Metric value={Math.round(c.distanceKm)} unit="км" />
          <span className="text-muted-foreground text-footnote block">
            {c.distanceSource === "ODOMETER" ? "по одометру" : "оценка по маршруту"}
          </span>
        </>
      ) : (
        <Metric value={null} />
      ),
    ],
    ["Топливо (заправки)", `${r.liters.toLocaleString("ru-RU")} л`],
    [
      "Средний расход",
      <>
        <Metric value={c?.per100Km} unit="л/100 км" />
        {c?.method && <span className="text-muted-foreground text-footnote block">{CONSUMPTION_METHOD_LABELS[c.method]}</span>}
      </>,
    ],
    [
      "Стоимость",
      canFinance
        ? r.cost.length
          ? r.cost.map((x) => <MoneyDisplay key={x.currency} amount={x.amount} currency={x.currency} />)
          : "0"
        : "нет доступа",
    ],
    ["Норма", <Metric key="n" value={r.norm} unit="л/100 км" na="не задана" />],
    ["Отклонение", <DeviationText key="d" pct={r.deviationPct} />],
    ["Заправок / несоответствий", `${r.refuels} / ${r.anomalies}`],
  ];
  return (
    <div className="space-y-5" data-testid="trip-fuel-report">
      <Card>
        <CardHeader>
          <CardTitle>Отчёт по топливу {r.finished ? "" : "(рейс ещё идёт)"}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map(([k, v]) => (
              <div key={k} className="bg-fill-quaternary rounded-lg p-3">
                <dt className="text-muted-foreground text-footnote">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Заправки рейса</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {r.transactions.length === 0 ? (
            <p className="text-muted-foreground text-body">Заправок по этому рейсу нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Время</TableHead>
                  <TableHead>АЗС</TableHead>
                  <TableHead>Литры</TableHead>
                  <TableHead>Водитель</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDateTime(t.transactionDate)}</TableCell>
                    <TableCell>{t.stationName}</TableCell>
                    <TableCell>{t.liters} л</TableCell>
                    <TableCell>{t.driver?.fullName ?? "—"}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        <StatusBadge kind="FuelTransactionStatus" value={t.status} />
                        {t.status !== "DECLINED" && <StatusBadge kind="FuelMatchStatus" value={t.matchStatus} />}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {r.vehicle && (
            <Link href={`/fuel/vehicles/${r.vehicle.id}`} className="text-link text-body mt-3 inline-block hover:underline">
              Топливо автомобиля {r.vehicle.plateNumber} →
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
