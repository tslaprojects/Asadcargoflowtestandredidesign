import type { StyleSpecification } from "maplibre-gl";

/**
 * Базовый стиль карт CargoFlow (по приоритету):
 * 1. NEXT_PUBLIC_MAP_STYLE_URL — свой векторный стиль;
 * 2. NEXT_PUBLIC_GEOAPIFY_KEY — векторный стиль Geoapify «positron» (светло-серый, приглушённый:
 *    подложка не спорит со статусами на карте);
 * 3. без ключа — растровые тайлы tile.openstreetmap.org, приглушённые. Только для разработки:
 *    политика OSM запрещает продакшен-нагрузку на их тайл-серверы.
 */
export const GEOAPIFY_STYLE = "positron";

export function geoapifyStyleUrl(key: string, style = GEOAPIFY_STYLE): string {
  return `https://maps.geoapify.com/v1/styles/${style}/style.json?apiKey=${encodeURIComponent(key)}`;
}

const MUTED_OSM: StyleSpecification = {
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
    { id: "ground", type: "background", paint: { "background-color": "#eef1f5" } },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: { "raster-saturation": -0.82, "raster-contrast": -0.08, "raster-brightness-min": 0.06, "raster-opacity": 0.92 },
    },
  ],
};

export function mapStyle(): StyleSpecification | string {
  if (process.env.NEXT_PUBLIC_MAP_STYLE_URL) return process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  const key = process.env.NEXT_PUBLIC_GEOAPIFY_KEY?.trim();
  return key ? geoapifyStyleUrl(key) : MUTED_OSM;
}

/** Цвета объектов на карте по операционному состоянию (совпадают с токенами --map-*). */
export const HEALTH_COLORS = {
  moving: "#1d4ed8",
  arriving: "#0e7490",
  delayed: "#ea580c",
  waiting: "#d97706",
  attention: "#dc2626",
  done: "#16a34a",
  cancelled: "#64748b",
} as const;
