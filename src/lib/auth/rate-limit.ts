import { AppError } from "@/lib/errors";

/**
 * Простой in-memory rate limiter (fixed window).
 * Для нескольких инстансов замените реализацию на Redis, сохранив интерфейс RateLimiter.
 */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number };
}

class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    }
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    bucket.count += 1;
    return { allowed: bucket.count <= limit, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
}

const g = globalThis as unknown as { __cfRateLimiter?: RateLimiter };
export const rateLimiter: RateLimiter = g.__cfRateLimiter ?? (g.__cfRateLimiter = new MemoryRateLimiter());

export const RATE_LIMITS = {
  login: { limit: 50, windowMs: 15 * 60_000 },
  /** Попытки входа в одну учётную запись с любых адресов (защита от перебора с ротацией IP) */
  loginAccount: { limit: 10, windowMs: 15 * 60_000 },
  passwordResetAccount: { limit: 5, windowMs: 60 * 60_000 },
  register: { limit: 10, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  critical: { limit: 60, windowMs: 60_000 },
  upload: { limit: 60, windowMs: 60_000 },
  chat: { limit: 60, windowMs: 60_000 },
  /** Превью маршрута в мастере груза (внешний провайдер маршрутов, бесплатный тариф ограничен) */
  routePreview: { limit: 20, windowMs: 60_000 },
} as const;

export function enforceRateLimit(bucket: keyof typeof RATE_LIMITS, key: string) {
  if (process.env.DISABLE_RATE_LIMIT === "1") return;
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const res = rateLimiter.hit(`${bucket}:${key}`, limit, windowMs);
  if (!res.allowed) {
    const minutes = Math.ceil(res.retryAfterMs / 60_000);
    throw new AppError("RATE_LIMITED", `Слишком много попыток. Повторите через ${minutes} мин.`);
  }
}
