"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import * as React from "react";

export type MapPoint = { lat: number; lng: number; label: string; kind: "PICKUP" | "BORDER" | "TRANSIT" | "DELIVERY" | "VEHICLE" };

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
};

export function MapView({ points, className }: { points: MapPoint[]; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const [failed, setFailed] = React.useState(false);
  // Пересоздаём карту только при реальном изменении точек
  const pointsKey = JSON.stringify(points);

  React.useEffect(() => {
    let cancelled = false;
    const points = JSON.parse(pointsKey) as MapPoint[];
    if (!ref.current || points.length === 0) return;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
        const map = new maplibregl.Map({
          container: ref.current,
          style: styleUrl || DEFAULT_STYLE,
          center: [points[0].lng, points[0].lat],
          zoom: 3,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", () => undefined);
        map.on("load", () => {
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
        const bounds = new maplibregl.LngLatBounds();
        points.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pointsKey]);

  if (points.length === 0 || failed) {
    return (
      <div className={className}>
        <div className="border-border bg-muted/40 text-muted-foreground grid h-full min-h-48 place-items-center rounded-xl border border-dashed p-4 text-center text-sm">
          {failed ? "Карта недоступна в этом браузере. Точки маршрута перечислены ниже." : "Нет координат для отображения на карте"}
        </div>
      </div>
    );
  }
  return <div ref={ref} className={className} role="img" aria-label={`Карта маршрута: ${points.map((p) => p.label).join(", ")}`} />;
}
