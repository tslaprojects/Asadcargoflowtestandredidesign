/**
 * Проверка лимитов топливной карты. Чистая функция: используется на сервере при каждой авторизации
 * и в интерфейсе для подсказок. Источник истины — сервер.
 */
import type { FuelCardStatus, FuelType } from "@/generated/prisma/enums";
import { toMinor } from "@/lib/money";
import { utcToZonedParts, zonedToUtc } from "@/lib/tz";

export type FuelCardLimits = {
  perTransactionLiters: number | null;
  dailyLiters: number | null;
  monthlyLiters: number | null;
  dailyAmount: number | null;
  monthlyAmount: number | null;
  allowedFuelTypes: FuelType[];
  allowedStationBrands: string[];
  allowedStationIds: string[];
  allowedRegions: string[];
  allowedFromMinute: number | null;
  allowedToMinute: number | null;
  timezone: string;
};

export type FuelPurchaseRequest = {
  liters: number;
  amount: number;
  fuelType: FuelType;
  stationId?: string | null;
  stationBrand?: string | null;
  stationCountry?: string | null;
  at: Date;
};

/** Уже израсходовано по карте за текущие сутки / месяц (в часовом поясе карты). */
export type FuelCardUsage = { dayLiters: number; monthLiters: number; dayAmount: number; monthAmount: number };

export type LimitViolationCode =
  | "CARD_NOT_ACTIVE"
  | "CARD_EXPIRED"
  | "FUEL_TYPE_NOT_ALLOWED"
  | "STATION_NOT_ALLOWED"
  | "REGION_NOT_ALLOWED"
  | "TIME_NOT_ALLOWED"
  | "PER_TRANSACTION_LITERS"
  | "DAILY_LITERS"
  | "MONTHLY_LITERS"
  | "DAILY_AMOUNT"
  | "MONTHLY_AMOUNT"
  | "INSUFFICIENT_FUNDS";

export type LimitViolation = {
  code: LimitViolationCode;
  /** Для владельца */
  message: string;
  /** Для водителя — без раскрытия финансов компании */
  driverMessage: string;
};

const FUEL_LABEL: Record<FuelType, string> = {
  DIESEL: "дизель",
  PETROL: "бензин",
  LNG: "СПГ",
  CNG: "КПГ",
  LPG: "пропан",
  ADBLUE: "AdBlue",
  OTHER: "другое",
};

