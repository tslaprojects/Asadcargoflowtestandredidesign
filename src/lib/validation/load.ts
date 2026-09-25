import { z } from "zod";
import { countrySchema, currencySchema, optionalDate, optionalPositiveNumber, optionalText, positiveNumber, requiredText } from "./common";

export const CARGO_TYPES = ["GENERAL", "ELECTRONICS", "CLOTHING", "FOOD", "EQUIPMENT", "AUTOMOTIVE", "CHEMICAL", "OTHER"] as const;
export const VEHICLE_TYPES = ["TRACTOR_TRAILER", "TRUCK", "VAN", "ROAD_TRAIN"] as const;
export const BODY_TYPES = [
  "CURTAINSIDER",
  "REFRIGERATOR",
  "ISOTHERMAL",
  "BOX",
  "FLATBED",
  "CONTAINER",
  "TANKER",
  "LOWBED",
  "OTHER",
] as const;

const optionalCoord = (min: number, max: number) =>
  z
    .union([z.null(), z.undefined(), z.literal(""), z.coerce.number()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v))
    .refine((v) => v === null || (v >= min && v <= max), "Некорректная координата");

export const loadStopSchema = z
  .object({
    type: z.enum(["PICKUP", "BORDER", "DELIVERY", "TRANSIT"]),
    country: countrySchema,
    region: optionalText(100),
    city: requiredText(1, 100, "Укажите город"),
    street: optionalText(200),
    building: optionalText(50),
    postalCode: optionalText(20),
    fullAddress: optionalText(400),
    latitude: optionalCoord(-90, 90),
    longitude: optionalCoord(-180, 180),
    contactName: optionalText(100),
    contactPhone: optionalText(30),
    plannedDateFrom: optionalDate,
    plannedDateTo: optionalDate,
    timezone: optionalText(64),
    notes: optionalText(500),
  })
  .superRefine((s, ctx) => {
    if (s.plannedDateFrom && s.plannedDateTo && s.plannedDateTo < s.plannedDateFrom) {
      ctx.addIssue({ code: "custom", path: ["plannedDateTo"], message: "Окончание окна не может быть раньше начала" });
    }
  });

export const loadInputSchema = z
  .object({
    title: requiredText(3, 200, "Укажите название груза (не менее 3 символов)"),
    clientName: optionalText(200),
    cargoType: z.enum(CARGO_TYPES, { message: "Выберите тип груза" }),
    cargoDescription: optionalText(2000),
    weightKg: positiveNumber("Вес должен быть больше 0").max(100_000, "Вес не может превышать 100 000 кг"),
    volumeM3: optionalPositiveNumber("Объём должен быть больше 0"),
    packagesCount: z
      .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int("Целое число").min(1, "Не менее 1")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    packageType: optionalText(100),
    vehicleType: z
      .union([z.enum(VEHICLE_TYPES), z.literal(""), z.null(), z.undefined()])
      .optional()
      .transform((v) => (v ? v : null)),
    bodyType: z
      .union([z.enum(BODY_TYPES), z.literal(""), z.null(), z.undefined()])
      .optional()
      .transform((v) => (v ? v : null)),
    temperatureFrom: z
      .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().min(-40).max(40)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    temperatureTo: z
      .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().min(-40).max(40)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    requiresGps: z.coerce.boolean().default(false),
    requirements: optionalText(2000),
    priceType: z.enum(["FIXED", "NEGOTIABLE", "REQUEST_QUOTE"], { message: "Выберите тип цены" }),
    targetPrice: z
      .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().min(0, "Стоимость не может быть отрицательной")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    currency: currencySchema,
    additionalTerms: optionalText(3000),
    notes: optionalText(2000),
    visibility: z.enum(["MARKETPLACE", "INVITE_ONLY"]).default("MARKETPLACE"),
    invitedCarrierIds: z.array(z.uuid()).max(50).default([]),
    stops: z.array(loadStopSchema).min(2, "Маршрут должен содержать минимум точку загрузки и точку доставки").max(12),
  })
  .superRefine((v, ctx) => {
    const first = v.stops[0];
    const last = v.stops[v.stops.length - 1];
    if (!first || first.type !== "PICKUP") {
      ctx.addIssue({ code: "custom", path: ["stops", 0, "type"], message: "Первая точка маршрута — загрузка" });
    }
    if (!last || last.type !== "DELIVERY") {
      ctx.addIssue({ code: "custom", path: ["stops", v.stops.length - 1, "type"], message: "Последняя точка — доставка" });
    }
    if (first && !first.plannedDateFrom) {
      ctx.addIssue({ code: "custom", path: ["stops", 0, "plannedDateFrom"], message: "Укажите дату загрузки" });
    }
    if (first?.plannedDateFrom && last?.plannedDateFrom && last.plannedDateFrom < first.plannedDateFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["stops", v.stops.length - 1, "plannedDateFrom"],
        message: "Дата доставки не может быть раньше даты загрузки",
      });
    }
    if (v.priceType === "FIXED" && (v.targetPrice === null || v.targetPrice <= 0)) {
      ctx.addIssue({ code: "custom", path: ["targetPrice"], message: "Для фиксированной цены укажите стоимость" });
    }
    if (v.temperatureFrom !== null && v.temperatureTo !== null && v.temperatureFrom > v.temperatureTo) {
      ctx.addIssue({ code: "custom", path: ["temperatureTo"], message: "Верхняя граница меньше нижней" });
    }
    if (v.visibility === "INVITE_ONLY" && v.invitedCarrierIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["invitedCarrierIds"], message: "Выберите хотя бы одного перевозчика" });
    }
  });

export type LoadInput = z.input<typeof loadInputSchema>;
export type LoadParsed = z.output<typeof loadInputSchema>;

export const loadCancelSchema = z.object({ reason: optionalText(500) });

export const loadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(100).optional(),
  from: z.string().trim().max(100).optional(),
  to: z.string().trim().max(100).optional(),
  country: z.string().trim().max(2).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  bodyType: z
    .enum(BODY_TYPES)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  weightMin: z.coerce
    .number()
    .min(0)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  weightMax: z.coerce
    .number()
    .min(0)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  priceMin: z.coerce
    .number()
    .min(0)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  priceMax: z.coerce
    .number()
    .min(0)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  currency: currencySchema.optional().or(z.literal("").transform(() => undefined)),
  verifiedOnly: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false"), z.literal("")])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  status: z.string().optional(),
  sort: z.enum(["loadingDate", "price", "published", "-price"]).default("published"),
  scope: z.enum(["marketplace", "mine"]).default("marketplace"),
});

export const loadQuestionSchema = z.object({ question: requiredText(3, 1000, "Введите вопрос") });
export const loadAnswerSchema = z.object({ answer: requiredText(1, 2000, "Введите ответ") });
