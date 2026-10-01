"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, Marker } from "maplibre-gl";
import { Maximize2, Minus, Plus } from "lucide-react";
import * as React from "react";
import type { Health } from "@/lib/operations";
import { cn } from "@/lib/utils";
import { HEALTH_COLORS, mapStyle } from "./map-style";

/** Объект карты: перевозка/машина с позицией и маршрутом. */
export type MapObject = {
  id: string;
  label: string;
  health: Health;
  position: { lat: number; lng: number } | null;
  /** Маршрут [lng, lat] по точкам загрузки → границы → разгрузки. */
  route: [number, number][];
};

type Padding = { top: number; right: number; bottom: number; left: number };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function boundsOf(points: [number, number][]) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ] as [[number, number], [number, number]];
}

function markerStyle(el: HTMLElement, health: Health, selected: boolean) {
  const color = HEALTH_COLORS[health];
  const size = selected ? 22 : 14;
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:9999px",
    `background:${color}`,
    "border:2.5px solid #fff",
    `box-shadow:0 1px 4px rgb(11 18 32 / .35)${selected ? `, 0 0 0 6px ${color}33` : ""}`,
    "padding:0",
    "cursor:pointer",
    "transition:width 200ms cubic-bezier(.22,1,.36,1),height 200ms cubic-bezier(.22,1,.36,1),box-shadow 200ms",
    `z-index:${selected ? 2 : 1}`,
  ].join(";");
}

/**
 * Рабочая карта операций: живые объекты (маркеры по состоянию), маршруты, выбор объекта,
 * плавное перемещение маркеров и «прорисовка» маршрута выбранной перевозки.
 */
