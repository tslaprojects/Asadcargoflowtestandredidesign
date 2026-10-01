import { AlertTriangle, CheckCircle2, FlaskConical, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Пометка демонстрационных данных — симуляция никогда не выдаётся за реальные показания. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={cn("gap-1 font-semibold tracking-wide", className)} data-testid="demo-data">
      <FlaskConical className="size-3.5" aria-hidden /> DEMO DATA
    </Badge>
  );
}

export function DemoBanner() {
  return (
    <div
      className="border-warning-border bg-warning-bg/60 mb-4 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
      role="note"
    >
      <DemoBadge />
      <span>Демо-режим: топливные карты, заправки и телематика симулированы. Реальные деньги, топливо и устройства не участвуют.</span>
    </div>
  );
}

const HEALTH = {
  OK: { tone: "success" as const, icon: CheckCircle2, label: "Норма" },
  ATTENTION: { tone: "warning" as const, icon: AlertTriangle, label: "Расход выше нормы" },
  CHECK: { tone: "danger" as const, icon: ShieldQuestion, label: "Требуется проверка" },
};

export function FuelHealthBadge({ health }: { health: keyof typeof HEALTH }) {
  const h = HEALTH[health];
  return (
    <Badge tone={h.tone} className="gap-1">
      <h.icon className="size-3.5" aria-hidden /> {h.label}
    </Badge>
  );
}

/** Значение показателя или честное «нет данных» (NOT_AVAILABLE). */
export function Metric({
  value,
  unit,
  na = "нет данных",
  className,
}: {
  value: number | string | null | undefined;
  unit?: string;
  na?: string;
  className?: string;
}) {
  if (value == null || value === "") return <span className={cn("text-muted-foreground", className)}>{na}</span>;
  const text = typeof value === "number" ? value.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : value;
  return (
    <span className={cn("tabular", className)}>
      {text}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

export function DeviationText({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">нет данных</span>;
  const tone = pct > 10 ? "text-danger" : pct > 0 ? "text-warning" : "text-success";
  return (
    <span className={cn("tabular font-medium", tone)}>
      {pct > 0 ? "+" : ""}
      {pct.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** Уровень топлива: полоса заполнения бака. */
export function TankGauge({ liters, capacity }: { liters: number | null; capacity: number | null }) {
  if (liters == null) return <Metric value={null} />;
  const pct = capacity ? Math.max(0, Math.min(100, (liters / capacity) * 100)) : null;
  return (
    <div className="space-y-1">
      <p className="text-lg font-semibold">
        <Metric value={Math.round(liters)} unit="л" />
        {capacity ? <span className="text-muted-foreground text-sm font-normal"> из {capacity.toLocaleString("ru-RU")} л</span> : null}
      </p>
      {pct != null && (
        <div
          className="bg-muted h-2 w-full overflow-hidden rounded-full"
          role="meter"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Уровень топлива"
        >
          <div className={cn("h-full rounded-full", pct < 15 ? "bg-danger" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
