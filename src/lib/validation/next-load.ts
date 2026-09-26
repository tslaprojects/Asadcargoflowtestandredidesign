import { z } from "zod";
import { optionalDate, optionalText } from "./common";

const countryCode = z
  .string()
  .trim()
  .length(2, "Код страны из 2 букв")
  .transform((v) => v.toUpperCase());

/** Точка: город из справочника (страна + город) или координаты, выбранные на карте. */
export const movementPointSchema = z
  .object({
    country: countryCode.optional().nullable(),
    city: z.string().trim().min(1).max(100).optional().nullable(),
    latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
    longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
    label: z.string().trim().max(120).optional().nullable(),
  })
  .refine((p) => (p.country && p.city) || (p.latitude != null && p.longitude != null), {
    message: "Укажите город или выберите точку на карте",
  });

export const plannedMovementSchema = z
  .object({
    vehicleId: z.uuid().optional().nullable(),
    sourceOrderId: z.uuid().optional().nullable(),
    intent: z.enum(["RETURN", "CITY", "DIRECTION", "UNDECIDED"], { message: "Выберите, что планируете дальше" }),
    /** Текущая точка. Не указана — определяется по рейсу (последняя отметка водителя или адрес разгрузки). */
    origin: movementPointSchema.optional().nullable(),
    destinations: z.array(movementPointSchema).max(5, "Не более 5 направлений").default([]),
    allowedDeviationKm: z.coerce.number().int().min(10, "Не меньше 10 км").max(1000, "Не больше 1000 км").default(250),
    maxPickupDistanceKm: z.coerce.number().int().min(10, "Не меньше 10 км").max(2000, "Не больше 2000 км").default(300),
    availableFrom: optionalDate,
    availableUntil: optionalDate,
    note: optionalText(500),
  })
  .refine((m) => m.intent === "UNDECIDED" || m.intent === "RETURN" || m.destinations.length > 0, {
    message: "Выберите хотя бы одно направление",
    path: ["destinations"],
  });

export const matchQuerySchema = z.object({
  sort: z.enum(["efficiency", "pickup", "deviation", "rate", "date"]).default("efficiency"),
});
