import type { StyleSpecification } from "maplibre-gl";
import * as React from "react";
import type { Health } from "@/lib/operations";

/**
 * Базовый стиль карт CargoFlow (по приоритету):
 * 1. NEXT_PUBLIC_MAP_STYLE_URL — свой векторный стиль;
 * 2. NEXT_PUBLIC_GEOAPIFY_KEY — векторные стили Geoapify: «positron» днём, «dark-matter» в тёмной теме;
 * 3. без ключа — растровые тайлы tile.openstreetmap.org, приглушённые (в тёмной теме — затемнённые).
 *    Только для разработки: политика OSM запрещает продакшен-нагрузку на их тайл-серверы.
 */
export const GEOAPIFY_STYLE = "positron";
export const GEOAPIFY_DARK_STYLE = "dark-matter";

export function geoapifyStyleUrl(key: string, style = GEOAPIFY_STYLE): string {
  return `https://maps.geoapify.com/v1/styles/${style}/style.json?apiKey=${encodeURIComponent(key)}`;
}

function osmStyle(dark: boolean): StyleSpecification {
  return {
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
    layers: [
      { id: "ground", type: "background", paint: { "background-color": dark ? "#1c1c1e" : "#f0f0f3" } },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: dark
          ? { "raster-saturation": -1, "raster-contrast": 0.12, "raster-brightness-max": 0.36, "raster-brightness-min": 0.04 }
          : { "raster-saturation": -0.85, "raster-contrast": -0.1, "raster-brightness-min": 0.08, "raster-opacity": 0.9 },
      },
    ],
  };
}

export function mapStyle(dark = false): StyleSpecification | string {
  if (process.env.NEXT_PUBLIC_MAP_STYLE_URL) return process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  const key = process.env.NEXT_PUBLIC_GEOAPIFY_KEY?.trim();
  return key ? geoapifyStyleUrl(key, dark ? GEOAPIFY_DARK_STYLE : GEOAPIFY_STYLE) : osmStyle(dark);
}

const darkQuery = "(prefers-color-scheme: dark)";

/** Тёмная ли сейчас системная тема (подписка на смену темы без перезагрузки). */
export function useDarkScheme() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(darkQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(darkQuery).matches,
    () => false,
  );
}

/** Цвета объектов по операционному состоянию, если CSS-переменные недоступны (светлая тема). */
export const HEALTH_COLORS: Record<Health, string> = {
  moving: "#007aff",
  arriving: "#30b0c7",
  delayed: "#ff9500",
  waiting: "#d99a00",
  attention: "#ff3b30",
  done: "#34c759",
  cancelled: "#8e8e93",
};

const HEALTH_VAR: Record<Health, string> = {
  moving: "--map-moving",
  arriving: "--map-arriving",
  delayed: "--map-delayed",
  waiting: "--map-waiting",
  attention: "--map-attention",
  done: "--map-done",
  cancelled: "--map-cancelled",
};

/** Цвет CSS-переменной темы (globals.css — единственный источник цветов карты). */
export function cssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Цвета состояний для текущей темы. */
export function healthColors(): Record<Health, string> {
  return Object.fromEntries((Object.keys(HEALTH_VAR) as Health[]).map((h) => [h, cssColor(HEALTH_VAR[h], HEALTH_COLORS[h])])) as Record<
    Health,
    string
  >;
}
