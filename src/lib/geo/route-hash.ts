import { createHash } from "node:crypto";

/**
 * Хеш координат точек маршрута (порядок важен). Координаты округляются до ~1 м,
 * точки без координат участвуют как «-», чтобы появление координат меняло хеш.
 */
export function stopsHash(points: { latitude: number | null; longitude: number | null }[]): string {
  const key = points
    .map((p) => (p.latitude == null || p.longitude == null ? "-" : `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`))
    .join(";");
  return createHash("sha256").update(`v1|${key}`).digest("hex").slice(0, 32);
}
