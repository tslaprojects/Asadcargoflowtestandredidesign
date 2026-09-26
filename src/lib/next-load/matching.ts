/**
 * Next Load — подбор следующего груза для транспорта.
 *
 * Прозрачная модель без «магического» рейтинга:
 *  1. Совместимость (жёсткие фильтры): координаты, грузоподъёмность, объём, тип кузова, GPS.
 *  2. Время: транспорт успевает к окну погрузки с учётом дороги до точки погрузки; погрузка в периоде доступности.
 *  3. Геометрия:
 *     - направление не выбрано → погрузка в радиусе maxPickupDistanceKm от текущей точки, направление любое;
 *     - выбраны направления → коридор движения «текущая точка → направление» (эллипс с фокусами в этих точках):
 *       путь «текущая точка → погрузка → выгрузка → направление» длиннее прямого не более чем на allowedDeviationKm
 *       (допустимый крюк), и не менее половины пробега с грузом приближает к цели (груз едет «вперёд», а не в сторону).
 *       На длинных маршрутах коридор естественно шире в середине. Подходят и грузы с погрузкой по пути
 *       (например, Астана → Челябинск или Костанай → Москва по пути Алматы → Москва).
 *  4. Сортировка по понятным метрикам: пустой пробег + крюк (по умолчанию), расстояние до погрузки,
 *     отклонение, ставка за км, дата погрузки.
 *
 * Расстояния — оценка по прямой с коэффициентом извилистости (см. lib/geo/distance.ts), а не маршрутизация.
 */
import type { BodyType, Currency } from "@/generated/prisma/enums";
import { haversineKm, projectOnSegment, ROAD_FACTOR, type LatLng } from "@/lib/geo/distance";

/** Минимальная доля пробега с грузом, приближающая к цели направления (отсекает грузы «в сторону»). */
export const MIN_DIRECTION_SCORE = 0.5;

/** Средний суточный пробег грузовика, км (оценка для проверки «успевает ли к погрузке»). */
export const DAILY_RANGE_KM = 600;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

export type MatchVehicle = {
  bodyType: BodyType;
  capacityKg: number;
  volumeM3: number | null;
  gpsEnabled: boolean;
};

export type MatchPoint = LatLng & { city: string; country: string };

export type MatchCandidate = {
  id: string;
  pickup: MatchPoint | null;
  delivery: MatchPoint | null;
  weightKg: number;
  volumeM3: number | null;
  bodyType: BodyType | null;
  requiresGps: boolean;
  loadingDateFrom: Date;
  loadingDateTo: Date | null;
  targetPrice: number | null;
  currency: Currency;
};

export type MatchDestination = LatLng & { label: string };

export type MatchParams = {
  origin: LatLng & { label: string };
  destinations: MatchDestination[];
  allowedDeviationKm: number;
  maxPickupDistanceKm: number;
  availableFrom: Date;
  availableUntil: Date;
  vehicle: MatchVehicle | null;
  now?: Date;
};

export type NextLoadMatch = {
  loadId: string;
  /** Оценка дороги от текущей точки до погрузки, км */
  pickupDistanceKm: number;
  /** Максимальное удаление погрузки/выгрузки от прямой линии направления, км (0 — направление не задано) */
  routeDeviationKm: number;
  /** Крюк: дополнительный пробег относительно прямого пути к направлению, км */
  detourKm: number;
  /** Пустой пробег до погрузки, км */
  estimatedEmptyDistanceKm: number;
  /** Пробег с грузом, км */
  loadedDistanceKm: number;
  /** Общий пробег: до погрузки + с грузом (+ от выгрузки до выбранного направления), км */
  estimatedTotalDistanceKm: number;
  /** От выгрузки до выбранного направления, км (null — направление не задано) */
  remainingToDestinationKm: number | null;
  directionMatch: "ON_ROUTE" | "ANY";
  /** Доля пробега с грузом, которая приближает к цели (0..1); 1 — груз идёт точно по направлению */
  directionScore: number;
  destinationLabel: string | null;
  compatibility: { ok: true; warnings: string[] };
  estimatedPrice: number | null;
  currency: Currency;
  /** Ставка за км с грузом */
  ratePerKm: number | null;
  pickupDate: Date;
  /** Ожидаемое прибытие на погрузку */
  arrivalAtPickup: Date;
  matchReason: string[];
};

export type Rejection = { loadId: string; reasons: string[] };

export type MatchSort = "efficiency" | "pickup" | "deviation" | "rate" | "date";

