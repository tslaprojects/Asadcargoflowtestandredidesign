"use client";
import * as React from "react";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LiveObject } from "@/server/services/operations.service";
import { HealthDot } from "./health";

/** Срок для строки списка: для движущихся — плановая доставка, до загрузки — дата загрузки. */
export function etaLabel(o: Pick<LiveObject, "health" | "deliveryDate" | "loadingDate" | "progress">) {
  if (o.health === "done") return "доставлено";
  if (o.progress > 0 || o.health === "delayed" || o.health === "arriving")
    return o.deliveryDate ? `до ${formatShortDate(o.deliveryDate)}` : "—";
  return o.loadingDate ? `загр. ${formatShortDate(o.loadingDate)}` : "—";
}

/**
 * Список живых объектов (перевозок): состояние, маршрут, статус, машина, водитель, срок.
 * Выбор строки открывает контекстную панель и показывает объект на карте.
 */
export function ShipmentList({
  objects,
  selectedId,
  onSelect,
  className,
}: {
  objects: LiveObject[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("divide-border divide-y", className)} data-testid="shipment-list">
      {objects.map((o, i) => {
        const selected = o.id === selectedId;
        return (
          <li key={o.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
            <button
              type="button"
              onClick={() => onSelect(o.id)}
              aria-pressed={selected}
              data-testid="shipment-row"
              className={cn(
                "relative block w-full px-4 py-2.5 text-left transition-colors duration-150",
                selected ? "bg-accent" : "hover:bg-surface-secondary",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "bg-primary absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full transition-opacity duration-150",
                  selected ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="flex items-center gap-2">
                <HealthDot health={o.health} live={selected} />
                <span className="id-code text-muted-foreground text-xs font-medium">{o.publicNumber}</span>
                <span className={cn("text-meta ml-auto", o.health === "delayed" && "text-delayed font-medium")}>{etaLabel(o)}</span>
              </span>
              <span className="mt-0.5 block truncate text-sm leading-5 font-semibold">
                {o.origin} <span className="text-muted-foreground font-normal">→</span> {o.destination}
              </span>
              <span className="text-muted-foreground block truncate text-xs leading-4">
                {o.statusLabel}
                {o.vehicle && <> · {o.vehicle.plateNumber}</>}
                {o.driver && <> · {o.driver.fullName}</>}
              </span>
              {o.progress > 0 && o.progress < 1 && (
                <span className="bg-muted mt-1.5 block h-0.5 overflow-hidden rounded-full" aria-hidden>
                  <span
                    className={cn("block h-full rounded-full", o.health === "delayed" ? "bg-delayed" : "bg-primary")}
                    style={{ width: `${Math.round(o.progress * 100)}%` }}
                  />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
