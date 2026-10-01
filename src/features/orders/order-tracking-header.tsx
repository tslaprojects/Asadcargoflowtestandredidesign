import { CalendarClock, Clock3, MapPin, Navigation, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { countryFlag } from "@/lib/geo/countries";
import { roadKm } from "@/lib/geo/distance";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { ORDER_PHASE_LABELS, type OrderProgress } from "@/lib/state-machine/order-progress";
import { cn } from "@/lib/utils";
import { MapView, type MapPoint } from "@/features/tracking/map-view";

type Stop = { city: string; country: string; latitude: number | null; longitude: number | null };
type Location = { latitude: number | null; longitude: number | null; createdAt: Date | string } | null;

const DAY = 86_400_000;

function daysFromNow(d: Date | string) {
  const target = new Date(d);
  const today = new Date();
  const a = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((a - b) / DAY);
}

function Fact({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "warning";
  testId?: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className={cn("mt-1 text-sm leading-5 font-medium", tone === "warning" && "text-warning")}>{value}</dd>
      {hint && <dd className="text-muted-foreground mt-0.5 text-xs leading-4">{hint}</dd>}
    </div>
  );
}

/**
 * Шапка отслеживания перевозки: где груз, какой этап, когда будет, что дальше.
 * Map + Status + Progress + Key facts — вместо карты, спрятанной во вкладке.
 * ETA не выдумывается: показывается плановая дата доставки и честное предупреждение, если срок прошёл.
 */
export function OrderTrackingHeader({
  progress,
  stops,
  lastLocation,
  loadingDate,
  deliveryDate,
  vehicle,
  driver,
  points,
}: {
  progress: OrderProgress;
  stops: Stop[];
  lastLocation: Location;
  loadingDate: Date | string | null;
  deliveryDate: Date | string | null;
  vehicle: { make: string; model: string; plateNumber: string } | null;
  driver: { fullName: string; phone: string } | null;
  points: MapPoint[];
}) {
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const current = progress.currentIndex >= 0 ? progress.steps[progress.currentIndex] : null;
  const moving = progress.phase === "LOADING" || progress.phase === "TRANSIT" || progress.phase === "DELIVERY";
  const finished = progress.phase === "DONE" || progress.phase === "CANCELLED";

  const hasPosition = lastLocation?.latitude != null && lastLocation.longitude != null;
  const remainingKm =
    hasPosition && destination?.latitude != null && destination.longitude != null && moving
      ? roadKm({ lat: lastLocation!.latitude!, lng: lastLocation!.longitude! }, { lat: destination.latitude, lng: destination.longitude })
      : null;

  const dueIn = deliveryDate ? daysFromNow(deliveryDate) : null;
  const overdue = dueIn !== null && dueIn < 0 && !finished && progress.steps[progress.currentIndex]?.key !== "delivered";
  const dueHint =
    dueIn === null || finished
      ? null
      : overdue
        ? `плановый срок прошёл ${Math.abs(dueIn)} дн. назад`
        : dueIn === 0
          ? "сегодня"
          : dueIn > 0
            ? `через ${dueIn} дн.`
            : null;

  const percent = progress.percent;
  const showMap = points.length > 0 && !finished;

  return (
    <Card className="overflow-hidden" data-testid="order-tracking">
      <div className={cn("grid", showMap && "lg:grid-cols-[minmax(0,1fr)_minmax(280px,38%)]")}>
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-overline">{ORDER_PHASE_LABELS[progress.phase]}</p>
            {current && (
              <p className="text-sm">
                <span className="text-muted-foreground">Сейчас: </span>
                <span className="font-semibold">{current.label}</span>
                {progress.currentNote && <span className="text-muted-foreground"> · {progress.currentNote}</span>}
              </p>
            )}
          </div>

          {/* Прогресс по маршруту: откуда → куда, заполнение и маркер машины */}
          <div>
            <div className="flex items-end justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="text-muted-foreground block text-xs">Откуда</span>
                <span className="font-semibold">
                  <span aria-hidden>{countryFlag(origin?.country)} </span>
                  {origin?.city}
                </span>
              </span>
              <span className="min-w-0 text-right">
                <span className="text-muted-foreground block text-xs">Куда</span>
                <span className="font-semibold">
                  <span aria-hidden>{countryFlag(destination?.country)} </span>
                  {destination?.city}
                </span>
              </span>
            </div>
            <div
              className="relative mt-3 h-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={`Выполнено этапов: ${percent}%`}
            >
              <div className="bg-muted absolute inset-0 rounded-full" />
              <div
                className={cn(
                  "animate-progress-grow absolute inset-y-0 left-0 origin-left rounded-full",
                  progress.phase === "CANCELLED"
                    ? "bg-neutral"
                    : progress.phase === "PAUSED"
                      ? "bg-danger"
                      : finished
                        ? "bg-success"
                        : "bg-primary",
                )}
                style={{ width: `${percent}%` }}
              />
              {moving && (
                <span
                  className="bg-card border-primary text-primary absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 shadow-sm transition-[left] duration-(--duration-complex)"
                  style={{ left: `${Math.min(Math.max(percent, 3), 97)}%` }}
                  aria-hidden
                >
                  <Truck className="size-3" />
                </span>
              )}
            </div>
            <p className="text-muted-foreground num mt-2 text-xs">
              {progress.steps.filter((s) => s.state === "done").length} из {progress.steps.length} этапов
              {progress.nextLabel && !finished && <> · далее: {progress.nextLabel}</>}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 xl:grid-cols-4">
            <Fact
              icon={MapPin}
              label="Последняя позиция"
              testId="tracking-last-position"
              value={hasPosition ? formatRelative(lastLocation!.createdAt) : "нет данных"}
              hint={
                remainingKm !== null
                  ? `≈ ${formatNumber(Math.round(remainingKm))} км до ${destination?.city}`
                  : hasPosition
                    ? undefined
                    : "водитель ещё не передавал геопозицию"
              }
            />
            <Fact
              icon={CalendarClock}
              label="Плановая доставка"
              value={deliveryDate ? <span className="num">{formatDate(deliveryDate)}</span> : "не указана"}
              hint={dueHint}
              tone={overdue ? "warning" : undefined}
            />
            <Fact
              icon={Clock3}
              label="Загрузка"
              value={loadingDate ? <span className="num">{formatDate(loadingDate)}</span> : "не указана"}
            />
            <Fact
              icon={Navigation}
              label="Транспорт"
              value={vehicle ? <span className="id-code">{vehicle.plateNumber}</span> : "не назначен"}
              hint={driver ? driver.fullName : vehicle ? "водитель не назначен" : undefined}
            />
          </dl>
        </div>
        {showMap && (
          <div className="border-border min-h-56 border-t lg:border-t-0 lg:border-l">
            <MapView points={points} className="bg-muted h-full min-h-56 w-full" />
          </div>
        )}
      </div>
    </Card>
  );
}
