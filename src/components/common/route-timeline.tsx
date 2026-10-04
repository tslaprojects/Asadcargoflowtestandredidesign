import { countryName } from "@/lib/geo/countries";
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

/** Код страны рядом с городом: мелко и приглушённо, без эмодзи-флагов. */
function CountryCode({ code }: { code: string }) {
  return <span className="text-caption text-tertiary-foreground font-medium tracking-wide">{code}</span>;
}

/**
 * Цепочка маршрута: Урумчи CN → Алматы KZ → Москва RU.
 * compact — только начало и конец, промежуточные точки — счётчиком «+2» (полный маршрут — в подсказке и для скринридера).
 */
export function RouteChain({ stops, className, compact }: { stops: Stop[]; className?: string; compact?: boolean }) {
  const collapsed = compact && stops.length > 2;
  const shown = collapsed ? [stops[0], stops[stops.length - 1]] : stops;
  const full = stops.map((s) => s.city).join(" → ");
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5", className)} title={collapsed ? full : undefined}>
      {shown.map((s, i) => (
        <span key={`${s.city}-${i}`} className="inline-flex items-baseline gap-1.5" aria-hidden>
          {i > 0 && <span className="text-tertiary-foreground">→</span>}
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span>{s.city}</span>
            <CountryCode code={s.country} />
          </span>
        </span>
      ))}
      {collapsed && (
        <span className="text-footnote text-muted-foreground num" aria-hidden>
          +{stops.length - 2}
        </span>
      )}
      <span className="sr-only">Маршрут: {stops.map((s) => `${s.city}, ${countryName(s.country)}`).join(" — ")}</span>
    </span>
  );
}

/** Маршрут по точкам, как маршрут в Картах: даты в часовом поясе точки и контакты. */
export function RouteTimeline({ stops, showContacts = true }: { stops: Stop[]; showContacts?: boolean }) {
  return (
    <ol className="relative">
      {stops.map((s, i) => {
        const last = i === stops.length - 1;
        const dot =
          s.type === "PICKUP"
            ? "border-primary bg-card border-[3px]"
            : s.type === "DELIVERY"
              ? "bg-success"
              : s.type === "BORDER"
                ? "bg-warning"
                : "bg-neutral";
        return (
          <li key={`${s.city}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className="bg-border-strong absolute top-4 bottom-0 left-[5px] w-0.5 rounded-full" aria-hidden />}
            <span className={cn("relative mt-[0.3125rem] size-3 shrink-0 rounded-full", dot)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-footnote text-muted-foreground">{label("StopType", s.type)}</p>
              <p className="font-medium">
                {s.city}, {countryName(s.country)}
              </p>
              {s.fullAddress && <p className="text-subheadline text-muted-foreground">{s.fullAddress}</p>}
              {s.plannedDateFrom && (
                <p className="text-subheadline num">
                  {formatDateTime(s.plannedDateFrom, s.timezone ?? undefined)}
                  {s.plannedDateTo && ` — ${formatDateTime(s.plannedDateTo, s.timezone ?? undefined)}`}
                  {s.timezone && <span className="text-muted-foreground"> · местное время, {s.timezone}</span>}
                </p>
              )}
              {showContacts && (s.contactName || s.contactPhone) && (
                <p className="text-subheadline text-muted-foreground">
                  {s.contactName}{" "}
                  {s.contactPhone && (
                    <a className="text-link hover:underline" href={`tel:${s.contactPhone}`}>
                      {s.contactPhone}
                    </a>
                  )}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
