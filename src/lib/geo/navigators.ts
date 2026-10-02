/**
 * Ссылки «маршрут до точки» для навигаторов водителя: Яндекс, 2ГИС, Google.
 * Есть координаты — передаются они; нет — адрес и город (поиск).
 * Порядок координат различается: Яндекс и Google — lat,lon; 2ГИС — lon,lat.
 *
 * Схемы (сверено с документацией):
 * - Яндекс Навигатор: yandexnavi://build_route_on_map?lat_to=…&lon_to=…  (поиск: yandexnavi://map_search?text=…)
 * - Яндекс Карты: yandexmaps://maps.yandex.ru/?rtext=~lat,lon&rtt=auto; веб: https://yandex.ru/maps/?rtext=~lat,lon&rtt=auto
 * - 2ГИС: dgis://2gis.ru/routeSearch/rsType/car/to/lon,lat; веб: https://2gis.ru/routeSearch/rsType/car/to/lon,lat
 * - Google: https://www.google.com/maps/dir/?api=1&destination=lat,lon&travelmode=driving; iOS-приложение: comgooglemaps://?daddr=…&directionsmode=driving
 */
export type NavigatorApp = "yandex" | "dgis" | "google";
export const NAVIGATOR_APPS: NavigatorApp[] = ["yandex", "dgis", "google"];

export type NavTarget = { lat?: number | null; lng?: number | null; address?: string | null; city?: string | null };

const coord = (v: number) => String(Math.round(v * 1e6) / 1e6);

function hasPoint(t: NavTarget): t is NavTarget & { lat: number; lng: number } {
  return typeof t.lat === "number" && typeof t.lng === "number" && Number.isFinite(t.lat) && Number.isFinite(t.lng);
}

function query(t: NavTarget): string {
  return [t.address, t.city].filter((s) => s && s.trim()).join(", ");
}

/**
 * Ссылки в порядке попытки: приложение(я) → веб. Последняя ссылка всегда https (открывается в браузере,
 * а на телефоне — в приложении, если оно установлено и перехватывает ссылки).
 */
export function navigatorLinks(app: NavigatorApp, t: NavTarget, opts: { ios?: boolean } = {}): string[] {
  const point = hasPoint(t);
  const q = encodeURIComponent(query(t));
  switch (app) {
    case "yandex": {
      if (point) {
        const ll = `${coord(t.lat)},${coord(t.lng)}`;
        return [
          `yandexnavi://build_route_on_map?lat_to=${coord(t.lat)}&lon_to=${coord(t.lng)}`,
          `yandexmaps://maps.yandex.ru/?rtext=~${ll}&rtt=auto`,
          `https://yandex.ru/maps/?rtext=~${ll}&rtt=auto`,
        ];
      }
      return [
        `yandexnavi://map_search?text=${q}`,
        `yandexmaps://maps.yandex.ru/?rtext=~${q}&rtt=auto`,
        `https://yandex.ru/maps/?rtext=~${q}&rtt=auto`,
      ];
    }
    case "dgis": {
      if (point) {
        // 2ГИС: сначала долгота, потом широта
        const lonLat = `${coord(t.lng)},${coord(t.lat)}`;
        return [`dgis://2gis.ru/routeSearch/rsType/car/to/${lonLat}`, `https://2gis.ru/routeSearch/rsType/car/to/${lonLat}`];
      }
      return [`dgis://2gis.ru/search/${q}`, `https://2gis.ru/search/${q}`];
    }
    case "google": {
      const dest = point ? `${coord(t.lat)},${coord(t.lng)}` : q;
      const web = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
      return opts.ios ? [`comgooglemaps://?daddr=${dest}&directionsmode=driving`, web] : [web];
    }
  }
}

/** Веб-ссылка (https) — для сайта водителя. */
export function navigatorWebLink(app: NavigatorApp, t: NavTarget): string {
  const links = navigatorLinks(app, t);
  return links[links.length - 1];
}
