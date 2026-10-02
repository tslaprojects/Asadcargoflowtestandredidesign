/**
 * Досчёт маршрутов (километраж, время в пути, линия по дорогам) для уже существующих грузов.
 *
 *   npm run routes:backfill -- --mode real                 — грузы без маршрута в реальной базе
 *   npm run routes:backfill -- --mode demo --dry-run       — только показать, сколько грузов будет обработано
 *   npm run routes:backfill -- --mode real --force         — пересчитать все (например, после подключения ключа)
 *   npm run routes:backfill -- --mode real --estimate      — без сети: записать оценку по прямой
 *
 * Параметры: --batch 20 (грузов за подход), --pause 3000 (пауза между подходами, мс),
 * --max-requests 2500 (бюджет запросов к провайдеру за запуск; бесплатный тариф Geoapify — 3000 в сутки).
 * Без GEOAPIFY_API_KEY пишется оценка. Точки без координат по возможности геокодируются (с кэшем).
 * Скрипт повторяемый: груз с актуальным хешем точек пропускается (кроме --force).
 */
import "dotenv/config";
import { dataModeConfig, SCHEMA_MARKER } from "@/lib/db/data-mode-config";
import { isDataMode, runWithDataMode, type DataMode } from "@/lib/db/data-mode";
import { prisma } from "@/lib/db/prisma";
import type { GeocodeQuery } from "@/lib/geo/geocoder";
import type { LatLng } from "@/lib/geo/distance";
import type { RouteProfile, RoutingProvider } from "@/lib/geo/routing";
import { geocodePoint } from "@/server/geo/geocoding";
import { computeLoadRoute } from "@/server/geo/load-route";
import { geoProviders, setGeoProviders, type RemoteGeocoder } from "@/server/geo/providers";
import { readMarker } from "./db-modes";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const num = (name: string, def: number) => {
  const v = Number(arg(name) ?? def);
  if (!Number.isFinite(v) || v < 0) throw new Error(`--${name}: ожидается число`);
  return v;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Провайдеры со счётчиком запросов (бюджет проверяется перед каждым грузом с запасом на худший случай). */
function withBudget() {
  let used = 0;
  const take = () => {
    used++;
  };
  const { routing, geocoder } = geoProviders();
  const r: RoutingProvider | null = routing && {
    name: routing.name,
    route: (w: LatLng[], p: RouteProfile) => (take(), routing.route(w, p)),
  };
  const g: RemoteGeocoder | null = geocoder && {
    name: geocoder.name,
    geocode: (q: GeocodeQuery) => (take(), geocoder.geocode(q)),
  };
  setGeoProviders({ routing: r, geocoder: g });
  return { used: () => used, remote: Boolean(routing || geocoder) };
}

async function main() {
  const mode = arg("mode");
  if (!isDataMode(mode)) throw new Error("Укажите базу: --mode real или --mode demo");
  const batch = Math.max(1, num("batch", 20));
  const pause = num("pause", 3000);
  const maxRequests = num("max-requests", 2500);
  const force = flag("force");
  const dryRun = flag("dry-run");
  if (flag("estimate")) setGeoProviders({ routing: null, geocoder: null });

  const target = dataModeConfig(mode as DataMode);
  const marker = await readMarker(target);
  if (marker !== SCHEMA_MARKER[mode as DataMode]) {
    throw new Error(
      `Схема "${target.schema}" имеет метку ${marker ?? "«нет»"}, ожидается ${SCHEMA_MARKER[mode as DataMode]}. Выполните: npm run db:migrate:all`,
    );
  }

  await runWithDataMode(mode as DataMode, async () => {
    const where = { deletedAt: null, ...(force ? {} : { routeStopsHash: null }) };
    const total = await prisma.load.count({ where });
    const budget = withBudget();
    console.log(
      `База ${mode.toUpperCase()}: грузов к обработке — ${total}. Провайдер: ${budget.remote ? "Geoapify" : "нет (оценка без сети)"}.`,
    );
    if (dryRun || total === 0) return;

    let done = 0;
    let provider = 0;
    let estimate = 0;
    let cursor: string | undefined;
    let exhausted = false;
    for (;;) {
      const loads = await prisma.load.findMany({
        where: cursor ? { ...where, id: { gt: cursor } } : where,
        orderBy: { id: "asc" },
        take: batch,
        select: { id: true, routeStopsHash: true, stops: { orderBy: { sequence: "asc" } } },
      });
      if (loads.length === 0) break;
      for (const load of loads) {
        // Худший случай: адрес + город для каждой точки без координат, весь маршрут и каждый сегмент
        const worst = load.stops.filter((s) => s.latitude == null || s.longitude == null).length * 2 + load.stops.length;
        if (budget.remote && budget.used() + worst > maxRequests) {
          exhausted = true;
          break;
        }
        const points: { latitude: number | null; longitude: number | null }[] = [];
        for (const s of load.stops) {
          if (s.latitude != null && s.longitude != null) {
            points.push({ latitude: s.latitude, longitude: s.longitude });
            continue;
          }
          const p = await geocodePoint({ country: s.country, city: s.city, street: s.street, building: s.building });
          if (p) await prisma.loadStop.update({ where: { id: s.id }, data: { latitude: p.latitude, longitude: p.longitude } });
          points.push({ latitude: p?.latitude ?? null, longitude: p?.longitude ?? null });
        }
        const fields = await computeLoadRoute(points, force ? null : load.routeStopsHash);
        if (fields) {
          await prisma.load.update({ where: { id: load.id }, data: fields });
          if (fields.routeSource === "PROVIDER") provider++;
          else estimate++;
        }
        done++;
      }
      cursor = loads[loads.length - 1].id;
      console.log(`  обработано ${done}/${total}, запросов к провайдеру: ${budget.used()}`);
      if (exhausted) {
        console.log(`Бюджет запросов (${maxRequests}) исчерпан — продолжите завтра тем же запуском.`);
        break;
      }
      if (budget.remote && pause > 0) await sleep(pause);
    }
    console.log(`Готово: ${done} грузов (по дорогам: ${provider}, оценка: ${estimate}), запросов: ${budget.used()}.`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
