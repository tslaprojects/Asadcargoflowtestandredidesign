"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap } from "maplibre-gl";
import * as React from "react";
import { cn } from "@/lib/utils";
import { cssColor, mapStyle, useDarkScheme } from "./map-style";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
  kind: "PICKUP" | "BORDER" | "TRANSIT" | "DELIVERY" | "VEHICLE" | "TARGET" | "CANDIDATE" | "FUEL_OK" | "FUEL_ALERT" | "FUEL_UNVERIFIED";
};

/** Линия на карте: коридор движения или маршрут груза. */
export type MapLine = { coordinates: [number, number][]; color: string; dashed?: boolean; width?: number; opacity?: number };

/**
 * Карта на MapLibre GL (open-source). Стиль задаётся NEXT_PUBLIC_MAP_STYLE_URL,
 * иначе NEXT_PUBLIC_GEOAPIFY_KEY (Geoapify), без них — тайлы OpenStreetMap (dev). Провайдер карт заменяется без изменения компонентов.
 */
/** Цвет точки по типу — из переменных темы globals.css (--map-*), с запасными значениями светлой темы. */
const POINT_COLOR: Record<MapPoint["kind"], [string, string]> = {
  PICKUP: ["--map-moving", "#007aff"],
  BORDER: ["--map-waiting", "#d99a00"],
  TRANSIT: ["--map-cancelled", "#8e8e93"],
  DELIVERY: ["--map-done", "#34c759"],
  VEHICLE: ["--map-attention", "#ff3b30"],
  TARGET: ["--map-delayed", "#ff9500"],
  CANDIDATE: ["--map-arriving", "#30b0c7"],
  // Заправки: совпадает / требует проверки / нет данных для проверки
  FUEL_OK: ["--map-done", "#34c759"],
  FUEL_ALERT: ["--map-delayed", "#ff9500"],
  FUEL_UNVERIFIED: ["--map-cancelled", "#8e8e93"],
};
const pointColor = (kind: MapPoint["kind"]) => cssColor(...POINT_COLOR[kind]);

export function MapView({
  points,
  lines,
  className,
  onPick,
  pickHint,
}: {
  points: MapPoint[];
  /** Явные линии. Если не заданы — точки маршрута соединяются одной линией. */
  lines?: MapLine[];
  className?: string;
  /** Режим выбора точки: клик по карте возвращает координаты */
  onPick?: (p: { lat: number; lng: number }) => void;
  pickHint?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const [failed, setFailed] = React.useState(false);
  // Пересоздаём карту только при реальном изменении точек
  const pointsKey = JSON.stringify({ points, lines: lines ?? null });
  const pickRef = React.useRef(onPick);
  React.useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);
  const picking = Boolean(onPick);
  const dark = useDarkScheme();

  React.useEffect(() => {
    let cancelled = false;
    const { points, lines } = JSON.parse(pointsKey) as { points: MapPoint[]; lines: MapLine[] | null };
    if (!ref.current || (points.length === 0 && !picking)) return;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        // Worker публикуется в public/maplibre (scripts/copy-maplibre-worker.mjs)
        if (!maplibregl.getWorkerUrl().startsWith(window.location.origin)) {
          maplibregl.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
        }
        const map = new maplibregl.Map({
          container: ref.current,
          style: mapStyle(dark),
          center: points.length ? [points[0].lng, points[0].lat] : [70, 48],
          zoom: 3,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", () => undefined);
        map.on("click", (e) => pickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        // style.load — стиль готов (линии рисуются даже если тайлы недоступны)
        map.once("style.load", () => {
          if (lines) {
            lines.forEach((l, i) => {
              map.addSource(`line-${i}`, {
                type: "geojson",
                data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l.coordinates } },
              });
              map.addLayer({
                id: `line-${i}`,
                type: "line",
                source: `line-${i}`,
                paint: {
                  "line-color": l.color,
                  "line-width": l.width ?? 3,
                  "line-opacity": l.opacity ?? 0.75,
                  ...(l.dashed ? { "line-dasharray": [2, 1.5] } : {}),
                },
              });
            });
            return;
          }
          const route = points.filter((p) => p.kind !== "VEHICLE");
          if (route.length > 1) {
            map.addSource("route", {
              type: "geojson",
              data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.map((p) => [p.lng, p.lat]) } },
            });
            map.addLayer({
              id: "route",
              type: "line",
              source: "route",
              paint: { "line-color": cssColor("--map-route", "#007aff"), "line-width": 3, "line-dasharray": [2, 1.5], "line-opacity": 0.7 },
            });
          }
        });
        for (const p of points) {
          const el = document.createElement("div");
          el.style.cssText = `width:${p.kind === "VEHICLE" ? 20 : 14}px;height:${p.kind === "VEHICLE" ? 20 : 14}px;border-radius:9999px;background:${pointColor(p.kind)};border:2.5px solid white;box-shadow:0 1px 3px rgb(0 0 0 / .3)`;
          el.setAttribute("role", "img");
          el.setAttribute("aria-label", p.label);
          new maplibregl.Marker({ element: el })
            .setLngLat([p.lng, p.lat])
            .setPopup(new maplibregl.Popup({ offset: 12 }).setText(p.label))
            .addTo(map);
        }
        if (points.length) {
          const bounds = new maplibregl.LngLatBounds();
          points.forEach((p) => bounds.extend([p.lng, p.lat]));
          map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pointsKey, picking, dark]);

  if ((points.length === 0 && !picking) || failed) {
    return (
      <div className={className}>
        <div className="bg-fill-quaternary text-subheadline text-muted-foreground grid h-full min-h-48 place-items-center rounded-lg p-4 text-center">
          {failed ? "Карта недоступна в этом браузере. Точки маршрута перечислены ниже." : "Нет координат для отображения на карте"}
        </div>
      </div>
    );
  }
  // className задаёт размер/скругление внешнего блока; холст карты заполняет его целиком.
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        ref={ref}
        // inline-стиль: CSS MapLibre (.maplibregl-map { position: relative }) перебивает классы позиционирования
        style={{ position: "absolute", inset: 0, ...(picking ? { cursor: "crosshair" } : {}) }}
        role="region"
        aria-label={`Карта: ${points.map((p) => p.label).join(", ")}`}
      />
      {picking && pickHint && (
        <p className="material-menu shadow-menu text-footnote pointer-events-none absolute top-2 left-2 rounded-sm px-2 py-1">{pickHint}</p>
      )}
    </div>
  );
}
