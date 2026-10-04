import "server-only";
import { GeoapifyGeocoder, GeoapifyRouting, geoapifyKey } from "@/lib/geo/geoapify";
import type { GeocodeQuery, GeocodeResult } from "@/lib/geo/geocoder";
import type { RoutingProvider } from "@/lib/geo/routing";

/** Внешний геокодер: null — не найдено, "error" — недоступен (не кэшируется). */
export interface RemoteGeocoder {
  readonly name: string;
  geocode(q: GeocodeQuery): Promise<GeocodeResult | null | "error">;
}

type Providers = { routing: RoutingProvider | null; geocoder: RemoteGeocoder | null };

let override: Providers | null = null;

/** Провайдеры по конфигурации: есть GEOAPIFY_API_KEY — Geoapify, нет — только справочник и оценка. */
export function geoProviders(): Providers {
  if (override) return override;
  const key = geoapifyKey();
  return key ? { routing: new GeoapifyRouting(key), geocoder: new GeoapifyGeocoder(key) } : { routing: null, geocoder: null };
}

/** Подмена провайдеров (тесты, скрипты). null — вернуть конфигурацию по умолчанию. */
export function setGeoProviders(p: Providers | null) {
  override = p;
}