const fmtL = (n: number) => `${Math.round(n * 10) / 10} л`;
export const minuteToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Минуты от полуночи в часовом поясе. */
export function localMinute(at: Date, tz: string) {
  const { time } = utcToZonedParts(at, tz);
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Начало суток и месяца (UTC) для момента at в поясе tz. */
export function periodStarts(at: Date, tz: string) {
  const { date } = utcToZonedParts(at, tz);
  return { dayStart: zonedToUtc(date, "00:00", tz), monthStart: zonedToUtc(`${date.slice(0, 8)}01`, "00:00", tz) };
}

export function inTimeWindow(minute: number, from: number | null, to: number | null) {
  if (from == null || to == null) return true;
  return from <= to ? minute >= from && minute <= to : minute >= from || minute <= to; // окно через полночь
}

export function checkFuelPurchase(
  card: { status: FuelCardStatus; expiresAt: Date | null },
  limits: FuelCardLimits,
  req: FuelPurchaseRequest,
  usage: FuelCardUsage,
  account: { available: number },
): { allowed: boolean; violations: LimitViolation[] } {
  const v: LimitViolation[] = [];
  const add = (code: LimitViolationCode, message: string, driverMessage = message) => v.push({ code, message, driverMessage });

  if (card.status !== "ACTIVE")
    add(
      "CARD_NOT_ACTIVE",
      "Карта не активна (заблокирована, приостановлена или отменена).",
      "Карта заблокирована. Обратитесь к диспетчеру.",
    );
  if (card.expiresAt && card.expiresAt < req.at)
    add("CARD_EXPIRED", "Срок действия карты истёк.", "Срок действия карты истёк. Обратитесь к диспетчеру.");
  if (limits.allowedFuelTypes.length && !limits.allowedFuelTypes.includes(req.fuelType)) {
    add(
      "FUEL_TYPE_NOT_ALLOWED",
      `Тип топлива «${FUEL_LABEL[req.fuelType]}» не разрешён картой (разрешено: ${limits.allowedFuelTypes.map((f) => FUEL_LABEL[f]).join(", ")}).`,
    );
  }
  const brandOk =
    !limits.allowedStationBrands.length ||
    (req.stationBrand && limits.allowedStationBrands.some((b) => b.toLowerCase() === req.stationBrand!.toLowerCase()));
  const stationOk = !limits.allowedStationIds.length || (req.stationId && limits.allowedStationIds.includes(req.stationId));
  if (!brandOk || !stationOk)
    add("STATION_NOT_ALLOWED", "АЗС не входит в список разрешённых для карты.", "Эта АЗС не разрешена для вашей карты.");
  if (limits.allowedRegions.length && !(req.stationCountry && limits.allowedRegions.includes(req.stationCountry.toUpperCase()))) {
    add(
      "REGION_NOT_ALLOWED",
      `Регион АЗС не разрешён (разрешено: ${limits.allowedRegions.join(", ")}).`,
      "Заправка в этом регионе не разрешена.",
    );
  }
  if (!inTimeWindow(localMinute(req.at, limits.timezone), limits.allowedFromMinute, limits.allowedToMinute)) {
    const w = `${minuteToTime(limits.allowedFromMinute!)}–${minuteToTime(limits.allowedToMinute!)}`;
    add("TIME_NOT_ALLOWED", `Заправка вне разрешённого времени (${w}).`, `Заправка разрешена только ${w}.`);
  }
  if (limits.perTransactionLiters != null && req.liters > limits.perTransactionLiters) {
    add(
      "PER_TRANSACTION_LITERS",
      `Превышен лимит на одну заправку: ${fmtL(req.liters)} при лимите ${fmtL(limits.perTransactionLiters)}.`,
      `Лимит на одну заправку — ${fmtL(limits.perTransactionLiters)}.`,
    );
  }
  if (limits.dailyLiters != null && usage.dayLiters + req.liters > limits.dailyLiters) {
    add(
      "DAILY_LITERS",
      `Превышен дневной лимит: ${fmtL(usage.dayLiters)} уже заправлено, лимит ${fmtL(limits.dailyLiters)}.`,
      `Сегодня доступно ещё ${fmtL(Math.max(0, limits.dailyLiters - usage.dayLiters))}.`,
    );
  }
  if (limits.monthlyLiters != null && usage.monthLiters + req.liters > limits.monthlyLiters) {
    add(
      "MONTHLY_LITERS",
      `Превышен месячный лимит: ${fmtL(usage.monthLiters)} из ${fmtL(limits.monthlyLiters)}.`,
      `В этом месяце доступно ещё ${fmtL(Math.max(0, limits.monthlyLiters - usage.monthLiters))}.`,
    );
  }
  if (limits.dailyAmount != null && toMinor(usage.dayAmount) + toMinor(req.amount) > toMinor(limits.dailyAmount)) {
    add("DAILY_AMOUNT", "Превышен дневной лимит по сумме.", "Превышен дневной лимит по сумме. Обратитесь к диспетчеру.");
  }
  if (limits.monthlyAmount != null && toMinor(usage.monthAmount) + toMinor(req.amount) > toMinor(limits.monthlyAmount)) {
    add("MONTHLY_AMOUNT", "Превышен месячный лимит по сумме.", "Превышен месячный лимит по сумме. Обратитесь к диспетчеру.");
  }
  if (toMinor(req.amount) > toMinor(account.available)) {
    add("INSUFFICIENT_FUNDS", "Недостаточно средств на топливном счёте компании.", "Оплата не разрешена. Обратитесь к диспетчеру.");
  }
  return { allowed: v.length === 0, violations: v };
}

/** Остаток лимитов для водителя (в литрах; без финансов компании). */
export function remainingLiters(limits: FuelCardLimits, usage: FuelCardUsage) {
  const day = limits.dailyLiters != null ? Math.max(0, limits.dailyLiters - usage.dayLiters) : null;
  const month = limits.monthlyLiters != null ? Math.max(0, limits.monthlyLiters - usage.monthLiters) : null;
  const candidates = [limits.perTransactionLiters, day, month].filter((x): x is number => x != null);
  return { perTransaction: limits.perTransactionLiters, day, month, nowMax: candidates.length ? Math.min(...candidates) : null };
}
