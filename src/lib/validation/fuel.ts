import { z } from "zod";
import { currencySchema, filterDate, optionalDate, optionalText, requiredText } from "./common";

export const FUEL_TYPES = ["DIESEL", "PETROL", "LNG", "CNG", "LPG", "ADBLUE", "OTHER"] as const;

const optionalPositive = (max: number) =>
  z
    .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().positive("Должно быть больше 0").max(max, `Не больше ${max}`)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

/** «06:00» → 360 минут; пусто → null */
const timeOfDay = z
  .union([z.literal(""), z.null(), z.undefined(), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")])
  .optional()
  .transform((v) => {
    if (!v) return null;
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  });

const stringList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max)
    .default([])
    .transform((a) => [...new Set(a)]);

export const fuelCardLimitsSchema = z
  .object({
    perTransactionLiters: optionalPositive(5000),
    dailyLiters: optionalPositive(20_000),
    monthlyLiters: optionalPositive(500_000),
    dailyAmount: optionalPositive(1e11),
    monthlyAmount: optionalPositive(1e12),
    allowedFuelTypes: z.array(z.enum(FUEL_TYPES)).max(FUEL_TYPES.length).default([]),
    allowedStationBrands: stringList(30),
    allowedStationIds: stringList(200),
    allowedRegions: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/, "Код страны/региона, например KZ"),
      )
      .max(50)
      .default([]),
    allowedFrom: timeOfDay,
    allowedTo: timeOfDay,
    driverCanSeeFuelLevel: z.coerce.boolean().default(true),
  })
  .refine((v) => (v.allowedFrom == null) === (v.allowedTo == null), {
    message: "Укажите начало и конец разрешённого времени",
    path: ["allowedTo"],
  })
  .transform(({ allowedFrom, allowedTo, ...rest }) => ({ ...rest, allowedFromMinute: allowedFrom, allowedToMinute: allowedTo }));

export const fuelCardCreateSchema = z
  .object({
    label: requiredText(2, 30, "Укажите номер карты в компании, например FC-001").transform((v) => v.toUpperCase()),
    currency: currencySchema,
    vehicleId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    driverId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
  })
  .and(fuelCardLimitsSchema);

export const fuelCardAssignSchema = z.object({
  vehicleId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  driverId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
});

export const fuelCardStatusSchema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED", "SUSPENDED", "LOST", "CANCELLED"]),
  reason: optionalText(500),
});

export const fuelTopUpSchema = z.object({
  amount: z.coerce.number({ message: "Укажите сумму" }).positive("Сумма должна быть больше 0").max(1e11),
  currency: currencySchema,
  /** Номер платёжного поручения / операции у провайдера */
  reference: optionalText(120),
  note: optionalText(500),
});

export const vehicleFuelSettingsSchema = z.object({
  fuelType: z
    .enum(FUEL_TYPES)
    .nullish()
    .transform((v) => v ?? null),
  engineType: optionalText(60),
  tankCapacityLiters: optionalPositive(5000),
  fuelNormPer100Km: optionalPositive(200),
  telematicsProvider: optionalText(40),
  telematicsDeviceId: optionalText(80),
});

const coord = (min: number, max: number) =>
  z
    .union([z.null(), z.undefined(), z.coerce.number().min(min).max(max)])
    .optional()
    .transform((v) => (v === undefined ? null : v));

/** Заправка (от процессинга карт или демо-симулятора). Сумма считается на сервере. */
export const fuelPurchaseSchema = z.object({
  fuelCardId: z.uuid({ message: "Выберите карту" }),
  stationName: requiredText(2, 120, "Укажите АЗС"),
  stationBrand: optionalText(60),
  stationId: optionalText(80),
  stationAddress: optionalText(200),
  stationCountry: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .nullish()
    .transform((v) => v ?? null),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  fuelType: z.enum(FUEL_TYPES),
  liters: z.coerce.number({ message: "Укажите литры" }).positive("Больше 0").max(5000),
  pricePerLiter: z.coerce.number({ message: "Укажите цену" }).positive("Больше 0").max(1e7),
  transactionDate: optionalDate,
});

