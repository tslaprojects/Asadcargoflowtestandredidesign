/** Форматирование дат/чисел. Даты хранятся в UTC, отображаются в часовом поясе пользователя. */
export const DEFAULT_TZ = "Asia/Almaty";
export const LOCALE = "ru-RU";

type D = Date | string | number | null | undefined;

function toDate(d: D): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(d: D, tz = DEFAULT_TZ): string {
  const date = toDate(d);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatDateTime(d: D, tz = DEFAULT_TZ): string {
  const date = toDate(d);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(d: D, tz = DEFAULT_TZ): string {
  const date = toDate(d);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatShortDate(d: D, tz = DEFAULT_TZ): string {
  const date = toDate(d);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, day: "numeric", month: "short" }).format(date);
}

export function formatDateRange(from: D, to: D, tz = DEFAULT_TZ): string {
  const a = toDate(from);
  const b = toDate(to);
  if (!a && !b) return "—";
  if (a && b && formatDate(a, tz) !== formatDate(b, tz)) return `${formatShortDate(a, tz)} — ${formatShortDate(b, tz)}`;
  return formatDate(a ?? b, tz);
}

export function formatRelative(d: D, now = new Date()): string {
  const date = toDate(d);
  if (!date) return "—";
  const diff = (date.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(date);
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(n);
}

export function formatWeight(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "—";
  return kg >= 1000 ? `${formatNumber(kg / 1000, 2)} т` : `${formatNumber(kg)} кг`;
}

export function formatVolume(m3: number | null | undefined): string {
  if (m3 === null || m3 === undefined) return "—";
  return `${formatNumber(m3, 1)} м³`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} КБ`;
  return `${formatNumber(bytes / 1024 / 1024, 1)} МБ`;
}

/** Дата и время в локальном часовом поясе точки маршрута (например, «10:00 по Пекину»). */
export function formatInZone(d: D, tz: string | null | undefined): string {
  return formatDateTime(d, tz || DEFAULT_TZ);
}
