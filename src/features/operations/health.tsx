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

const DOT: Record<Health, string> = {
  moving: "bg-[var(--map-moving)]",
  arriving: "bg-[#0e7490]",
  delayed: "bg-[var(--map-delayed)]",
  waiting: "bg-[var(--map-waiting)]",
  attention: "bg-destructive",
  done: "bg-[var(--map-done)]",
  cancelled: "bg-neutral",
};

/** Точка состояния объекта (в списках, рядом с номером). Не единственный носитель смысла — рядом всегда текст. */
export function HealthDot({ health, live, className }: { health: Health; live?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        DOT[health],
        live && (health === "moving" || health === "arriving") && "animate-live-pulse text-[var(--map-moving)]",
        className,
      )}
    />
  );
}

/** Операционное состояние: «В движении», «Опаздывает», «Ожидание»… */
export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  const meta = HEALTH_META[health];
  const Icon = ICONS[health];
  return (
    <Badge tone={meta.tone} className={className} data-health={health}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

/**
 * Операционный индикатор: компактное число с подписью (не KPI-карточка).
 * Если передан onClick — работает как фильтр (aria-pressed).
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
      <span className={cn("text-metric flex items-center gap-1.5", health === "delayed" && value > 0 && "text-delayed")}>
        {health && <HealthDot health={health} />}
        {value}
      </span>
      <span className="text-muted-foreground w-full truncate text-[0.6875rem] leading-4 font-medium">{label}</span>
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col items-start rounded-md px-1.5 py-1 text-left transition-colors duration-150",
    onClick && "hover:bg-muted",
    active && "bg-accent ring-primary/30 ring-1",
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
