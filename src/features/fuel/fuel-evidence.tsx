import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";

type Point = {
  recordedAt: Date | string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  engineOn: boolean | null;
  odometerKm: number | null;
  fuelLevelLiters: number | null;
  fuelLevelSource: string | null;
  positionSource?: string;
};

type Checks = {
  gps: { status: string; distanceKm?: number; positionAt?: string; positionSource?: string };
  fuelLevel: { status: string; before?: number; after?: number; delta?: number; source?: string; diff?: number };
  tank: { status: string; capacity?: number };
  frequency: { status: string; minutesSincePrevious?: number };
  route: { status: string; distanceKm?: number };
};

const na = <span className="text-muted-foreground">нет данных — проверка не выполнялась</span>;

/** Какие проверки выполнены и на каких данных (NOT_AVAILABLE показывается честно). */
export function AnalysisChecks({ checks, liters }: { checks: Checks | null; liters: number }) {
  if (!checks) return <p className="text-muted-foreground text-sm">Анализ ещё не выполнен.</p>;
  const rows: [string, React.ReactNode][] = [
    [
      "GPS автомобиля",
      checks.gps.status === "AVAILABLE" ? (
        <>
          в {checks.gps.distanceKm} км от АЗС{checks.gps.positionAt ? ` (${formatDateTime(checks.gps.positionAt)}` : ""}
          {checks.gps.positionSource
            ? `, ${checks.gps.positionSource === "DRIVER_APP" ? "приложение водителя" : label("TelemetrySource", checks.gps.positionSource)})`
            : checks.gps.positionAt
              ? ")"
              : ""}
        </>
      ) : (
        na
      ),
    ],
    [
      "Уровень топлива",
      checks.fuelLevel.status === "AVAILABLE" ? (
        <>
          до {checks.fuelLevel.before} л → после {checks.fuelLevel.after} л (прирост {checks.fuelLevel.delta} л при заправке {liters} л;
          расхождение {checks.fuelLevel.diff} л) · {checks.fuelLevel.source ? label("FuelLevelSource", checks.fuelLevel.source) : ""}
        </>
      ) : (
        na
      ),
    ],
    [
      "Ёмкость бака",
      checks.tank.status === "AVAILABLE" ? (
        `${checks.tank.capacity} л`
      ) : (
        <span className="text-muted-foreground">не указана владельцем</span>
      ),
    ],
    [
      "Частота заправок",
      checks.frequency.minutesSincePrevious != null
        ? `предыдущая — ${checks.frequency.minutesSincePrevious} мин назад`
        : "повторных заправок рядом по времени нет",
    ],
    [
      "Маршрут рейса",
      checks.route.status === "AVAILABLE" ? (
        `АЗС в ${checks.route.distanceKm} км от маршрута`
      ) : (
        <span className="text-muted-foreground">заправка не привязана к рейсу</span>
      ),
    ],
  ];
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]" data-testid="analysis-checks">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TelemetryTable({ points }: { points: Point[] }) {
  if (!points.length) return <p className="text-muted-foreground text-sm">Показаний телематики за этот период нет.</p>;
  return (
    <div className="max-h-80 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Время</TableHead>
            <TableHead>Позиция</TableHead>
            <TableHead>Скорость</TableHead>
            <TableHead>Двигатель</TableHead>
            <TableHead>Уровень</TableHead>
            <TableHead>Источник</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((p, i) => (
            <TableRow key={i}>
              <TableCell className="whitespace-nowrap">{formatDateTime(p.recordedAt)}</TableCell>
              <TableCell>{p.latitude != null ? `${p.latitude.toFixed(4)}, ${p.longitude!.toFixed(4)}` : "—"}</TableCell>
              <TableCell>{p.speedKmh != null ? `${Math.round(p.speedKmh)} км/ч` : "—"}</TableCell>
              <TableCell>{p.engineOn == null ? "—" : p.engineOn ? "вкл" : "выкл"}</TableCell>
              <TableCell>
                {p.fuelLevelLiters != null
                  ? `${Math.round(p.fuelLevelLiters)} л (${p.fuelLevelSource === "FUEL_SENSOR" ? "датчик" : "CAN"})`
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {p.positionSource === "DRIVER_APP"
                  ? "приложение водителя"
                  : p.positionSource
                    ? label("TelemetrySource", p.positionSource)
                    : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
