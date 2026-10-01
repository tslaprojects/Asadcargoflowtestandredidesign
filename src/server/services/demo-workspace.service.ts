import "server-only";
import type { MemberRole } from "@/generated/prisma/enums";
import { authDb, dbFor } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

/**
 * Демо-рабочее пространство пользователя.
 *
 * Identity (email, пароль, статус, роль платформы) — только в реальной базе. В демо-базе хранится зеркальная
 * запись пользователя с тем же id (нужна для внешних ключей бизнес-данных) и членство в демо-компании
 * того же типа и с той же ролью, что у пользователя в реальной базе: режим данных не меняет права.
 */

/** Ключевые демо-компании (регистрационные номера из seed), к которым присоединяются пользователи. */
export const DEMO_ANCHORS = {
  SHIPPER: "DEMO-KZ-000001",
  CARRIER: "DEMO-KZ-000002",
  FORWARDER: "DEMO-RU-000003",
} as const;

const ANCHOR_FOR: Record<MemberRole, keyof typeof DEMO_ANCHORS> = {
  SHIPPER: "SHIPPER",
  CARRIER_ADMIN: "CARRIER",
  CARRIER_DISPATCHER: "CARRIER",
  DRIVER: "CARRIER",
  FORWARDER: "FORWARDER",
};

/** Заведомо непригодный для входа хеш: в демо-базе пароль не хранится и не проверяется. */
const NO_PASSWORD = "!demo-mirror:identity-in-real-db";

/** Демо-база готова к работе: миграции применены и ключевые компании загружены. */
export async function demoWorkspaceReady(): Promise<boolean> {
  try {
    const n = await dbFor("demo").company.count({ where: { registrationNumber: { in: Object.values(DEMO_ANCHORS) } } });
    return n > 0;
  } catch {
    return false;
  }
}

export async function provisionDemoIdentity(userId: string): Promise<{ activeCompanyId: string | null }> {
  const demo = dbFor("demo");
  const identity = await authDb.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } } },
  });
  if (!identity || identity.deletedAt) return { activeCompanyId: null };

  const anchors = await demo.company.findMany({
    where: { registrationNumber: { in: Object.values(DEMO_ANCHORS) }, deletedAt: null },
    select: { id: true, registrationNumber: true },
  });
  const anchorId = (key: keyof typeof DEMO_ANCHORS) => anchors.find((a) => a.registrationNumber === DEMO_ANCHORS[key])?.id ?? null;

  return demo.$transaction(async (tx) => {
    // Демо-персонаж с тем же email (из seed) освобождает адрес — у реального пользователя приоритет.
    await tx.user.updateMany({
      where: { email: identity.email, NOT: { id: identity.id } },
      data: { email: `displaced+${identity.id}@demo.cargoflow.invalid` },
    });
    const profile = {
      email: identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      phone: identity.phone,
      platformRole: identity.platformRole,
      status: identity.status,
      locale: identity.locale,
      timezone: identity.timezone,
      blockedAt: identity.blockedAt,
      deletedAt: null,
    };
    await tx.user.upsert({
      where: { id: identity.id },
      create: { id: identity.id, passwordHash: NO_PASSWORD, ...profile },
      update: profile,
    });

    let activeCompanyId: string | null = null;
    for (const m of identity.memberships) {
      const companyId = anchorId(ANCHOR_FOR[m.role]);
      if (!companyId) continue;
      await tx.companyMember.upsert({
        where: { companyId_userId: { companyId, userId: identity.id } },
        create: { companyId, userId: identity.id, role: m.role, status: "ACTIVE" },
        update: { role: m.role, status: "ACTIVE" },
      });
      activeCompanyId ??= companyId;

      if (m.role === "DRIVER") {
        const existing = await tx.driverProfile.findFirst({ where: { userId: identity.id, companyId, deletedAt: null } });
        const driver =
          existing ??
          (await tx.driverProfile.create({
            data: {
              userId: identity.id,
              companyId,
              fullName: `${identity.firstName} ${identity.lastName}`.trim(),
              phone: identity.phone ?? "+7 700 000 00 00",
              licenseNumber: `DEMO-${identity.id.slice(0, 8).toUpperCase()}`,
              licenseCategory: "CE",
            },
          }));
        // Водителю нужен рейс: забираем один активный демо-рейс у персонажа seed (только в демо-базе).
        const hasTrip = await tx.transportOrder.count({
          where: { driverId: driver.id, currentStatus: { notIn: ["CLOSED", "CANCELLED", "DELIVERED"] } },
        });
        if (!hasTrip) {
          const trip = await tx.transportOrder.findFirst({
            where: {
              carrierCompanyId: companyId,
              currentStatus: { in: ["IN_TRANSIT", "LOADED", "AT_LOADING", "WAITING_FOR_LOADING", "DRIVER_ASSIGNED"] },
              driver: { user: { email: { endsWith: "cargoflow.demo" } } },
            },
            orderBy: { createdAt: "asc" },
          });
          if (trip) await tx.transportOrder.update({ where: { id: trip.id }, data: { driverId: driver.id } });
        }
      }
    }
    // Лента уведомлений: при первом входе — копия ленты персонажа seed с той же ролью в той же компании
    const firstRole = identity.memberships[0]?.role;
    if (activeCompanyId && firstRole && (await tx.notification.count({ where: { userId: identity.id } })) === 0) {
      const persona = await tx.companyMember.findFirst({
        where: { companyId: activeCompanyId, role: firstRole, NOT: { userId: identity.id } },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      });
      if (persona) {
        const feed = await tx.notification.findMany({ where: { userId: persona.userId }, orderBy: { createdAt: "desc" }, take: 200 });
        await tx.notification.createMany({
          data: feed.map(({ id: _id, userId: _userId, updatedAt: _updatedAt, ...n }) => ({ ...n, userId: identity.id })),
        });
      }
    }
    logger.info("demo.provisioned", { userId: identity.id, memberships: identity.memberships.length });
    return { activeCompanyId };
  });
}
