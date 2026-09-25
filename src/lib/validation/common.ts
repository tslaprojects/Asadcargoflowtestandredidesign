import { z } from "zod";
import { isValidCountry } from "@/lib/geo/countries";

export const idSchema = z.uuid({ message: "Некорректный идентификатор" });

export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Не более ${max} символов`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const requiredText = (min = 1, max = 200, msg = "Обязательное поле") =>
  z.string({ message: msg }).trim().min(min, msg).max(max, `Не более ${max} символов`);

export const countrySchema = z
  .string({ message: "Выберите страну" })
  .trim()
  .toUpperCase()
  .refine((c) => isValidCountry(c), "Выберите страну из списка");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Введите телефон в международном формате, например +7 700 000 00 00");

export const dateSchema = z.coerce.date({ message: "Укажите корректную дату" });

export const optionalDate = z
  .union([z.literal(""), z.null(), z.undefined(), z.coerce.date({ message: "Укажите корректную дату" })])
  .optional()
  .transform((v) => (v instanceof Date ? v : null));

export const positiveNumber = (msg: string) => z.coerce.number({ message: msg }).positive(msg);

export const optionalPositiveNumber = (msg: string) =>
  z
    .union([z.literal(""), z.null(), z.undefined(), z.coerce.number({ message: msg })])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v))
    .refine((v) => v === null || v > 0, msg);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const currencySchema = z.enum(["USD", "CNY", "KZT", "RUB"], { message: "Выберите валюту" });