const BODY_LABELS: Record<BodyType, string> = {
  CURTAINSIDER: "тент",
  REFRIGERATOR: "рефрижератор",
  ISOTHERMAL: "изотерм",
  BOX: "фургон",
  FLATBED: "площадка",
  CONTAINER: "контейнеровоз",
  TANKER: "цистерна",
  LOWBED: "трал",
  OTHER: "другой",
};

/** Какие кузова могут выполнить заявку на кузов X (рефрижератор заменяет изотерм). */
const BODY_COMPATIBLE: Partial<Record<BodyType, BodyType[]>> = {
  ISOTHERMAL: ["ISOTHERMAL", "REFRIGERATOR"],
};

export function bodyCompatible(required: BodyType | null, actual: BodyType): boolean {
  if (!required) return true;
  return (BODY_COMPATIBLE[required] ?? [required]).includes(actual);
}

const round = (n: number) => Math.round(n);
const fmtDate = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit" });
const tons = (kg: number) => `${Math.round((kg / 1000) * 10) / 10} т`;

/** Проверка совместимости груза и автомобиля. Пустой массив — совместимы. */
export function compatibilityProblems(c: MatchCandidate, v: MatchVehicle | null): string[] {
  const problems: string[] = [];
  if (!v) return problems;
  if (c.weightKg > v.capacityKg)
    problems.push(`Недостаточная грузоподъёмность: груз ${tons(c.weightKg)}, автомобиль ${tons(v.capacityKg)}`);
  if (c.volumeM3 && v.volumeM3 && c.volumeM3 > v.volumeM3)
    problems.push(`Недостаточный объём кузова: груз ${c.volumeM3} м³, кузов ${v.volumeM3} м³`);
  if (!bodyCompatible(c.bodyType, v.bodyType)) {
    problems.push(`Нужен кузов «${BODY_LABELS[c.bodyType!]}», у автомобиля «${BODY_LABELS[v.bodyType]}»`);
  }
  if (c.requiresGps && !v.gpsEnabled) problems.push("Груз требует GPS, у автомобиля GPS нет");
  return problems;
}

