"use client";
import * as React from "react";

type Point = { at: string | Date; liters: number };
type Refuel = { at: string | Date; liters: number; alert: boolean };

const W = 720;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

const fmtTime = (d: Date) =>
  d.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Уровень топлива во времени: одна линия (2px), одна ось, приглушённая сетка, подсказка при наведении.
 * Точки заправок — маркеры 8px с кольцом цвета фона; цвет дублируется подписью в подсказке.
 */
export function FuelLevelChart({ points, refuels, capacity }: { points: Point[]; refuels: Refuel[]; capacity: number | null }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const data = points.map((p) => ({ t: new Date(p.at).getTime(), v: p.liters }));
  if (data.length < 2) return <p className="text-muted-foreground text-body">Недостаточно показаний уровня топлива для графика.</p>;
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const yMax = Math.max(capacity ?? 0, ...data.map((d) => d.v)) * 1.05 || 1;
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(x(data[i].t) - px) < Math.abs(x(data[best].t) - px)) best = i;
    setHover(best);
  };
  const h = hover != null ? data[hover] : null;
  return (
    <figure className="relative" aria-label="График уровня топлива">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted-foreground)">
              {v}
            </text>
          </g>
        ))}
        {capacity ? (
          <text x={W - PAD.right} y={y(capacity) - 4} textAnchor="end" fontSize={11} fill="var(--color-muted-foreground)">
            ёмкость бака {capacity} л
          </text>
        ) : null}
        <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--color-muted-foreground)">
          {fmtTime(new Date(t0))}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={11} fill="var(--color-muted-foreground)">
          {fmtTime(new Date(t1))}
        </text>
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {refuels
          .filter((r) => new Date(r.at).getTime() >= t0 && new Date(r.at).getTime() <= t1)
          .map((r, i) => {
            const t = new Date(r.at).getTime();
            const near = data.reduce((a, d) => (Math.abs(d.t - t) < Math.abs(a.t - t) ? d : a), data[0]);
            return (
              <circle
                key={i}
                cx={x(t)}
                cy={y(near.v)}
                r={5}
                fill={r.alert ? "#c2410c" : "#15803d"}
                stroke="var(--color-card)"
                strokeWidth={2}
              >
                <title>{`Заправка ${r.liters} л · ${fmtTime(new Date(r.at))}${r.alert ? " · требуется проверка" : ""}`}</title>
              </circle>
            );
          })}
        {h && (
          <g>
            <line
              x1={x(h.t)}
              x2={x(h.t)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={x(h.t)} cy={y(h.v)} r={4} fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="bg-card text-card-foreground text-footnote pointer-events-none absolute top-1 rounded-md px-2 py-1 shadow"
          style={{ left: `${Math.min(80, (x(h.t) / W) * 100)}%` }}
        >
          <p className="font-semibold">{Math.round(h.v)} л</p>
          <p className="text-muted-foreground">{fmtTime(new Date(h.t))}</p>
        </div>
      )}
    </figure>
  );
}
