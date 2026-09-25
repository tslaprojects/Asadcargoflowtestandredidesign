import { ArrowDown, ArrowRight } from "lucide-react";
import { countryFlag, countryName } from "@/lib/geo/countries";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Stop = {
  sequence?: number;
  type: string;
  country: string;
  city: string;
  fullAddress?: string | null;
  plannedDateFrom?: Date | string | null;
  plannedDateTo?: Date | string | null;
  timezone?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
};

/** Компактная цепочка маршрута: 🇨🇳 Урумчи → 🇰🇿 Алматы → 🇷🇺 Москва */
export function RouteChain({ stops, className, compact }: { stops: Stop[]; className?: string; compact?: boolean }) {
  const shown = compact && stops.length > 3 ? [stops[0], stops[stops.length - 1]] : stops;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      {shown.map((s, i) => (
        <span key={`${s.city}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <ArrowRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />}
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span aria-hidden>{countryFlag(s.country)}</span>
            <span>{s.city}</span>
          </span>
        </span>
      ))}
      {compact && stops.length > 3 && <span className="text-muted-foreground text-xs">(+{stops.length - 2} точки)</span>}
      <span className="sr-only">Маршрут: {stops.map((s) => `${s.city}, ${countryName(s.country)}`).join(" — ")}</span>
    </span>
  );
}

/** Вертикальный маршрут со всеми точками, датами (в часовом поясе точки) и контактами. */
export function RouteTimeline({ stops, showContacts = true }: { stops: Stop[]; showContacts?: boolean }) {
  return (
    <ol className="relative space-y-0">
      {stops.map((s, i) => {
        const last = i === stops.length - 1;
        const dot =
          s.type === "PICKUP" ? "bg-primary" : s.type === "DELIVERY" ? "bg-success" : s.type === "BORDER" ? "bg-warning" : "bg-slate-400";
        return (
          <li key={`${s.city}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="bg-border absolute top-4 left-[7px] h-full w-0.5" aria-hidden />}
            <span className={cn("border-card ring-border relative mt-1 size-4 shrink-0 rounded-full border-2 ring-2", dot)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label("StopType", s.type)}</span>
                <span className="font-medium">
                  {countryFlag(s.country)} {s.city}, {countryName(s.country)}
                </span>
              </div>
              {s.fullAddress && <p className="text-muted-foreground text-sm">{s.fullAddress}</p>}
              {s.plannedDateFrom && (
                <p className="text-sm">
                  {formatDateTime(s.plannedDateFrom, s.timezone ?? undefined)}
                  {s.plannedDateTo && ` — ${formatDateTime(s.plannedDateTo, s.timezone ?? undefined)}`}
                  {s.timezone && <span className="text-muted-foreground text-xs"> (местное время, {s.timezone})</span>}
                </p>
              )}
              {showContacts && (s.contactName || s.contactPhone) && (
                <p className="text-muted-foreground text-sm">
                  {s.contactName}{" "}
                  {s.contactPhone && (
                    <a className="text-primary hover:underline" href={`tel:${s.contactPhone}`}>
                      {s.contactPhone}
                    </a>
                  )}
                </p>
              )}
            </div>
            {!last && <ArrowDown className="hidden" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