export function matchNextLoads(params: MatchParams, candidates: MatchCandidate[], sort: MatchSort = "efficiency") {
  const now = params.now ?? new Date();
  const matches: NextLoadMatch[] = [];
  const rejected: Rejection[] = [];
  const O = params.origin;

  for (const c of candidates) {
    const reasons: string[] = [];
    if (!c.pickup || !c.delivery) {
      rejected.push({ loadId: c.id, reasons: ["Нет координат точек погрузки/выгрузки"] });
      continue;
    }
    const P = c.pickup;
    const Q = c.delivery;
    reasons.push(...compatibilityProblems(c, params.vehicle));

    // Время
    const pickupStraight = haversineKm(O, P);
    const pickupKm = pickupStraight * ROAD_FACTOR;
    const start = params.availableFrom > now ? params.availableFrom : now;
    const arrival = new Date(start.getTime() + (pickupKm / DAILY_RANGE_KM) * DAY);
    const loadingEnd = c.loadingDateTo ?? new Date(c.loadingDateFrom.getTime() + DAY);
    if (loadingEnd < now) reasons.push("Окно погрузки уже прошло");
    else if (arrival > loadingEnd)
      reasons.push(`Не успеваете к погрузке: прибытие ≈ ${fmtDate(arrival)}, погрузка до ${fmtDate(loadingEnd)}`);
    if (c.loadingDateFrom > params.availableUntil) {
      reasons.push(`Погрузка ${fmtDate(c.loadingDateFrom)} — позже периода доступности (до ${fmtDate(params.availableUntil)})`);
    }

    // Геометрия
    const loadedStraight = haversineKm(P, Q);
    let best: {
      deviation: number;
      detour: number;
      remaining: number;
      score: number;
      label: string;
    } | null = null;
    const geoReasons: string[] = [];
    if (params.destinations.length === 0) {
      if (pickupKm > params.maxPickupDistanceKm) {
        geoReasons.push(`Погрузка в ≈ ${round(pickupKm)} км — дальше радиуса поиска ${params.maxPickupDistanceKm} км`);
      }
    } else {
      for (const D of params.destinations) {
        const pP = projectOnSegment(P, O, D);
        const pQ = projectOnSegment(Q, O, D);
        const direct = haversineKm(O, D);
        const remaining = haversineKm(Q, D);
        // Крюк: насколько путь «текущая точка → погрузка → выгрузка → направление» длиннее прямого пути
        const detour = Math.max(0, pickupStraight + loadedStraight + remaining - direct) * ROAD_FACTOR;
        const progress = pQ.alongKm - pP.alongKm;
        const score = loadedStraight > 0 ? Math.max(0, Math.min(1, progress / loadedStraight)) : 0;
        const problems: string[] = [];
        if (detour > params.allowedDeviationKm) problems.push(`крюк ≈ ${round(detour)} км (допустимо ${params.allowedDeviationKm} км)`);
        if (score < MIN_DIRECTION_SCORE) {
          problems.push(progress <= 0 ? "груз едет в обратную сторону" : "груз едет в сторону от направления");
        }
        if (problems.length) {
          geoReasons.push(`Не по пути в ${D.label}: ${problems.join(", ")}`);
          continue;
        }
        const deviation = Math.max(pP.distanceKm, pQ.distanceKm);
        if (!best || detour < best.detour) best = { deviation, detour, remaining: remaining * ROAD_FACTOR, score, label: D.label };
      }
      if (best) geoReasons.length = 0;
    }
    reasons.push(...geoReasons);

    if (reasons.length) {
      rejected.push({ loadId: c.id, reasons });
      continue;
    }

    const loadedKm = loadedStraight * ROAD_FACTOR;
    const ratePerKm = c.targetPrice && loadedKm > 0 ? Math.round((c.targetPrice / loadedKm) * 100) / 100 : null;
    const why: string[] = [];
    why.push(
      pickupKm < 30 ? `Погрузка рядом с текущей точкой (${P.city})` : `Погрузка в ${P.city}, ≈ ${round(pickupKm)} км от текущей точки`,
    );
    if (best) {
      why.push(best.detour < 30 ? `Идёт по направлению «${best.label}»` : `По пути в «${best.label}», крюк ≈ ${round(best.detour)} км`);
      if (best.remaining > 30) why.push(`После выгрузки до «${best.label}» ≈ ${round(best.remaining)} км`);
      else why.push(`Выгрузка в пункте назначения`);
    } else {
      why.push(`Направление: ${P.city} → ${Q.city}`);
    }
    if (params.vehicle) {
      why.push(
        `Автомобиль подходит: ${tons(c.weightKg)} из ${tons(params.vehicle.capacityKg)}${c.bodyType ? `, кузов ${BODY_LABELS[params.vehicle.bodyType]}` : ""}`,
      );
    }
    why.push(`Успеваете к погрузке ${fmtDate(c.loadingDateFrom)} (прибытие ≈ ${fmtDate(arrival)})`);
    const warnings: string[] = [];
    if (!params.vehicle) warnings.push("Автомобиль не выбран — проверьте кузов и грузоподъёмность");

    matches.push({
      loadId: c.id,
      pickupDistanceKm: round(pickupKm),
      routeDeviationKm: best ? round(best.deviation) : 0,
      detourKm: best ? round(best.detour) : 0,
      estimatedEmptyDistanceKm: round(pickupKm),
      loadedDistanceKm: round(loadedKm),
      estimatedTotalDistanceKm: round(pickupKm + loadedKm + (best?.remaining ?? 0)),
      remainingToDestinationKm: best ? round(best.remaining) : null,
      directionMatch: best ? "ON_ROUTE" : "ANY",
      directionScore: best ? Math.round(best.score * 100) / 100 : 0,
      destinationLabel: best?.label ?? null,
      compatibility: { ok: true, warnings },
      estimatedPrice: c.targetPrice,
      currency: c.currency,
      ratePerKm,
      pickupDate: c.loadingDateFrom,
      arrivalAtPickup: arrival,
      matchReason: why,
    });
  }

  matches.sort(comparator(sort));
  return { matches, rejected };
}

function comparator(sort: MatchSort) {
  return (a: NextLoadMatch, b: NextLoadMatch) => {
    switch (sort) {
      case "pickup":
        return a.pickupDistanceKm - b.pickupDistanceKm;
      case "deviation":
        return a.detourKm - b.detourKm || a.pickupDistanceKm - b.pickupDistanceKm;
      case "rate":
        return (b.ratePerKm ?? -1) - (a.ratePerKm ?? -1);
      case "date":
        return a.pickupDate.getTime() - b.pickupDate.getTime();
      default:
        // Меньше «лишнего» пробега: пустой пробег до погрузки + крюк относительно прямого пути
        return (
          a.estimatedEmptyDistanceKm + a.detourKm - (b.estimatedEmptyDistanceKm + b.detourKm) ||
          a.pickupDate.getTime() - b.pickupDate.getTime()
        );
    }
  };
}
