import type { StyleSpecification } from "maplibre-gl";

/**
 * Базовый стиль карт CargoFlow. NEXT_PUBLIC_MAP_STYLE_URL — свой векторный стиль; по умолчанию —
 * растровые тайлы OpenStreetMap, приглушённые (низкая насыщенность): подложка не спорит с объектами и статусами.
 */
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
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || MUTED_OSM;
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
