import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { acceptBid, createBid } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import {
  assignFuelCard,
  getAccounts,
  issueFuelCard,
  listFuelCards,
  setFuelCardStatus,
  topUpAccount,
  updateFuelCardLimits,
  updateVehicleFuelSettings,
} from "@/server/services/fuel-card.service";
import {
  attachToInvestigation,
  commentInvestigation,
  getAnomaly,
  getInvestigation,
  listAnomalies,
  openInvestigation,
  reviewAnomaly,
  updateInvestigation,
} from "@/server/services/fuel-investigation.service";
import { driverFuelView, fleetOverview, fuelDashboard, tripFuelReport, vehicleFuelReport } from "@/server/services/fuel-report.service";
import {
  authorizePurchase,
  driverRegisterRefuel,
  fuelTransactionAction,
  handleProviderEvent,
  listFuelTransactions,
  recordFromOwner,
  simulatePurchase,
} from "@/server/services/fuel-transaction.service";
import { createLoad } from "@/server/services/load.service";
import { assignDriver, assignVehicle } from "@/server/services/order.service";
import { ingestTelemetry } from "@/server/services/telemetry.service";
import { actorFor, expectAppError, loadInput, makeUser, PASSWORD, pdfFile, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;
const ALMATY = { latitude: 43.2389, longitude: 76.8897 };
const MOSCOW = { latitude: 55.7558, longitude: 37.6173 };
const MIN = 60_000;
const baseLimits = {
  perTransactionLiters: 300,
  dailyLiters: 5000,
  monthlyLiters: 50_000,
  dailyAmount: null,
  monthlyAmount: null,
  allowedFuelTypes: ["DIESEL" as const],
  allowedStationBrands: [],
  allowedStationIds: [],
  allowedRegions: [],
  allowedFromMinute: null,
  allowedToMinute: null,
  driverCanSeeFuelLevel: true,
};
let t0 = Date.now() - 72 * 60 * MIN; // точки времени в прошлом, по 3 ч на сценарий
const nextSlot = () => new Date((t0 += 180 * MIN));

describe("Fleet Fuel Control", () => {
  let s: Scene;
  let cardId: string;
  let dispatcher: Awaited<ReturnType<typeof actorFor>>;
  let driverB: Awaited<ReturnType<typeof actorFor>>;
  let driverBProfileId: string;

  const purchase = (over: Partial<Parameters<typeof recordFromOwner>[1]> = {}) =>
    recordFromOwner(s.carrier, {
      fuelCardId: cardId,
      stationName: "Helios №12, Алматы",
      stationBrand: "Helios",
      stationId: null,
      stationAddress: "пр. Райымбека, 300",
      stationCountry: "KZ",
      ...ALMATY,
      fuelType: "DIESEL",
      liters: 250,
      pricePerLiter: 320,
      transactionDate: null,
      ...over,
    });
  const readings = (vehicleId: string, rows: Parameters<typeof ingestTelemetry>[0]["readings"]) =>
    ingestTelemetry({ vehicleId, source: "TELEMATICS", provider: "test", readings: rows });
  const level = (at: Date, liters: number, extra: object = {}) => ({
    recordedAt: at,
    fuelLevelLiters: liters,
    fuelLevelSource: "CAN_J1939" as const,
    ...extra,
  });

  beforeAll(async () => {
    await resetDb();
    s = await scene();
    const dUser = await makeUser({ role: "CARRIER_DISPATCHER", companyId: s.carrierCo.id });
    dispatcher = await actorFor(dUser.id, s.carrierCo.id);
    const bUser = await makeUser({ role: "DRIVER", companyId: s.carrierCo.id, name: "Driver B" });
    const bProfile = await prisma.driverProfile.create({
      data: {
        userId: bUser.id,
        companyId: s.carrierCo.id,
        fullName: "Driver B",
        phone: "+7 700 222 22 22",
        licenseNumber: "DL2",
        licenseCategory: "CE",
      },
    });
    driverBProfileId = bProfile.id;
    driverB = await actorFor(bUser.id, s.carrierCo.id);
    await updateVehicleFuelSettings(s.carrier, s.vehicle.id, {
      fuelType: "DIESEL",
      engineType: "D26 Euro 6",
      tankCapacityLiters: 1000,
      fuelNormPer100Km: 31,
      telematicsProvider: "test",
      telematicsDeviceId: "DEV-001",
    });
  });

  describe("Топливный счёт и карта", () => {
    it("пополнение счёта идемпотентно; диспетчер не видит финансы", async () => {
      await topUpAccount(s.carrier, { amount: 2_500_000, currency: "KZT", reference: "ПП №1", note: null }, "key-1");
      await topUpAccount(s.carrier, { amount: 2_500_000, currency: "KZT", reference: "ПП №1", note: null }, "key-1");
      const { accounts, entries } = await getAccounts(s.carrier);
      expect(accounts[0]).toMatchObject({ balance: 2_500_000, reserved: 0, available: 2_500_000, currency: "KZT" });
      expect(entries).toHaveLength(1);
      await expectAppError(getAccounts(dispatcher), "FORBIDDEN");
      await expectAppError(getAccounts(s.driverActor), "FORBIDDEN");
    });

    it("выпуск карты: только владелец; токен провайдера не отдаётся; уникальный номер", async () => {
      await expectAppError(
        issueFuelCard(dispatcher, { label: "FC-001", currency: "KZT", vehicleId: s.vehicle.id, driverId: s.driver.id, ...baseLimits }),
        "FORBIDDEN",
      );
      const card = await issueFuelCard(s.carrier, {
        label: "fc-001",
        currency: "KZT",
        vehicleId: s.vehicle.id,
        driverId: s.driver.id,
        ...baseLimits,
      });
      cardId = card.id;
      expect(card.label).toBe("FC-001");
      expect(card.status).toBe("ACTIVE");
      expect(card.isDemo).toBe(true);
      expect(card.last4).toMatch(/^\d{4}$/);
      await expectAppError(
        issueFuelCard(s.carrier, { label: "FC-001", currency: "KZT", vehicleId: null, driverId: null, ...baseLimits }),
        "CONFLICT",
      );
      const listed = await listFuelCards(dispatcher);
      expect(JSON.stringify(listed)).not.toContain("providerCardId");
      expect(await prisma.auditLog.count({ where: { action: "FUEL_CARD_ISSUED" } })).toBe(1);
      // Водитель получил уведомление
      expect(await prisma.notification.count({ where: { userId: s.driverActor.userId, type: "FUEL_CARD_UPDATED" } })).toBe(1);
    });

    it("успешная заправка: резерв → списание, журнал счёта", async () => {
      const r = await purchase({ transactionDate: nextSlot() });
      expect(r.approved).toBe(true);
      expect(r.transaction.status).toBe("COMPLETED");
      expect(Number(r.transaction.totalAmount)).toBe(80_000);
      expect(r.transaction.vehicleId).toBe(s.vehicle.id);
      expect(r.transaction.driverId).toBe(s.driver.id);
      const acc = (await getAccounts(s.carrier)).accounts[0];
      expect(acc).toMatchObject({ balance: 2_420_000, reserved: 0 });
      const entries = await prisma.fuelAccountEntry.findMany({
        where: { fuelTransactionId: r.transaction.id },
        orderBy: { createdAt: "asc" },
      });
      expect(entries.map((e) => e.type)).toEqual(["RESERVE", "RELEASE", "CHARGE"]);
    });

    it("лимиты проверяются на сервере: на заправку, тип топлива, дневной", async () => {
      const over = await purchase({ liters: 301, transactionDate: nextSlot() });
      expect(over.approved).toBe(false);
      expect(over.transaction.status).toBe("DECLINED");
      expect(over.transaction.declineReason).toMatch(/лимит на одну заправку/);
      const petrol = await purchase({ fuelType: "PETROL", transactionDate: nextSlot() });
      expect(petrol.violations.map((v) => v.code)).toEqual(["FUEL_TYPE_NOT_ALLOWED"]);
      await updateFuelCardLimits(s.carrier, cardId, { ...baseLimits, dailyLiters: 200 });
      const daily = await purchase({ transactionDate: new Date(), liters: 250 });
      expect(daily.violations.map((v) => v.code)).toContain("DAILY_LITERS");
      await updateFuelCardLimits(s.carrier, cardId, baseLimits);
      expect(await prisma.auditLog.count({ where: { action: "FUEL_CARD_LIMITS_CHANGED" } })).toBe(2);
      // Отклонённые операции не списывают средства
      expect((await getAccounts(s.carrier)).accounts[0]).toMatchObject({ balance: 2_420_000, reserved: 0 });
    });

    it("заблокированную карту использовать нельзя; разблокировка", async () => {
      await setFuelCardStatus(s.carrier, cardId, "BLOCKED", "Проверка");
      const blocked = await purchase({ transactionDate: nextSlot() });
      expect(blocked.violations.map((v) => v.code)).toEqual(["CARD_NOT_ACTIVE"]);
      await expectAppError(setFuelCardStatus(s.carrier, cardId, "BLOCKED", null), "DUPLICATE_ACTION");
      await expectAppError(setFuelCardStatus(dispatcher, cardId, "ACTIVE", null), "FORBIDDEN");
      await setFuelCardStatus(s.carrier, cardId, "ACTIVE", null);
      expect((await purchase({ transactionDate: nextSlot(), liters: 100 })).approved).toBe(true);
      const statuses = await prisma.auditLog.findMany({ where: { action: "FUEL_CARD_STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
      expect(statuses.map((a) => (a.newValue as { status: string }).status)).toEqual(["BLOCKED", "ACTIVE"]);
    });

    it("повторная транзакция с тем же ID провайдера не резервирует дважды (в т.ч. параллельно)", async () => {
      const card = await prisma.fuelCard.findUniqueOrThrow({ where: { id: cardId } });
      const input = {
        card: { provider: card.provider, providerCardId: card.providerCardId },
        provider: card.provider,
        providerTransactionId: "PROV-TX-777",
        source: "PROVIDER" as const,
        stationName: "Sinooil, Алматы",
        fuelType: "DIESEL" as const,
        liters: 100,
        pricePerLiter: 320,
        transactionDate: nextSlot(),
      };
      const [a, b] = await Promise.all([authorizePurchase(input), authorizePurchase(input)]);
      expect(a.transaction.id).toBe(b.transaction.id);
      expect([a.replay, b.replay].sort()).toEqual([false, true]);
      expect(await prisma.fuelTransaction.count({ where: { providerTransactionId: "PROV-TX-777" } })).toBe(1);
      expect((await getAccounts(s.carrier)).accounts[0].reserved).toBe(32_000);
      // Отмена авторизации снимает резерв; повторная отмена невозможна
      await fuelTransactionAction(s.carrier, a.transaction.id, "REVERSE", "Отмена на АЗС");
      expect((await getAccounts(s.carrier)).accounts[0].reserved).toBe(0);
      await expectAppError(fuelTransactionAction(s.carrier, a.transaction.id, "REVERSE", "Ещё раз"), "DUPLICATE_ACTION");
    });

    it("возврат и защита завершённых транзакций", async () => {
      const r = await purchase({ liters: 100, transactionDate: nextSlot() });
      const before = (await getAccounts(s.carrier)).accounts[0].balance;
      await fuelTransactionAction(s.carrier, r.transaction.id, "REFUND", "Ошибка АЗС");
      expect((await getAccounts(s.carrier)).accounts[0].balance).toBe(before + 32_000);
      await expectAppError(fuelTransactionAction(s.carrier, r.transaction.id, "REFUND", "Ещё раз"), "DUPLICATE_ACTION");
      await expectAppError(fuelTransactionAction(s.carrier, r.transaction.id, "DISPUTE", "Спор"), "INVALID_STATE_TRANSITION");
      await expectAppError(fuelTransactionAction(dispatcher, r.transaction.id, "REFUND", "x"), "FORBIDDEN");
    });

    it("события процессинга: авторизация, завершение, повторная доставка", async () => {
      const card = await prisma.fuelCard.findUniqueOrThrow({ where: { id: cardId } });
      const ev = {
        providerCardId: card.providerCardId,
        providerTransactionId: "PROV-TX-900",
        stationName: "КазМунайГаз",
        fuelType: "DIESEL" as const,
        liters: 120,
        pricePerLiter: 320,
        transactionDate: nextSlot(),
      };
      const auth = await handleProviderEvent("demo", { ...ev, type: "AUTHORIZATION_REQUEST" });
      expect(auth.approved).toBe(true);
      const done = await handleProviderEvent("demo", { ...ev, type: "COMPLETED", totalAmount: 38_400 });
      expect(done).toMatchObject({ approved: true, status: "COMPLETED" });
      const again = await handleProviderEvent("demo", { ...ev, type: "COMPLETED", totalAmount: 38_400 });
      expect(again.transactionId).toBe(done.transactionId);
      expect(await prisma.fuelAccountEntry.count({ where: { fuelTransactionId: done.transactionId, type: "CHARGE" } })).toBe(1);
      await expectAppError(handleProviderEvent("unknown", { ...ev, type: "COMPLETED" }), "NOT_FOUND");
    });
  });

  describe("Сопоставление с телематикой и аномалии", () => {
    it("до 200 л + 300 л → после 500 л: MATCHED", async () => {
      const t = nextSlot();
      await readings(s.vehicle.id, [
        level(new Date(t.getTime() - 20 * MIN), 200),
        { recordedAt: t, ...ALMATY },
        level(new Date(t.getTime() + 15 * MIN), 500),
      ]);
      const r = await purchase({ liters: 300, transactionDate: t });
      expect(r.transaction.matchStatus).toBe("MATCHED");
      expect(r.transaction).toMatchObject({ levelBefore: 200, levelAfter: 500, levelSource: "CAN_J1939", anomalyScore: 0 });
      expect(await prisma.fuelAnomaly.count({ where: { fuelTransactionId: r.transaction.id } })).toBe(0);
    });

    it("до 200 л + 300 л → после 250 л: FUEL_LEVEL_MISMATCH, уведомление владельцу без обвинений", async () => {
      const t = nextSlot();
      await readings(s.vehicle.id, [
        level(new Date(t.getTime() - 20 * MIN), 200),
        { recordedAt: t, ...ALMATY },
        level(new Date(t.getTime() + 15 * MIN), 250),
      ]);
      const r = await purchase({ liters: 300, transactionDate: t });
      expect(r.transaction.matchStatus).toBe("MISMATCH");
      const a = await prisma.fuelAnomaly.findFirstOrThrow({ where: { fuelTransactionId: r.transaction.id } });
      expect(a).toMatchObject({ type: "FUEL_LEVEL_MISMATCH", status: "OPEN", severity: "CRITICAL", score: 30 });
      expect(a.explanation).toContain("Требуется проверка");
      const n = await prisma.notification.findFirstOrThrow({ where: { userId: s.carrier.userId, type: "FUEL_ANOMALY", entityId: a.id } });
      expect(n.title).toMatch(/Требуется проверка/);
      expect(`${n.title} ${n.body}`.toLowerCase()).not.toMatch(/укра|краж|вор/);
      // Водитель не получает уведомлений об аномалиях
      expect(await prisma.notification.count({ where: { userId: s.driverActor.userId, type: "FUEL_ANOMALY" } })).toBe(0);
    });

    it("АЗС в Алматы, GPS в Москве: LOCATION_MISMATCH", async () => {
      const t = nextSlot();
      await readings(s.vehicle.id, [{ recordedAt: new Date(t.getTime() - 5 * MIN), ...MOSCOW }]);
      const r = await purchase({ liters: 100, transactionDate: t });
      const types = (await prisma.fuelAnomaly.findMany({ where: { fuelTransactionId: r.transaction.id } })).map((x) => x.type);
      expect(types).toEqual(["LOCATION_MISMATCH"]);
      expect(r.transaction.gpsDistanceKm).toBeGreaterThan(3000);
    });

    it("бак 500 л, в баке 450 л, покупка 200 л: TANK_CAPACITY_EXCEEDED", async () => {
      const small = await prisma.vehicle.create({
        data: {
          companyId: s.carrierCo.id,
          plateNumber: "KZ 500 TK",
          country: "KZ",
          make: "Isuzu",
          model: "Forward",
          vehicleType: "TRUCK",
          bodyType: "BOX",
          capacityKg: 8000,
          tankCapacityLiters: 500,
          fuelType: "DIESEL",
        },
      });
      const card = await issueFuelCard(s.carrier, {
        label: "FC-002",
        currency: "KZT",
        vehicleId: small.id,
        driverId: driverBProfileId,
        ...baseLimits,
      });
      const t = nextSlot();
      await readings(small.id, [level(new Date(t.getTime() - 10 * MIN), 450), level(new Date(t.getTime() + 10 * MIN), 500)]);
      const r = await purchase({ fuelCardId: card.id, liters: 200, transactionDate: t });
      const types = (await prisma.fuelAnomaly.findMany({ where: { fuelTransactionId: r.transaction.id } })).map((x) => x.type);
      expect(types).toContain("TANK_CAPACITY_EXCEEDED");
    });

    it("данные телематики пришли позже: повторный анализ меняет результат", async () => {
      const t = nextSlot();
      const r = await purchase({ liters: 200, transactionDate: t });
      expect(r.transaction.matchStatus).toBe("UNVERIFIED");
      await readings(s.vehicle.id, [
        level(new Date(t.getTime() - 10 * MIN), 300),
        { recordedAt: t, ...ALMATY },
        level(new Date(t.getTime() + 10 * MIN), 498),
      ]);
      const after = await prisma.fuelTransaction.findUniqueOrThrow({ where: { id: r.transaction.id } });
      expect(after.matchStatus).toBe("MATCHED");
      // Повторная доставка тех же показаний не создаёт дубликатов
      const again = await readings(s.vehicle.id, [level(new Date(t.getTime() - 10 * MIN), 300)]);
      expect(again.inserted).toBe(0);
    });

    it("падение уровня на стоянке с выключенным двигателем: UNEXPECTED_FUEL_DROP", async () => {
      const t = nextSlot();
      await readings(s.vehicle.id, [
        level(t, 480, { engineOn: false, speedKmh: 0, odometerKm: 120_000 }),
        level(new Date(t.getTime() + 40 * MIN), 360, { engineOn: false, speedKmh: 0, odometerKm: 120_000 }),
      ]);
      const a = await prisma.fuelAnomaly.findFirstOrThrow({ where: { vehicleId: s.vehicle.id, type: "UNEXPECTED_FUEL_DROP" } });
      expect(a.explanation).toContain("снизился на 120 л");
      expect(a.fuelTransactionId).toBeNull();
    });
  });

  describe("Проверка и расследование", () => {
    it("проверка несоответствия: «норма» требует пояснения; диспетчер может проверять", async () => {
      const a = await prisma.fuelAnomaly.findFirstOrThrow({ where: { type: "LOCATION_MISMATCH" } });
      await expectAppError(reviewAnomaly(dispatcher, a.id, { decision: "DISMISS", comment: null }), "VALIDATION_ERROR");
      const reviewed = await reviewAnomaly(dispatcher, a.id, {
        decision: "DISMISS",
        comment: "Водитель прислал чек: заправка на соседней АЗС, GPS-трекер был офлайн",
      });
      expect(reviewed.status).toBe("DISMISSED");
      await expectAppError(reviewAnomaly(s.carrier, a.id, { decision: "CONFIRM", comment: null }), "INVALID_STATE_TRANSITION");
      await expectAppError(reviewAnomaly(s.driverActor, a.id, { decision: "CONFIRM", comment: null }), "FORBIDDEN");
    });

    it("расследование: открытие, комментарии, файлы, закрытие с итогом", async () => {
      const a = await prisma.fuelAnomaly.findFirstOrThrow({ where: { type: "FUEL_LEVEL_MISMATCH" } });
      const inv = await openInvestigation(s.carrier, { anomalyIds: [a.id], title: null, comment: "Запросить чек и фото показаний" });
      expect(inv.status).toBe("OPEN");
      expect((await prisma.fuelAnomaly.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("INVESTIGATING");
      await expectAppError(openInvestigation(s.carrier, { anomalyIds: [a.id], title: null, comment: null }), "DUPLICATE_ACTION");
      await commentInvestigation(s.carrier, inv.id, "Водитель пояснил: часть топлива слита в канистры для рефустановки");
      await attachToInvestigation(s.carrier, inv.id, { file: pdfFile("receipt.pdf"), note: "Чек АЗС" });
      await updateInvestigation(s.carrier, inv.id, { status: "UNDER_REVIEW", resolution: null });
      await expectAppError(updateInvestigation(s.carrier, inv.id, { status: "RESOLVED", resolution: null }), "VALIDATION_ERROR");
      await updateInvestigation(s.carrier, inv.id, {
        status: "RESOLVED",
        resolution: "Расхождение объяснено, выдано предупреждение о порядке заправки рефустановки",
      });
      const view = await getInvestigation(s.carrier, inv.id);
      expect(view.investigation.status).toBe("RESOLVED");
      expect(view.investigation.comments).toHaveLength(2);
      expect(view.investigation.attachments).toHaveLength(1);
      expect(view.investigation.transactions).toHaveLength(1);
      expect(view.telemetry.length).toBeGreaterThan(0);
      expect((await prisma.fuelAnomaly.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("RESOLVED");
      await expectAppError(commentInvestigation(s.carrier, inv.id, "после закрытия"), "INVALID_STATE_TRANSITION");
      const actions = (await prisma.auditLog.findMany({ where: { entityId: inv.id } })).map((x) => x.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          "FUEL_INVESTIGATION_OPENED",
          "FUEL_INVESTIGATION_COMMENTED",
          "FUEL_INVESTIGATION_ATTACHED",
          "FUEL_INVESTIGATION_CLOSED",
        ]),
      );
    });

    it("чужой перевозчик не видит несоответствия; администратор платформы видит", async () => {
      const a = await prisma.fuelAnomaly.findFirstOrThrow({ where: { type: "TANK_CAPACITY_EXCEEDED" } });
      await expectAppError(getAnomaly(s.carrier2, a.id), "NOT_FOUND");
      expect((await getAnomaly(s.admin, a.id)).anomaly.id).toBe(a.id);
      expect((await listAnomalies(s.admin, { page: 1, pageSize: 50, allCompanies: true })).total).toBeGreaterThan(0);
      await expectAppError(listAnomalies(s.carrier, { page: 1, pageSize: 50, allCompanies: true }), "FORBIDDEN");
    });
  });

  describe("Водитель", () => {
    it("видит свою машину и карту, «Оплата разрешена», но не баланс компании", async () => {
      const v = await driverFuelView(s.driverActor);
      expect(v.card?.label).toBe("FC-001");
      expect(v.payment).toEqual({ allowed: true, message: "Оплата разрешена" });
      expect(v.vehicle?.plateNumber).toBe(s.vehicle.plateNumber);
      expect(v.fuelLevel?.liters).toBeGreaterThan(0);
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/balance|reserved|available|totalAmount|pricePerLiter/i);
      expect(v.transactions.every((t) => !("totalAmount" in t))).toBe(true);
      await expectAppError(fuelDashboard(s.driverActor, { page: 1, pageSize: 10 }), "FORBIDDEN");
      await expectAppError(listFuelTransactions(s.driverActor, { page: 1, pageSize: 10 }), "FORBIDDEN");
    });

    it("водитель A не видит операций водителя B и не может использовать его карту", async () => {
      const a = await driverFuelView(s.driverActor);
      const b = await driverFuelView(driverB);
      expect(b.card?.label).toBe("FC-002");
      const aIds = new Set(a.transactions.map((t) => t.id));
      expect(b.transactions.some((t) => aIds.has(t.id))).toBe(false);
      const bCard = await prisma.fuelCard.findFirstOrThrow({ where: { label: "FC-002" } });
      await expectAppError(
        simulatePurchase(
          s.driverActor,
          {
            fuelCardId: bCard.id,
            stationName: "АЗС",
            stationBrand: null,
            stationId: null,
            stationAddress: null,
            stationCountry: "KZ",
            latitude: null,
            longitude: null,
            fuelType: "DIESEL",
            liters: 10,
            pricePerLiter: 300,
            transactionDate: null,
          },
          { source: "DRIVER_APP", companyId: s.carrierCo.id, driverId: s.driver.id },
        ),
        "FORBIDDEN",
      );
    });

    it("регистрация заправки водителем: ответ без финансов; при блокировке — причина для водителя", async () => {
      const ok = await driverRegisterRefuel(s.driverActor, {
        stationName: "Helios",
        stationBrand: "Helios",
        stationId: null,
        stationAddress: null,
        stationCountry: "KZ",
        ...ALMATY,
        fuelType: "DIESEL",
        liters: 50,
        pricePerLiter: 320,
      });
      expect(ok).toEqual({ approved: true, message: "Заправка зарегистрирована", liters: 50 });
      await setFuelCardStatus(s.carrier, cardId, "SUSPENDED", "Проверка");
      const denied = await driverRegisterRefuel(s.driverActor, {
        stationName: "Helios",
        stationBrand: null,
        stationId: null,
        stationAddress: null,
        stationCountry: "KZ",
        latitude: null,
        longitude: null,
        fuelType: "DIESEL",
        liters: 50,
        pricePerLiter: 320,
      });
      expect(denied).toEqual({ approved: false, message: "Карта заблокирована. Обратитесь к диспетчеру." });
      expect((await driverFuelView(s.driverActor)).payment.allowed).toBe(false);
      await setFuelCardStatus(s.carrier, cardId, "ACTIVE", null);
    });
  });

  describe("Рейс и отчёты", () => {
    it("заправки во время рейса привязываются к перевозке; отчёт по рейсу", async () => {
      const truck = await prisma.vehicle.create({
        data: {
          companyId: s.carrierCo.id,
          plateNumber: "KZ 777 FT",
          country: "KZ",
          make: "MAN",
          model: "TGX",
          vehicleType: "TRACTOR_TRAILER",
          bodyType: "CURTAINSIDER",
          capacityKg: 22000,
          tankCapacityLiters: 1000,
          fuelNormPer100Km: 31,
          fuelType: "DIESEL",
        },
      });
      const card = await issueFuelCard(s.carrier, { label: "FC-003", currency: "KZT", vehicleId: truck.id, driverId: null, ...baseLimits });
      await assignFuelCard(s.carrier, card.id, { vehicleId: truck.id, driverId: driverBProfileId });
      const load = await createLoad(s.shipper, loadInput(), { publish: true });
      const bid = await createBid(s.carrier, load.id, {
        amount: 4000,
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
      await assignVehicle(s.carrier, orderId, truck.id);
      await assignDriver(s.carrier, orderId, driverBProfileId);
      const r1 = await purchase({ fuelCardId: card.id, liters: 300, transactionDate: new Date() });
      const r2 = await purchase({ fuelCardId: card.id, liters: 200, transactionDate: new Date(Date.now() + 1000) });
      expect(r1.transaction.orderId).toBe(orderId);
      expect(r2.transaction.orderId).toBe(orderId);
      const report = await tripFuelReport(s.carrier, orderId);
      expect(report).toMatchObject({ liters: 500, refuels: 2, norm: 31 });
      expect(report.cost).toEqual([{ currency: "KZT", amount: 160_000 }]);
      expect(report.consumption?.method).toBe("PURCHASES");
      expect(report.consumption?.distanceSource).toBe("ROUTE_ESTIMATE");
      await expectAppError(tripFuelReport(s.shipper, orderId), "FORBIDDEN");
    });

    it("автопарк, страница автомобиля и дашборд", async () => {
      const fleet = await fleetOverview(s.carrier);
      const man = fleet.find((v) => v.id === s.vehicle.id)!;
      expect(man.fuelLevel?.source).toBe("CAN_J1939");
      expect(man.tankCapacityLiters).toBe(1000);
      expect(man.telematicsConnected).toBe(true);
      expect(man.health).toBe("CHECK");
      const page = await vehicleFuelReport(s.carrier, s.vehicle.id);
      expect(page.transactions.length).toBeGreaterThan(3);
      expect(page.anomalies.length).toBeGreaterThan(0);
      const dash = await fuelDashboard(s.carrier, { page: 1, pageSize: 25 });
      expect(dash.kpi.refuels).toBeGreaterThan(5);
      expect(dash.kpi.spend?.[0].currency).toBe("KZT");
      expect(dash.kpi.anomalies).toBeGreaterThan(0);
      // Диспетчер видит литры и аномалии, но не деньги
      const d2 = await fuelDashboard(dispatcher, { page: 1, pageSize: 25 });
      expect(d2.kpi.spend).toBeNull();
      const list = await listFuelTransactions(dispatcher, { page: 1, pageSize: 5 });
      expect(list.items.every((t) => t.totalAmount === null)).toBe(true);
      await expectAppError(vehicleFuelReport(s.carrier2, s.vehicle.id), "NOT_FOUND");
    });
  });
});
