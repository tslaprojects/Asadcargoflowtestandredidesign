import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { acceptBid, counterBid, createBid, respondToCounter } from "@/server/services/bid.service";
import { inviteMember, revokeInvite } from "@/server/services/company.service";
import { acceptInviteForExistingUser } from "@/server/services/auth.service";
import { createLoad } from "@/server/services/load.service";
import { getMyTrip } from "@/server/services/driver-trip.service";
import { actorFor, expectAppError, loadInput, makeUser, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;

const bidInput = { amount: 4200, currency: "USD" as const, comment: null, readyDate: null, terms: null, validUntil: null };

describe("Исправления аудита: HIGH", () => {
  let s: Scene;
  beforeEach(async () => {
    await resetDb();
    s = await scene();
  });

  it("BIZ-001: перевозчик не может изменить цену без встречного предложения", async () => {
    const load = await createLoad(s.shipper, loadInput(), { publish: true });
    const bid = await createBid(s.carrier, load.id, bidInput);
    await expectAppError(respondToCounter(s.carrier, bid.id, { action: "propose", amount: 9000, message: null }), "INVALID_STATE_TRANSITION");
    expect(Number((await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).amount)).toBe(4200);
  });

  it("BIZ-001: принятие отклоняется, если цена отличается от увиденной заказчиком", async () => {
    const load = await createLoad(s.shipper, loadInput(), { publish: true });
    const bid = await createBid(s.carrier, load.id, bidInput);
    await counterBid(s.shipper, bid.id, 4000, null);
    await respondToCounter(s.carrier, bid.id, { action: "propose", amount: 4100, message: null });
    await expectAppError(acceptBid(s.shipper, bid.id, { amount: 4200, currency: "USD" }), "CONFLICT");
    const ok = await acceptBid(s.shipper, bid.id, { amount: 4100, currency: "USD" });
    expect(ok.orderId).toBeTruthy();
  });

  it("SEC-003: нельзя пригласить на чужой профиль водителя", async () => {
    await expectAppError(
      inviteMember(s.carrier2, s.carrier2Co.id, { email: "attacker@test.local", role: "DRIVER", driverProfileId: s.driver.id }),
      "NOT_FOUND",
    );
  });

  it("SEC-003: водитель видит рейсы только своих компаний-перевозчиков", async () => {
    // Профиль водителя компании A ошибочно указывает на пользователя, состоящего только в компании B
    const outsider = await makeUser({ role: "DRIVER", companyId: s.carrier2Co.id });
    await prisma.driverProfile.update({ where: { id: s.driver.id }, data: { userId: outsider.id } });
    const load = await createLoad(s.shipper, loadInput(), { publish: true });
    const bid = await createBid(s.carrier, load.id, bidInput);
    const { orderId } = await acceptBid(s.shipper, bid.id);
    await prisma.transportOrder.update({ where: { id: orderId }, data: { driverId: s.driver.id, currentStatus: "IN_TRANSIT" } });
    expect(await getMyTrip(await actorFor(outsider.id, s.carrier2Co.id))).toBeNull();
  });

  it("AUTHZ-001: права берутся из роли в компании объекта, а не из активной компании", async () => {
    // Пользователь — руководитель перевозчика B (активная) и водитель перевозчика A
    const u = await makeUser({ role: "CARRIER_ADMIN", companyId: s.carrier2Co.id });
    await prisma.companyMember.create({ data: { companyId: s.carrierCo.id, userId: u.id, role: "DRIVER" } });
    const a = await actorFor(u.id, s.carrier2Co.id);
    await expectAppError(inviteMember(a, s.carrierCo.id, { email: "x@test.local", role: "DRIVER", driverProfileId: null }), "FORBIDDEN");
    const invite = await inviteMember(s.carrier, s.carrierCo.id, { email: "y@test.local", role: "DRIVER", driverProfileId: null });
    await expectAppError(revokeInvite(a, invite.id), "FORBIDDEN");
  });

  it("SEC-003: приглашение на профиль водителя привязывает только свободный профиль своей компании", async () => {
    const free = await prisma.driverProfile.create({
      data: { companyId: s.carrierCo.id, fullName: "Free Driver", phone: "+7 700 222 22 22", licenseNumber: "DL2", licenseCategory: "CE" },
    });
    const newcomer = await makeUser();
    const u = await prisma.user.findUniqueOrThrow({ where: { id: newcomer.id } });
    const inv = await inviteMember(s.carrier, s.carrierCo.id, { email: u.email, role: "DRIVER", driverProfileId: free.id });
    await acceptInviteForExistingUser(await actorFor(newcomer.id), inv.token);
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: free.id } })).userId).toBe(newcomer.id);
  });
});
