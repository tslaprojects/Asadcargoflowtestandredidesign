#!/usr/bin/env node
/**
 * MapLibre GL обрабатывает данные карты (GeoJSON-линии, тайлы) в web worker.
 * Бандлер Next.js не публикует файл worker'а рядом со своими чанками, поэтому копируем его в public/
 * и указываем путь через maplibregl.setWorkerUrl() (см. src/features/tracking/map-view.tsx).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "maplibre-gl", "dist");
const dst = path.join(root, "public", "maplibre");
if (!existsSync(src)) process.exit(0);
mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(path.join(src, f), path.join(dst, f));
