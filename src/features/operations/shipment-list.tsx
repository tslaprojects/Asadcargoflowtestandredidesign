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
 * Список перевозок, как список писем в Mail: маршрут жирным, номер и статус, машина и водитель,
 * срок справа. Выбранная строка залита акцентом.
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
    <ul className={cn("px-2 pb-2", className)} data-testid="shipment-list">
      {objects.map((o, i) => {
        const selected = o.id === selectedId;
        const prevSelected = i > 0 && objects[i - 1].id === selectedId;
        return (
          <li key={o.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}>
            <button
              type="button"
              onClick={() => onSelect(o.id)}
              aria-pressed={selected}
              data-testid="shipment-row"
              className={cn(
                "relative block w-full rounded-md px-2.5 text-left transition-colors duration-(--duration-micro)",
                selected ? "bg-selection text-selection-foreground" : "hover:bg-fill-quaternary",
              )}
            >
              <span className={cn("block py-2.5", i > 0 && !selected && !prevSelected && "hairline-t")}>
                <span className="flex items-center gap-2">
                  <HealthDot health={o.health} live={selected} className={cn(selected && "ring-selection-foreground/80 ring-2")} />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {o.origin} <span className={cn("font-normal", selected ? "opacity-75" : "text-muted-foreground")}>→</span>{" "}
                    {o.destination}
                  </span>
                  <span
                    className={cn(
                      "text-footnote num shrink-0",
                      selected ? "opacity-85" : o.health === "delayed" ? "text-delayed font-medium" : "text-muted-foreground",
                    )}
                  >
                    {etaLabel(o)}
                  </span>
                </span>
                <span className={cn("text-footnote mt-0.5 block truncate pl-4", selected ? "opacity-85" : "text-muted-foreground")}>
                  <span className="id-code">{o.publicNumber}</span> · {o.statusLabel}
                  {o.vehicle && <> · {o.vehicle.plateNumber}</>}
                  {o.driver && <> · {o.driver.fullName}</>}
                </span>
                {o.progress > 0 && o.progress < 1 && (
                  <span
                    className={cn("mt-1.5 ml-4 block h-[3px] overflow-hidden rounded-full", selected ? "bg-white/30" : "bg-fill-secondary")}
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        selected ? "bg-selection-foreground" : o.health === "delayed" ? "bg-delayed" : "bg-primary",
                      )}
                      style={{ width: `${Math.round(o.progress * 100)}%` }}
                    />
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
