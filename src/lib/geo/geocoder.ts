/**
 * Геокодирование. В MVP — локальный справочник основных городов коридора
 * Китай — Центральная Азия — Россия. Архитектурно заменяется на внешний сервис
 * (Nominatim, 2GIS, Яндекс и т.п.) через интерфейс Geocoder.
 */
export type GeoPoint = { latitude: number; longitude: number };

export interface Geocoder {
  geocodeCity(country: string, city: string): Promise<GeoPoint | null>;
}

type CityEntry = { country: string; names: string[]; lat: number; lng: number };

const CITIES: CityEntry[] = [
  { country: "CN", names: ["урумчи", "urumqi", "ürümqi"], lat: 43.8256, lng: 87.6168 },
  { country: "CN", names: ["хоргос", "khorgos", "horgos", "хоргос (кнр)"], lat: 44.2131, lng: 80.4127 },
  { country: "CN", names: ["шанхай", "shanghai"], lat: 31.2304, lng: 121.4737 },
  { country: "CN", names: ["пекин", "beijing"], lat: 39.9042, lng: 116.4074 },
  { country: "CN", names: ["гуанчжоу", "guangzhou"], lat: 23.1291, lng: 113.2644 },
  { country: "CN", names: ["иу", "yiwu"], lat: 29.3069, lng: 120.0751 },
  { country: "CN", names: ["шэньчжэнь", "shenzhen"], lat: 22.5431, lng: 114.0579 },
  { country: "CN", names: ["сиань", "xian", "xi'an"], lat: 34.3416, lng: 108.9398 },
  { country: "CN", names: ["чэнду", "chengdu"], lat: 30.5728, lng: 104.0668 },
  { country: "KZ", names: ["алматы", "almaty", "алма-ата"], lat: 43.2389, lng: 76.8897 },
  { country: "KZ", names: ["астана", "astana", "нур-султан"], lat: 51.1694, lng: 71.4491 },
  { country: "KZ", names: ["хоргос", "khorgos", "нуркент"], lat: 44.2167, lng: 80.3833 },
  { country: "KZ", names: ["шымкент", "shymkent"], lat: 42.3417, lng: 69.5901 },
  { country: "KZ", names: ["караганда", "karaganda"], lat: 49.8047, lng: 73.1094 },
  { country: "KZ", names: ["актобе", "aktobe"], lat: 50.2839, lng: 57.167 },
  { country: "KZ", names: ["костанай", "kostanay"], lat: 53.2198, lng: 63.6354 },
  { country: "KZ", names: ["петропавловск", "petropavl"], lat: 54.8753, lng: 69.162 },
  { country: "KZ", names: ["уральск", "oral", "uralsk"], lat: 51.2333, lng: 51.3667 },
  { country: "KZ", names: ["достык", "dostyk"], lat: 45.2556, lng: 82.4833 },
  { country: "RU", names: ["москва", "moscow"], lat: 55.7558, lng: 37.6173 },
  { country: "RU", names: ["санкт-петербург", "saint petersburg", "спб"], lat: 59.9311, lng: 30.3609 },
  { country: "RU", names: ["екатеринбург", "yekaterinburg"], lat: 56.8389, lng: 60.6057 },
  { country: "RU", names: ["новосибирск", "novosibirsk"], lat: 55.0084, lng: 82.9357 },
  { country: "RU", names: ["казань", "kazan"], lat: 55.7963, lng: 49.1088 },
  { country: "RU", names: ["самара", "samara"], lat: 53.1959, lng: 50.1002 },
  { country: "RU", names: ["оренбург", "orenburg"], lat: 51.7682, lng: 55.097 },
  { country: "RU", names: ["челябинск", "chelyabinsk"], lat: 55.1644, lng: 61.4368 },
  { country: "RU", names: ["омск", "omsk"], lat: 54.9885, lng: 73.3242 },
  { country: "RU", names: ["троицк", "troitsk"], lat: 54.0979, lng: 61.5773 },
  { country: "UZ", names: ["ташкент", "tashkent"], lat: 41.2995, lng: 69.2401 },
  { country: "KG", names: ["бишкек", "bishkek"], lat: 42.8746, lng: 74.5698 },
  { country: "BY", names: ["минск", "minsk"], lat: 53.9006, lng: 27.559 },
];

export const localGeocoder: Geocoder = {
  async geocodeCity(country, city) {
    const needle = city.trim().toLowerCase();
    const hit = CITIES.find((c) => c.country === country.toUpperCase() && c.names.includes(needle));
    return hit ? { latitude: hit.lat, longitude: hit.lng } : null;
  },
};

export function knownCities(country: string): string[] {
  return CITIES.filter((c) => c.country === country.toUpperCase()).map((c) => capitalize(c.names[0]));
}

function capitalize(s: string) {
  return s
    .split(/([\s-])/)
    .map((p) => (p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");
}

export const geocoder: Geocoder = localGeocoder;
