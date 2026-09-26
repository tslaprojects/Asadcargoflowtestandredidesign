import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { acceptBid, createBid } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import { createLoad } from "@/server/services/load.service";
import {
  cancelMovement,
  createMovement,
  driverMovement,
  getMovementMatches,
  nextLoadContext,
  nextLoadPreviews,
} from "@/server/services/next-load.service";
import { assignDriver, assignVehicle, changeStatus } from "@/server/services/order.service";
import { addLocation } from "@/server/services/tracking.service";
import { expectAppError, loadInput, PASSWORD, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;
const DAY = 24 * 60 * 60_000;
const at = (d: number) => new Date(Date.now() + d * DAY).toISOString();

function route(from: [string, string], to: [string, string], over: Record<string, unknown> = {}) {
  return loadInput({
    title: `${from[1]} — ${to[1]}`,
    weightKg: 15000,
    targetPrice: 2000,
    stops: [
      { type: "PICKUP", country: from[0], city: from[1], plannedDateFrom: at(1), plannedDateTo: at(3) },
      { type: "DELIVERY", country: to[0], city: to[1], plannedDateFrom: at(6) },
    ],
    ...over,
  } as never);
}

const base = {
  vehicleId: null,
  sourceOrderId: null,
  origin: null,
  allowedDeviationKm: 250,
  maxPickupDistanceKm: 300,
  availableFrom: null,
  availableUntil: null,
  note: null,
};

describe("Next Load / следующий рейс", () => {
  let s: Scene;
  const L: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    s = await scene();
    const make = async (key: string, from: [string, string], to: [string, string], over: Record<string, unknown> = {}) => {
      L[key] = (await createLoad(s.shipper, route(from, to, over), { publish: true })).id;
    };
    // Демо-набор из ТЗ: автомобиль в Алматы после рейса Китай → Алматы
    await make("almaty-astana", ["KZ", "Алматы"], ["KZ", "Астана"]);
    await make("almaty-moscow", ["KZ", "Алматы"], ["RU", "Москва"]);
    await make("almaty-chelyabinsk", ["KZ", "Алматы"], ["RU", "Челябинск"]);
    await make("almaty-bishkek", ["KZ", "Алматы"], ["KG", "Бишкек"]);
    await make("astana-moscow", ["KZ", "Астана"], ["RU", "Москва"]);
    await make("almaty-astana-ref", ["KZ", "Алматы"], ["KZ", "Астана"], { bodyType: "REFRIGERATOR" });
    await make("almaty-astana-heavy", ["KZ", "Алматы"], ["KZ", "Астана"], { weightKg: 25000 });
  });

  const idsOf = (r: Awaited<ReturnType<typeof getMovementMatches>>) =>
    r.matches.map((m) => Object.entries(L).find(([, id]) => id === m.loadId)?.[0]);

  it("направление не выбрано: грузы рядом с текущей точкой, совместимые с автомобилем", async () => {
    const { movement } = await createMovement(s.carrier, {
      ...base,
      vehicleId: s.vehicle.id,
      intent: "UNDECIDED",
      origin: { country: "KZ", city: "Алматы" },
      destinations: [],
    });
    const r = await getMovementMatches(s.carrier, movement.id, "efficiency");
    expect(idsOf(r).sort()).toEqual(["almaty-astana", "almaty-bishkek", "almaty-chelyabinsk", "almaty-moscow"]);
    const reasons = Object.fromEntries(
      r.rejected.map((x) => [Object.entries(L).find(([, id]) => id === x.loadId)?.[0], x.reasons.join(" ")]),
    );
    expect(reasons["almaty-astana-ref"]).toMatch(/рефрижератор/);
    expect(reasons["almaty-astana-heavy"]).toMatch(/грузоподъёмность/);
    expect(reasons["astana-moscow"]).toMatch(/радиуса/);
    expect(r.matches[0].matchReason.length).toBeGreaterThan(2);
    expect(r.matches[0].estimatedPrice).toBe(2000);
  });

  it("направление Москва: коридор включает погрузку по пути; план автомобиля один (предыдущий отменяется)", async () => {
    const { movement } = await createMovement(s.carrier, {
      ...base,
      vehicleId: s.vehicle.id,
      intent: "CITY",
      origin: { country: "KZ", city: "Алматы" },
      destinations: [{ country: "RU", city: "Москва" }],
    });
    const r = await getMovementMatches(s.carrier, movement.id, "efficiency");
    expect(idsOf(r)).toEqual(expect.arrayContaining(["almaty-moscow", "almaty-astana", "almaty-chelyabinsk", "astana-moscow"]));
    expect(idsOf(r)[0]).toBe("almaty-moscow");
    expect(await prisma.plannedMovement.count({ where: { vehicleId: s.vehicle.id, status: "ACTIVE" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "PLANNED_MOVEMENT_CREATED" } })).toBe(2);
  });

  it("несколько направлений и точка на карте", async () => {
    const { movement } = await createMovement(s.carrier, {
      ...base,
      intent: "DIRECTION",
      origin: { country: "KZ", city: "Алматы" },
      destinations: [
        { country: "KZ", city: "Астана" },
        { latitude: 42.87, longitude: 74.6 }, // точка на карте рядом с Бишкеком
      ],
    });
    expect(movement.destinations.map((d: { label: string }) => d.label)).toEqual(["Астана", "Бишкек"]);
    const r = await getMovementMatches(s.carrier, movement.id, "date");
    expect(idsOf(r).sort()).toEqual(["almaty-astana", "almaty-astana-heavy", "almaty-astana-ref", "almaty-bishkek"]);
    // Без автомобиля совместимость не проверяется — выводится предупреждение
    expect(r.matches[0].compatibility.warnings[0]).toMatch(/Автомобиль не выбран/);
  });

  it("валидация: неизвестный город, направление совпадает с текущей точкой, возврат без рейса", async () => {
    await expectAppError(
      createMovement(s.carrier, {
        ...base,
        intent: "CITY",
        origin: { country: "KZ", city: "Алматы" },
        destinations: [{ country: "KZ", city: "Атлантида" }],
      }),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      createMovement(s.carrier, {
        ...base,
        intent: "CITY",
        origin: { country: "KZ", city: "Алматы" },
        destinations: [{ country: "KZ", city: "Алматы" }],
      }),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      createMovement(s.carrier, { ...base, intent: "RETURN", origin: { country: "KZ", city: "Алматы" }, destinations: [] }),
      "VALIDATION_ERROR",
    );
    // Позиция не указана и не определяется по рейсу
    await expectAppError(
      createMovement(s.carrier, { ...base, vehicleId: s.smallVehicle.id, intent: "UNDECIDED", destinations: [] }),
      "VALIDATION_ERROR",
    );
  });

  it("права: заказчик и чужой перевозчик не имеют доступа; водитель без рейса не планирует", async () => {
    await expectAppError(nextLoadContext(s.shipper), "FORBIDDEN");
    await expectAppError(
      createMovement(s.shipper, { ...base, intent: "UNDECIDED", origin: { country: "KZ", city: "Алматы" }, destinations: [] }),
      "FORBIDDEN",
    );
    const own = await prisma.plannedMovement.findFirstOrThrow({ where: { companyId: s.carrierCo.id } });
    await expectAppError(getMovementMatches(s.carrier2, own.id, "efficiency"), "NOT_FOUND");
    await expectAppError(cancelMovement(s.carrier2, own.id), "NOT_FOUND");
    await expectAppError(
      createMovement(s.carrier2, {
        ...base,
        vehicleId: s.vehicle.id,
        intent: "UNDECIDED",
        origin: { country: "KZ", city: "Алматы" },
        destinations: [],
      }),
      "NOT_FOUND",
    );
    await expectAppError(createMovement(s.driverActor, { ...base, intent: "UNDECIDED", destinations: [] }), "FORBIDDEN");
    await expectAppError(nextLoadContext(s.driverActor), "FORBIDDEN");
  });

  it("в пути: позиция по трекингу, «через N км будете в Алматы», водитель указывает направление «обратно»", async () => {
    const load = await createLoad(s.shipper, route(["CN", "Урумчи"], ["KZ", "Алматы"], { title: "Урумчи — Алматы", targetPrice: 3000 }), {
      publish: true,
    });
    const bid = await createBid(s.carrier, load.id, {
      amount: 3000,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const { orderId, contractId } = await acceptBid(s.shipper, bid.id);
    const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    await signContract(s.shipper, contractId, { password: PASSWORD, documentHash: c.contentHash });
    await signContract(s.carrier, contractId, { password: PASSWORD, documentHash: c.contentHash });
    await assignVehicle(s.carrier, orderId, s.vehicle.id);
    await assignDriver(s.carrier, orderId, s.driver.id);
    const st = (status: Parameters<typeof changeStatus>[2]["status"]) =>
      changeStatus(s.driverActor, orderId, { status, comment: null, documentIds: [], latitude: null, longitude: null, accuracy: null });
    await st("AT_LOADING");
    await st("LOADED");
    await st("IN_TRANSIT");
    // Отметка водителя примерно в 100 км (по прямой) от Алматы
    await addLocation(s.driverActor, orderId, { latitude: 43.62, longitude: 77.95, accuracy: 30, note: null, recordedAt: null });

    const previews = await nextLoadPreviews(s.carrier);
    const p = previews.find((x) => x.orderId === orderId)!;
    expect(p.phase).toBe("IN_TRIP");
    expect(p.city).toBe("Алматы");
    expect(p.remainingKm).toBeGreaterThan(80);
    expect(p.message).toMatch(/^Через ≈ \d+ км вы будете в г\. Алматы\. Найдено \d+ подходящ/);
    expect(p.matches).toBeGreaterThanOrEqual(1);

    const ctx = await nextLoadContext(s.carrier);
    const v = ctx.vehicles.find((x) => x.id === s.vehicle.id)!;
    expect(v.situation.phase).toBe("IN_TRIP");
    expect(v.situation.returnPoint?.city).toBe("Урумчи");

    // Водитель: «Вернуться обратно» — направление определяется по началу рейса
    const { movement } = await createMovement(s.driverActor, { ...base, intent: "RETURN", destinations: [] });
    expect(movement.vehicleId).toBe(s.vehicle.id);
    expect(movement.sourceOrderId).toBe(orderId);
    expect(movement.originLabel).toBe("Алматы");
    expect(movement.destinations[0].label).toBe("Урумчи (обратно)");
    expect(new Date(movement.availableFrom).getTime()).toBeGreaterThan(Date.now());
    // Диспетчер получает уведомление о планах водителя
    expect(await prisma.notification.count({ where: { userId: s.carrier.userId, type: "NEXT_LOAD_SUGGESTIONS" } })).toBe(1);
    // Водитель видит план, но не цены
    const forDriver = await getMovementMatches(s.driverActor, movement.id, "efficiency");
    expect(forDriver.matches.every((m) => m.estimatedPrice === null && m.load.targetPrice === null)).toBe(true);
    expect((await driverMovement(s.driverActor))?.movement.id).toBe(movement.id);

    await cancelMovement(s.carrier, movement.id);
    await expectAppError(cancelMovement(s.carrier, movement.id), "DUPLICATE_ACTION");
  });
});
