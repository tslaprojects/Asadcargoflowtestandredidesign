import { ru, type Messages } from "./messages/ru";

export const DEFAULT_LOCALE = "ru-RU";
const dictionaries: Record<string, Messages> = { "ru-RU": ru };

let current: Messages = ru;

/** Активный словарь. Для мультиязычности — выбирать по локали пользователя. */
export function messages(locale: string = DEFAULT_LOCALE): Messages {
  return dictionaries[locale] ?? current;
}

export function setLocale(locale: string) {
  current = dictionaries[locale] ?? ru;
}

type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Path<Messages>;

/** t("common.save") → «Сохранить». Поддерживает {param}-подстановки. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const value = key.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], current);
  const str = typeof value === "string" ? value : key;
  return params ? str.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? `{${p}}`)) : str;
}

type EnumDict = Messages["enums"];
export type EnumName = keyof EnumDict;

/** Человекочитаемая подпись значения enum: label("LoadStatus", "DRAFT") → «Черновик». */
export function label<E extends EnumName>(enumName: E, value: string | null | undefined): string {
  if (!value) return "—";
  const dict = current.enums[enumName] as Record<string, string>;
  return dict?.[value] ?? value;
}

/** Опции для select по enum. */
export function enumOptions<E extends EnumName>(enumName: E): { value: string; label: string }[] {
  const dict = current.enums[enumName] as Record<string, string>;
  return Object.entries(dict).map(([value, l]) => ({ value, label: l }));
}
