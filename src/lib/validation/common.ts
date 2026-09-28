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

/** Дата из фильтра (YYYY-MM-DD или ISO). Пусто — фильтр не задан; мусор — ошибка валидации, а не 500. */
export const filterDate = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, "Некорректная дата"),
  ])
  .optional()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "Некорректная дата")
  .transform((v) => (v ? v.slice(0, 10) : undefined))
  .optional();

/** Необязательный UUID из query; пусто — не задан. */
export const optionalUuidParam = z
  .union([z.literal(""), z.uuid({ message: "Некорректный идентификатор" })])
  .optional()
  .transform((v) => (v ? v : undefined))
  .optional();