/** Водитель регистрирует заправку в демо-режиме: карта определяется сервером. */
export const driverFuelPurchaseSchema = fuelPurchaseSchema.omit({ fuelCardId: true, transactionDate: true });

export const telemetryReadingSchema = z
  .object({
    recordedAt: z.coerce.date({ message: "Укажите время показания" }),
    latitude: coord(-90, 90),
    longitude: coord(-180, 180),
    speedKmh: coord(0, 300),
    heading: coord(0, 360),
    engineOn: z
      .boolean()
      .nullish()
      .transform((v) => v ?? null),
    odometerKm: coord(0, 10_000_000),
    fuelLevelLiters: coord(0, 5000),
    fuelLevelSource: z
      .enum(["CAN_J1939", "FUEL_SENSOR"])
      .nullish()
      .transform((v) => v ?? null),
    fuelUsedTotalL: coord(0, 1e9),
  })
  .refine((r) => r.fuelLevelLiters == null || r.fuelLevelSource != null, {
    message: "Для уровня топлива укажите источник: CAN_J1939 или FUEL_SENSOR",
    path: ["fuelLevelSource"],
  })
  .refine((r) => (r.latitude == null) === (r.longitude == null), { message: "Укажите обе координаты", path: ["longitude"] });

export const telemetryIngestSchema = z.object({
  deviceId: z.string().trim().min(1).max(80),
  readings: z.array(telemetryReadingSchema).min(1).max(1000),
});

export const fuelProviderEventSchema = z.object({
  type: z.enum(["AUTHORIZATION_REQUEST", "COMPLETED", "REVERSED", "REFUNDED"]),
  providerCardId: z.string().min(3).max(120),
  providerTransactionId: z.string().min(3).max(120),
  stationName: z.string().max(120).default("АЗС"),
  stationBrand: z.string().max(60).nullish(),
  stationId: z.string().max(80).nullish(),
  stationAddress: z.string().max(200).nullish(),
  stationCountry: z.string().length(2).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  fuelType: z.enum(FUEL_TYPES).default("DIESEL"),
  liters: z.number().positive().max(5000),
  pricePerLiter: z.number().positive().max(1e7),
  totalAmount: z.number().positive().max(1e11).nullish(),
  transactionDate: z.coerce.date(),
});

export const fuelTxActionSchema = z.object({
  action: z.enum(["REVERSE", "REFUND", "DISPUTE", "RESOLVE_DISPUTE"]),
  reason: requiredText(3, 500, "Укажите причину"),
});

export const anomalyReviewSchema = z.object({
  decision: z.enum(["CONFIRM", "DISMISS"]),
  comment: optionalText(1000),
});

export const investigationCreateSchema = z.object({
  anomalyIds: z.array(z.uuid()).min(1, "Выберите несоответствие").max(50),
  title: optionalText(200),
  comment: optionalText(4000),
});

export const investigationUpdateSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "DISMISSED"]),
  resolution: optionalText(4000),
});

export const investigationCommentSchema = z.object({ message: requiredText(1, 4000, "Введите комментарий") });

export const investigationLinkSchema = z.object({ fuelTransactionId: z.uuid() });

export const fuelListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  from: filterDate,
  to: filterDate,
  vehicleId: z.uuid().optional(),
  driverId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  station: z.string().trim().max(100).optional(),
  status: z.enum(["PENDING", "AUTHORIZED", "APPROVED", "COMPLETED", "DECLINED", "REVERSED", "REFUNDED", "DISPUTED"]).optional(),
  match: z.enum(["PENDING", "MATCHED", "PARTIALLY_VERIFIED", "UNVERIFIED", "MISMATCH"]).optional(),
});
