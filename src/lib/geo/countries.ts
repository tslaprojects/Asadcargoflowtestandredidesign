/** Справочник стран (ISO 3166-1 alpha-2). Бизнес-логика не завязана на конкретные страны. */
export type CountryInfo = { code: string; name: string; flag: string; timezone: string };

export const COUNTRIES: CountryInfo[] = [
  { code: "KZ", name: "Казахстан", flag: "🇰🇿", timezone: "Asia/Almaty" },
  { code: "CN", name: "Китай", flag: "🇨🇳", timezone: "Asia/Shanghai" },
  { code: "RU", name: "Россия", flag: "🇷🇺", timezone: "Europe/Moscow" },
  { code: "UZ", name: "Узбекистан", flag: "🇺🇿", timezone: "Asia/Tashkent" },
  { code: "KG", name: "Кыргызстан", flag: "🇰🇬", timezone: "Asia/Bishkek" },
  { code: "TJ", name: "Таджикистан", flag: "🇹🇯", timezone: "Asia/Dushanbe" },
  { code: "TM", name: "Туркменистан", flag: "🇹🇲", timezone: "Asia/Ashgabat" },
  { code: "BY", name: "Беларусь", flag: "🇧🇾", timezone: "Europe/Minsk" },
  { code: "MN", name: "Монголия", flag: "🇲🇳", timezone: "Asia/Ulaanbaatar" },
  { code: "AZ", name: "Азербайджан", flag: "🇦🇿", timezone: "Asia/Baku" },
  { code: "GE", name: "Грузия", flag: "🇬🇪", timezone: "Asia/Tbilisi" },
  { code: "AM", name: "Армения", flag: "🇦🇲", timezone: "Asia/Yerevan" },
  { code: "TR", name: "Турция", flag: "🇹🇷", timezone: "Europe/Istanbul" },
  { code: "IR", name: "Иран", flag: "🇮🇷", timezone: "Asia/Tehran" },
  { code: "AF", name: "Афганистан", flag: "🇦🇫", timezone: "Asia/Kabul" },
  { code: "PL", name: "Польша", flag: "🇵🇱", timezone: "Europe/Warsaw" },
  { code: "DE", name: "Германия", flag: "🇩🇪", timezone: "Europe/Berlin" },
  { code: "LT", name: "Литва", flag: "🇱🇹", timezone: "Europe/Vilnius" },
  { code: "LV", name: "Латвия", flag: "🇱🇻", timezone: "Europe/Riga" },
  { code: "FI", name: "Финляндия", flag: "🇫🇮", timezone: "Europe/Helsinki" },
  { code: "AE", name: "ОАЭ", flag: "🇦🇪", timezone: "Asia/Dubai" },
  { code: "IN", name: "Индия", flag: "🇮🇳", timezone: "Asia/Kolkata" },
  { code: "KR", name: "Южная Корея", flag: "🇰🇷", timezone: "Asia/Seoul" },
  { code: "JP", name: "Япония", flag: "🇯🇵", timezone: "Asia/Tokyo" },
];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryInfo(code: string | null | undefined): CountryInfo | null {
  if (!code) return null;
  return byCode.get(code.toUpperCase()) ?? null;
}

export function countryName(code: string | null | undefined): string {
  return countryInfo(code)?.name ?? code ?? "—";
}

export function countryFlag(code: string | null | undefined): string {
  return countryInfo(code)?.flag ?? "🏳️";
}

export function defaultTimezone(code: string | null | undefined): string {
  return countryInfo(code)?.timezone ?? "UTC";
}

export function isValidCountry(code: string): boolean {
  return byCode.has(code.toUpperCase());
}
