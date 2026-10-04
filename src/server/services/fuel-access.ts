import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import { isCarrierRole, type Permission } from "@/lib/permissions";

/**
 * Доступ к модулю «Топливо».
 *  - Владелец/руководитель перевозчика (CARRIER_ADMIN) — всё по своей компании: карты, лимиты, нормы, финансы, аномалии.
 *  - Диспетчер (CARRIER_DISPATCHER) — просмотр и проверка аномалий, без финансов и управления картами.
 *  - Водитель — только свой автомобиль, своя карта и свои заправки (fuel-driver.service).
 *  - Администратор платформы — просмотр и расследования по любой компании.
 */
export type FuelScope = { companyId: string; isAdmin: boolean };

export function fuelScope(actor: Actor, permission: Permission): FuelScope {
  const m = actor.active;
  if (m && isCarrierRole(m.role)) {
    if (!actor.permissions.has(permission)) throw errors.forbidden("Недостаточно прав для этого действия с топливом.");
    return { companyId: m.companyId, isAdmin: false };
  }
  throw errors.forbidden("Раздел «Топливо» доступен перевозчикам.");
}

/** Проверка доступа к объекту компании: сотрудник перевозчика с правом или администратор платформы. */
export function assertFuelCompanyAccess(actor: Actor, companyId: string, permission: Permission) {
  if (actor.isAdmin && actor.permissions.has(permission)) return { companyId, isAdmin: true };
  const scope = fuelScope(actor, permission);
  if (scope.companyId !== companyId) throw errors.notFound();
  return scope;
}

export async function requireFleetVehicle(companyId: string, vehicleId: string) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId, deletedAt: null } });
  if (!v) throw errors.notFound("Автомобиль не найден в вашем автопарке.");
  return v;
}

/** Профиль водителя текущего пользователя в активной компании. */
export async function driverProfileFor(actor: Actor) {
  const m = actor.active;
  if (!m || m.role !== "DRIVER" || !actor.permissions.has("FUEL_DRIVER")) throw errors.forbidden("Раздел доступен водителю.");
  const profile = await prisma.driverProfile.findFirst({ where: { companyId: m.companyId, userId: actor.userId, deletedAt: null } });
  if (!profile) throw errors.forbidden("Профиль водителя не найден.");
  return profile;
}

/** Суммы по топливу видит только роль с FUEL_FINANCE_VIEW (руководитель, администратор); диспетчер — только литры. */
export function canSeeFuelMoney(actor: Actor) {
  return actor.permissions.has("FUEL_FINANCE_VIEW");
}

type MoneyFields = { totalAmount?: unknown; pricePerLiter?: unknown; authorizedAmount?: unknown };

export function hideFuelMoney<T extends MoneyFields>(t: T): T {
  return {
    ...t,
    ...("totalAmount" in t ? { totalAmount: null } : {}),
    ...("pricePerLiter" in t ? { pricePerLiter: null } : {}),
    ...("authorizedAmount" in t ? { authorizedAmount: null } : {}),
  };
}
