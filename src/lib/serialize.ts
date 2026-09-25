/**
 * Преобразует результат Prisma в «плоский» объект, пригодный для JSON и передачи
 * в клиентские компоненты: Decimal → number, BigInt → number. Date сохраняется.
 */
type DecimalLike = { toNumber: () => number; d: unknown; e: unknown; s: unknown };

function isDecimal(v: unknown): v is DecimalLike {
  return typeof v === "object" && v !== null && typeof (v as DecimalLike).toNumber === "function" && "d" in v && "e" in v && "s" in v;
}

export type Plain<T> = T extends DecimalLike
  ? number
  : T extends Date
    ? Date
    : T extends bigint
      ? number
      : T extends Array<infer U>
        ? Plain<U>[]
        : T extends object
          ? { [K in keyof T]: Plain<T[K]> }
          : T;

export function toPlain<T>(value: T): Plain<T> {
  return convert(value) as Plain<T>;
}

function convert(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (isDecimal(v)) return v.toNumber();
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(convert);
  if (typeof v === "object") {
    if (typeof (v as { toJSON?: unknown }).toJSON === "function" && !(Object.getPrototypeOf(v) === Object.prototype))
      return (v as { toJSON: () => unknown }).toJSON();
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = convert(val);
    return out;
  }
  return v;
}

/** Decimal | number | null → number | null */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (isDecimal(v)) return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
