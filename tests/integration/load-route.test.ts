import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { LatLng } from "@/lib/geo/distance";
import type { GeocodeQuery } from "@/lib/geo/geocoder";
import type { RouteOutcome } from "@/lib/geo/routing";
import { setGeoProviders } from "@/server/geo/providers";
import { createLoad, updateLoad } from "@/server/services/load.service";
import { loadInput, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;
let s: Scene;
let routeCalls: LatLng[][];
let geocodeCalls: GeocodeQuery[];
let routing: (w: LatLng[]) => RouteOutcome;

/** Дороги: простая линия через промежуточную точку, 900 км на сегмент. */
const byRoad = (w: LatLng[]): RouteOutcome => ({
  kind: "ok",
  route: {
    distanceKm: 900 * (w.length - 1),
    durationMin: 840 * (w.length - 1),
    geometry: w.flatMap((p, i) =>
      i === 0
        ? [[p.lng, p.lat] as [number, number]]
        : [[(p.lng + w[i - 1].lng) / 2 + 0.3, (p.lat + w[i - 1].lat) / 2] as [number, number], [p.lng, p.lat] as [number, number]],
    ),
  },
});

beforeEach(async () => {
  await resetDb();
  s = await scene();
  routeCalls = [];
  geocodeCalls = [];
  routing = byRoad;
  setGeoProviders({
    routing: {
      name: "fake",
      async route(w) {
        routeCalls.push(w);
        return routing(w);
      },
    },
    geocoder: {
      name: "fake",
      async geocode(q) {
        geocodeCalls.push(q);
        if (q.city === "Тараз") return { latitude: 42.9, longitude: 71.3666, accuracy: "city", confidence: 1 };
        return null;
      },
    },
  });
});
afterEach(() => setGeoProviders(null));

const routeOf = (id: string) =>
  prisma.load.findUniqueOrThrow({
    where: { id },
    select: {
      routeDistanceKm: true,
      routeDurationMin: true,
      routeGeometry: true,
      routeSource: true,
      routeProvider: true,
      routeStopsHash: true,
      routeComputedAt: true,
    },
  });

describe("Маршрут груза", () => {
  it("создание груза — маршрут по дорогам сохранён", async () => {
    const load = await createLoad(s.shipper, loadInput(), { publish: false });
    const r = await routeOf(load.id);
    expect(r).toMatchObject({ routeDistanceKm: 1800, routeDurationMin: 1680, routeSource: "PROVIDER", routeProvider: "fake" });
    expect(Array.isArray(r.routeGeometry) && r.routeGeometry.length).toBe(5);
    expect(r.routeStopsHash).toMatch(/^[0-9a-f]{32}$/);
    expect(routeCalls).toHaveLength(1);
    expect(routeCalls[0].map((p) => p.lat)).toEqual([43.8256, 43.2389, 55.7558]);
  });

  it("неизменные точки — без запроса к провайдеру; изменённые — пересчёт", async () => {
    const load = await createLoad(s.shipper, loadInput(), { publish: false });
    const before = await routeOf(load.id);
    routeCalls = [];

    // Правка без изменения точек (другое название)
    await updateLoad(s.shipper, load.id, loadInput({ title: "Электроника и комплектующие" }));
    expect(routeCalls).toHaveLength(0);
    expect((await routeOf(load.id)).routeComputedAt).toEqual(before.routeComputedAt);

    // Другая точка доставки — маршрут пересчитан
    const input = loadInput();
    input.stops[2] = { ...input.stops[2], country: "RU", city: "Казань" };
    await updateLoad(s.shipper, load.id, input);
    expect(routeCalls).toHaveLength(1);
    const after = await routeOf(load.id);
    expect(after.routeStopsHash).not.toBe(before.routeStopsHash);
    expect(routeCalls[0].at(-1)).toEqual({ lat: 55.7963, lng: 49.1088 });
  });

  it("провайдер недоступен — сохраняется оценка (ESTIMATE)", async () => {
    routing = () => ({ kind: "error" });
    const load = await createLoad(s.shipper, loadInput(), { publish: false });
    const r = await routeOf(load.id);
    expect(r.routeSource).toBe("ESTIMATE");
    expect(r.routeDistanceKm).toBeGreaterThan(3000);
    expect(r.routeGeometry).toHaveLength(3);
  });

  it("сегмент через границу не найден — по дорогам остальные, итог помечен как оценка", async () => {
    routing = (w) => (w.length > 2 || w[0].lat === 43.8256 ? { kind: "not_found" } : byRoad(w));
    const load = await createLoad(s.shipper, loadInput(), { publish: false });
    const r = await routeOf(load.id);
    expect(routeCalls).toHaveLength(3);
    expect(r.routeSource).toBe("ESTIMATE");
    expect(r.routeDistanceKm!).toBeGreaterThan(900);
  });

  it("без ключа провайдера — оценка, сетевых вызовов нет", async () => {
    setGeoProviders({ routing: null, geocoder: null });
    const load = await createLoad(s.shipper, loadInput(), { publish: false });
    expect((await routeOf(load.id)).routeSource).toBe("ESTIMATE");
  });

  it("геокодинг: город вне справочника — провайдер, затем кэш в БД; «не найдено» тоже кэшируется", async () => {
    const input = loadInput();
    input.stops[1] = { ...input.stops[1], country: "KZ", city: "Тараз" };
    const a = await createLoad(s.shipper, input, { publish: false });
    const stop = await prisma.loadStop.findFirstOrThrow({ where: { loadId: a.id, sequence: 2 } });
    expect(stop).toMatchObject({ latitude: 42.9, longitude: 71.3666 });
    expect(geocodeCalls).toEqual([{ country: "KZ", city: "Тараз" }]);
    expect(await prisma.geocodeCache.findUnique({ where: { country_query: { country: "KZ", query: "тараз" } } })).toMatchObject({
      latitude: 42.9,
      provider: "fake",
    });

    // Тот же город (другой регистр/пробелы) — из кэша, без запроса к провайдеру
    input.stops[1] = { ...input.stops[1], city: " тараз " };
    await createLoad(s.shipper, input, { publish: false });
    expect(geocodeCalls).toHaveLength(1);

    // Неизвестный город: провайдер не нашёл → запись «не найдено», повтор без запроса; маршрут — по оставшимся точкам
    input.stops[1] = { ...input.stops[1], city: "Несуществующий" };
    const c = await createLoad(s.shipper, input, { publish: false });
    await createLoad(s.shipper, input, { publish: false });
    expect(geocodeCalls.filter((q) => q.city === "Несуществующий")).toHaveLength(1);
    expect((await routeOf(c.id)).routeDistanceKm).toBe(900);
  });

  it("город из справочника — без обращения к провайдеру; адрес — сначала адрес, затем город", async () => {
    const input = loadInput();
    input.stops[1] = { ...input.stops[1], street: "пр. Абая", building: "10" };
    await createLoad(s.shipper, input, { publish: false });
    // Адрес провайдер не нашёл → город из справочника
    expect(geocodeCalls).toEqual([{ country: "KZ", city: "Алматы", street: "пр. Абая", building: "10" }]);
  });
});
