"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import * as React from "react";

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
 * по умолчанию — растровые тайлы OpenStreetMap. Провайдер карт заменяется без изменения компонентов.
 */
const DEFAULT_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const COLORS: Record<MapPoint["kind"], string> = {
  PICKUP: "#1d4ed8",
  BORDER: "#b45309",
  TRANSIT: "#64748b",
  DELIVERY: "#15803d",
  VEHICLE: "#dc2626",
  TARGET: "#7c3aed",
  CANDIDATE: "#0891b2",
  // Заправки: совпадает / требует проверки / нет данных для проверки
  FUEL_OK: "#15803d",
  FUEL_ALERT: "#c2410c",
  FUEL_UNVERIFIED: "#64748b",
};

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
        const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
        const map = new maplibregl.Map({
          container: ref.current,
          style: styleUrl || DEFAULT_STYLE,
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
              paint: { "line-color": "#1d4ed8", "line-width": 3, "line-dasharray": [2, 1.5], "line-opacity": 0.7 },
            });
          }
        });
        for (const p of points) {
          const el = document.createElement("div");
          el.style.cssText = `width:${p.kind === "VEHICLE" ? 20 : 14}px;height:${p.kind === "VEHICLE" ? 20 : 14}px;border-radius:9999px;background:${COLORS[p.kind]};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
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
  }, [pointsKey, picking]);

  if ((points.length === 0 && !picking) || failed) {
    return (
      <div className={className}>
        <div className="border-border bg-muted/40 text-muted-foreground grid h-full min-h-48 place-items-center rounded-xl border border-dashed p-4 text-center text-sm">
          {failed ? "Карта недоступна в этом браузере. Точки маршрута перечислены ниже." : "Нет координат для отображения на карте"}
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <div
        ref={ref}
        className={className}
        role="img"
        aria-label={`Карта: ${points.map((p) => p.label).join(", ")}`}
        style={picking ? { cursor: "crosshair" } : undefined}
      />
      {picking && pickHint && (
        <p className="bg-card/90 pointer-events-none absolute top-2 left-2 rounded-md px-2 py-1 text-xs shadow">{pickHint}</p>
      )}
    </div>
  );
}
