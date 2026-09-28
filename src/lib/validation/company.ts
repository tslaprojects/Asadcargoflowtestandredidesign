import { z } from "zod";
import { companyCreateSchema, emailSchema } from "./auth";
import { booleanish, countrySchema, optionalDate, optionalText, phoneSchema, requiredText } from "./common";
import { BODY_TYPES, VEHICLE_TYPES } from "./load";

export const companyUpdateSchema = companyCreateSchema.omit({ type: true, registrationNumber: true, country: true }).partial();

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["SHIPPER", "CARRIER_ADMIN", "CARRIER_DISPATCHER", "FORWARDER", "DRIVER"]),
  driverProfileId: z.uuid().optional().nullable(),
});

export const memberUpdateSchema = z.object({
  role: z.enum(["SHIPPER", "CARRIER_ADMIN", "CARRIER_DISPATCHER", "FORWARDER", "DRIVER"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const verificationSubmitSchema = z.object({ comment: optionalText(1000) });

export const verificationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES", "SUSPEND", "RESTORE"]),
  comment: optionalText(1000),
});

export const vehicleSchema = z.object({
  plateNumber: requiredText(3, 20, "Укажите госномер").transform((v) => v.toUpperCase().replace(/\s+/g, " ")),
  country: countrySchema,
  make: requiredText(1, 50, "Укажите марку"),
  model: requiredText(1, 50, "Укажите модель"),
  year: z
    .union([
      z.literal(""),
      z.null(),
      z.undefined(),
      z.coerce
        .number()
        .int()
        .min(1970)
        // Верхняя граница считается при каждой проверке, а не один раз при запуске сервера
        .refine((y) => y <= new Date().getFullYear() + 1, "Год выпуска не может быть в будущем"),
    ])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  vehicleType: z.enum(VEHICLE_TYPES, { message: "Выберите тип транспорта" }),
  bodyType: z.enum(BODY_TYPES, { message: "Выберите тип кузова" }),
  capacityKg: z.coerce.number({ message: "Укажите грузоподъёмность" }).positive("Грузоподъёмность должна быть больше 0"),
  volumeM3: z
    .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().positive("Объём должен быть больше 0")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  vin: optionalText(17),
  gpsEnabled: booleanish.default(false),
  status: z.enum(["AVAILABLE", "INACTIVE", "MAINTENANCE"]).optional(),
});

export const driverSchema = z.object({
  fullName: requiredText(3, 120, "Укажите ФИО водителя"),
  phone: phoneSchema,
  licenseNumber: requiredText(3, 30, "Укажите номер водительского удостоверения"),
  licenseCategory: requiredText(1, 20, "Укажите категорию"),
  licenseExpiry: optionalDate,
  passportNumber: optionalText(30),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  /** Пригласить водителя в приложение по email */
  inviteEmail: z
    .union([z.literal(""), z.null(), z.undefined(), emailSchema])
    .optional()
    .transform((v) => (v ? v : null)),
});

export const platformSettingsSchema = z
  .object({
    commissionPercent: z.coerce.number().min(0, "Не меньше 0").max(50, "Не больше 50%"),
    commissionFixed: z
      .object({
        USD: z.coerce.number().min(0).max(1_000_000).optional(),
        CNY: z.coerce.number().min(0).max(1_000_000).optional(),
        KZT: z.coerce.number().min(0).max(100_000_000).optional(),
        RUB: z.coerce.number().min(0).max(100_000_000).optional(),
      })
      .default({}),
    secureDealEnabled: booleanish.default(true),
    requireSecureDeal: booleanish.default(false),
    confirmationWindowHours: z.coerce
      .number()
      .int("Целое число часов")
      .min(1, "Не меньше 1 часа")
      .max(24 * 30, "Не больше 30 дней")
      .default(72),
    autoConfirmOnTimeout: booleanish.default(true),
    requirePodForClose: booleanish,
    restrictedCargoTypes: z.array(z.enum(["GENERAL", "ELECTRONICS", "CLOTHING", "FOOD", "EQUIPMENT", "AUTOMOTIVE", "CHEMICAL", "OTHER"])),
    requireVerifiedToPublish: booleanish,
    requireVerifiedToBid: booleanish.default(false),
    supportEmail: z.union([z.literal(""), emailSchema]).default(""),
  })
  .refine((v) => !v.requireSecureDeal || v.secureDealEnabled, {
    message: "Нельзя требовать безопасную сделку, если она отключена: ни одна перевозка не сможет начать загрузку",
    path: ["requireSecureDeal"],
  });

export const adminUserActionSchema = z.object({
  action: z.enum(["BLOCK", "UNBLOCK"]),
  reason: optionalText(500),
});

export const companyAdminListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  type: z
    .enum(["SHIPPER", "CARRIER", "FORWARDER"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  verification: z
    .enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "SUSPENDED"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export { optionalDate };