export function MapWorkspace({
  objects,
  selectedId,
  onSelect,
  padding,
  className,
  emptyLabel = "Нет объектов с координатами",
}: {
  objects: MapObject[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Отступы камеры под панели поверх карты. */
  padding?: Partial<Padding>;
  className?: string;
  emptyLabel?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const markers = React.useRef(new Map<string, { marker: Marker; el: HTMLButtonElement; lng: number; lat: number }>());
  const lib = React.useRef<typeof import("maplibre-gl") | null>(null);
  const onSelectRef = React.useRef(onSelect);
  const fitted = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const pad: Padding = { top: 48, right: 48, bottom: 48, left: 48, ...padding };
  const padKey = JSON.stringify(pad);

  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Инициализация карты — один раз
  React.useEffect(() => {
    let cancelled = false;
    const markerMap = markers.current;
    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        if (!maplibregl.getWorkerUrl().startsWith(window.location.origin)) {
          maplibregl.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
        }
        lib.current = maplibregl;
        const map = new maplibregl.Map({
          container: ref.current,
          style: mapStyle(),
          center: [66, 46],
          zoom: 3,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        mapRef.current = map;
        map.on("error", () => undefined);
        map.once("style.load", () => {
          const empty = { type: "FeatureCollection" as const, features: [] };
          map.addSource("routes", { type: "geojson", data: empty });
          map.addSource("selected", { type: "geojson", data: empty });
          map.addLayer({
            id: "routes",
            type: "line",
            source: "routes",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.32 },
          });
          map.addLayer({
            id: "selected-casing",
            type: "line",
            source: "selected",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 },
          });
          map.addLayer({
            id: "selected",
            type: "line",
            source: "selected",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": ["get", "color"], "line-width": 3.5 },
          });
          if (!cancelled) setReady(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markerMap.forEach((m) => m.marker.remove());
      markerMap.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      fitted.current = false;
    };
  }, []);

  const objectsKey = JSON.stringify(objects);

  // Синхронизация маркеров и маршрутов с данными
  React.useEffect(() => {
    const map = mapRef.current;
    const maplibregl = lib.current;
    if (!ready || !map || !maplibregl) return;
    const list = JSON.parse(objectsKey) as MapObject[];
    const animate = !reducedMotion();
    (map.getSource("routes") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: list
        .filter((o) => o.route.length > 1 && o.id !== selectedId)
        .map((o) => ({
          type: "Feature" as const,
          properties: { color: HEALTH_COLORS[o.health] },
          geometry: { type: "LineString" as const, coordinates: o.route },
        })),
    });

    const seen = new Set<string>();
    for (const o of list) {
      if (!o.position) continue;
      seen.add(o.id);
      const existing = markers.current.get(o.id);
      if (existing) {
        markerStyle(existing.el, o.health, o.id === selectedId);
        existing.el.setAttribute("aria-label", o.label);
        existing.el.setAttribute("aria-pressed", String(o.id === selectedId));
        const { lng: fromLng, lat: fromLat } = existing;
        const { lng: toLng, lat: toLat } = o.position;
        if (fromLng !== toLng || fromLat !== toLat) {
          existing.lng = toLng;
          existing.lat = toLat;
          if (!animate) existing.marker.setLngLat([toLng, toLat]);
          else {
            // Плавное перемещение маркера к новой позиции (800 мс)
            const start = performance.now();
            const step = (t: number) => {
              const k = Math.min(1, (t - start) / 800);
              const e = 1 - Math.pow(1 - k, 3);
              existing.marker.setLngLat([fromLng + (toLng - fromLng) * e, fromLat + (toLat - fromLat) * e]);
              if (k < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        }
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", o.label);
      el.setAttribute("aria-pressed", String(o.id === selectedId));
      el.dataset.objectId = o.id;
      markerStyle(el, o.health, o.id === selectedId);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(o.id);
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat([o.position.lng, o.position.lat]).addTo(map);
      markers.current.set(o.id, { marker, el, lng: o.position.lng, lat: o.position.lat });
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        m.marker.remove();
        markers.current.delete(id);
      }
    }

    // Первая подгонка камеры — под все объекты
    if (!fitted.current) {
      const pts = list.flatMap((o) => [...o.route, ...(o.position ? [[o.position.lng, o.position.lat] as [number, number]] : [])]);
      if (pts.length) {
        map.fitBounds(boundsOf(pts), { padding: JSON.parse(padKey) as Padding, maxZoom: 7, duration: 0 });
        fitted.current = true;
      }
    }
  }, [ready, objectsKey, selectedId, padKey]);

  // Выбранная перевозка: маршрут прорисовывается от загрузки к разгрузке, камера переходит к объекту
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource("selected") as GeoJSONSource | undefined;
    const list = JSON.parse(objectsKey) as MapObject[];
    const sel = list.find((o) => o.id === selectedId);
    if (!sel) {
      src?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const color = HEALTH_COLORS[sel.health];
    const route = sel.route;
    const feature = (coords: [number, number][]) => ({
      type: "Feature" as const,
      properties: { color },
      geometry: { type: "LineString" as const, coordinates: coords },
    });
    let raf = 0;
    if (route.length > 1 && !reducedMotion()) {
      const start = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / 700);
        const e = 1 - Math.pow(1 - k, 3);
        const total = route.length - 1;
        const pos = e * total;
        const i = Math.floor(pos);
        const f = pos - i;
        const head = route.slice(0, i + 1);
        if (i < total) head.push([route[i][0] + (route[i + 1][0] - route[i][0]) * f, route[i][1] + (route[i + 1][1] - route[i][1]) * f]);
        src?.setData(feature(head.length > 1 ? head : route.slice(0, 2)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    } else if (route.length > 1) {
      src?.setData(feature(route));
    }
    const pts = [...route, ...(sel.position ? [[sel.position.lng, sel.position.lat] as [number, number]] : [])];
    if (pts.length > 1) {
      map.fitBounds(boundsOf(pts), { padding: JSON.parse(padKey) as Padding, maxZoom: 8, duration: reducedMotion() ? 0 : 700 });
    } else if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 6), duration: reducedMotion() ? 0 : 700 });
    }
    return () => cancelAnimationFrame(raf);
  }, [ready, selectedId, objectsKey, padKey]);

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const list = JSON.parse(objectsKey) as MapObject[];
    const pts = list.flatMap((o) => [...o.route, ...(o.position ? [[o.position.lng, o.position.lat] as [number, number]] : [])]);
    if (pts.length)
      map.fitBounds(boundsOf(pts), { padding: JSON.parse(padKey) as Padding, maxZoom: 7, duration: reducedMotion() ? 0 : 500 });
  };

  const hasData = objects.some((o) => o.position || o.route.length > 1);

  return (
    <div className={cn("bg-muted relative overflow-hidden", className)}>
      {failed ? (
        <div className="text-muted-foreground absolute inset-0 grid place-items-center p-6 text-center text-sm">
          Карта недоступна в этом браузере — объекты перечислены в списке.
        </div>
      ) : (
        <>
          <div
            ref={ref}
            style={{ position: "absolute", inset: 0 }}
            role="region"
            aria-label={`Карта операций: объектов ${objects.length}`}
          />
          {!ready && <div className="skeleton absolute inset-0" aria-hidden />}
          {ready && !hasData && (
            <p className="bg-card/95 text-muted-foreground pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md px-3 py-2 text-sm shadow-sm">
              {emptyLabel}
            </p>
          )}
          <MapControls
            style={{ top: 12, right: Math.max(12, pad.right - 36) }}
            onZoomIn={() => mapRef.current?.zoomIn({ duration: reducedMotion() ? 0 : 250 })}
            onZoomOut={() => mapRef.current?.zoomOut({ duration: reducedMotion() ? 0 : 250 })}
            onFit={fitAll}
          />
        </>
      )}
    </div>
  );
}

export function MapControls({
  onZoomIn,
  onZoomOut,
  onFit,
  style,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  style?: React.CSSProperties;
}) {
  const btn =
    "grid size-8 place-items-center text-foreground transition-colors duration-150 hover:bg-muted active:bg-secondary-hover focus-visible:relative focus-visible:z-10";
  return (
    <div className="border-border bg-card absolute z-[2] flex flex-col overflow-hidden rounded-md border shadow-sm" style={style}>
      <button type="button" className={btn} onClick={onZoomIn} aria-label="Приблизить">
        <Plus className="size-4" aria-hidden />
      </button>
      <button type="button" className={cn(btn, "border-border border-t")} onClick={onZoomOut} aria-label="Отдалить">
        <Minus className="size-4" aria-hidden />
      </button>
      <button type="button" className={cn(btn, "border-border border-t")} onClick={onFit} aria-label="Показать все объекты">
        <Maximize2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
