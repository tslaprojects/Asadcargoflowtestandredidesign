import { formatDistanceKm, formatDuration } from "@/lib/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type RouteSummary = {
  routeDistanceKm: number | null;
  routeDurationMin: number | null;
  routeSource: "PROVIDER" | "ESTIMATE" | null;
};

/** Текст километража: «1 240 км» или «≈ 1 240 км (оценка)». null — маршрута нет. */
export function routeDistanceText(r: RouteSummary): string | null {
  if (r.routeDistanceKm == null) return null;
  const km = formatDistanceKm(r.routeDistanceKm);
  return r.routeSource === "PROVIDER" ? t("route.distance", { km }) : t("route.estimate", { km });
}

/**
 * Километраж и время в пути маршрута груза. Для оценки — «≈ … (оценка)» и пояснение во всплывающей подсказке.
 * compact — без времени в пути (строки списков).
 */
export function RouteDistance({ route, compact, className }: { route: RouteSummary; compact?: boolean; className?: string }) {
  const text = routeDistanceText(route);
  if (!text) return null;
  const estimate = route.routeSource !== "PROVIDER";
  return (
    <span
      data-testid="route-distance"
      data-route-source={route.routeSource ?? "NONE"}
      title={estimate ? t("route.estimateHint") : t("route.providerHint")}
      className={cn("num inline-flex items-baseline gap-1 whitespace-nowrap", className)}
    >
      <span>{text}</span>
      {!compact && route.routeDurationMin != null && (
        <span className="text-muted-foreground">· {t("route.duration", { duration: formatDuration(route.routeDurationMin) })}</span>
      )}
    </span>
  );
}
