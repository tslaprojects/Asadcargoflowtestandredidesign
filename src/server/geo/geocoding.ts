import "server-only";
import { prisma } from "@/lib/db/prisma";
import { localGeocoder, normalizeGeocodeQuery, type GeocodeQuery, type GeocodeResult } from "@/lib/geo/geocoder";
import { logger } from "@/lib/logger";
import { geoProviders } from "./providers";

/** Через сколько повторять запрос, который провайдер не нашёл. */
const NEGATIVE_TTL_MS = 30 * 24 * 60 * 60_000;

/**
 * Координаты точки груза. Цепочка: справочник городов → кэш в БД → внешний провайдер (результат пишется в кэш).
 * Если указаны улица/дом — сначала ищется адрес, при неудаче — город.
 * Вызывать вне транзакций: внешний HTTP-запрос не должен держать блокировки.
 */
export async function geocodePoint(q: GeocodeQuery): Promise<GeocodeResult | null> {
  if (q.street?.trim()) {
    const address = await cachedOrRemote(q);
    if (address) return address;
  }
  const city = { country: q.country, city: q.city };
  return (await localGeocoder.geocode(city)) ?? (await cachedOrRemote(city));
}

async function cachedOrRemote(q: GeocodeQuery): Promise<GeocodeResult | null> {
  const country = q.country.trim().toUpperCase();
  const query = normalizeGeocodeQuery(q);
  if (!query) return null;
  const cached = await prisma.geocodeCache.findUnique({ where: { country_query: { country, query } } });
  if (cached) {
    if (cached.latitude != null && cached.longitude != null) {
      return {
        latitude: cached.latitude,
        longitude: cached.longitude,
        accuracy: (cached.accuracy as GeocodeResult["accuracy"]) ?? "city",
        confidence: cached.confidence,
      };
    }
    if (Date.now() - cached.updatedAt.getTime() < NEGATIVE_TTL_MS) return null;
  }
  const remote = geoProviders().geocoder;
  if (!remote) return null;
  const found = await remote.geocode({ ...q, country });
  if (found === "error") return null;
  const data = {
    latitude: found?.latitude ?? null,
    longitude: found?.longitude ?? null,
    accuracy: found?.accuracy ?? null,
    confidence: found?.confidence ?? null,
    provider: remote.name,
  };
  try {
    await prisma.geocodeCache.upsert({ where: { country_query: { country, query } }, create: { country, query, ...data }, update: data });
  } catch (e) {
    // Кэш — оптимизация: гонка двух запросов или сбой записи не должны ломать сохранение груза
    logger.warn("geocode.cache_write_failed", { error: e instanceof Error ? e.message : "unknown" });
  }
  return found;
}
