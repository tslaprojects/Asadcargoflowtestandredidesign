import { AlertTriangle, CheckCircle2, Clock, Navigation, PauseCircle, Timer, Ban, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HEALTH_META, type Health } from "@/lib/operations";
import { cn } from "@/lib/utils";

const ICONS: Record<Health, LucideIcon> = {
  moving: Navigation,
  arriving: Timer,
  delayed: AlertTriangle,
  waiting: Clock,
  attention: PauseCircle,
  done: CheckCircle2,
  cancelled: Ban,
};

/** Цвета точек — те же переменные темы, что и у маркеров карты (globals.css, --map-*). */
const DOT: Record<Health, string> = {
  moving: "bg-[var(--map-moving)] text-[var(--map-moving)]",
  arriving: "bg-[var(--map-arriving)] text-[var(--map-arriving)]",
  delayed: "bg-[var(--map-delayed)]",
  waiting: "bg-[var(--map-waiting)]",
  attention: "bg-[var(--map-attention)]",
  done: "bg-[var(--map-done)]",
  cancelled: "bg-[var(--map-cancelled)]",
};

/** Точка состояния объекта (в списках, рядом с маршрутом). Не единственный носитель смысла — рядом всегда текст. */
export function HealthDot({ health, live, className }: { health: Health; live?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        DOT[health],
        live && (health === "moving" || health === "arriving") && "animate-live-pulse",
        className,
      )}
    />
  );
}

/** Операционное состояние: «В движении», «Опаздывает», «Ожидание»… — тонированная капсула. */
export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  const meta = HEALTH_META[health];
  const Icon = ICONS[health];
  return (
    <Badge tone={meta.tone} className={cn("h-6 rounded-full px-2", className)} data-health={health}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

/**
 * Сегмент сводки: число и подпись. С onClick — фильтр (aria-pressed), выбранный — с белым бегунком.
 */
export function OperationalMetric({
  label,
  value,
  health,
  active,
  onClick,
  testId,
}: {
  label: string;
  value: number;
  health?: Health;
  active?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const content = (
    <>
      <span className={cn("text-headline num flex items-center gap-1 leading-5", health === "delayed" && value > 0 && "text-delayed")}>
        {health && <HealthDot health={health} className="size-1.5" />}
        {value}
      </span>
      <span className="text-caption text-muted-foreground w-full truncate">{label}</span>
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col items-center rounded-[0.4375rem] px-1 py-1 text-center transition-[background-color,box-shadow] duration-(--duration-standard)",
    onClick && !active && "hover:bg-fill-quaternary",
    active && "bg-segment-thumb shadow-control",
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls} data-testid={testId}>
      {content}
    </button>
  ) : (
    <div className={cls} data-testid={testId}>
      {content}
    </div>
  );
}
