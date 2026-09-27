// Преобразование лимитов карты ⇄ форма. Чистый модуль — доступен и серверу, и клиенту.

export type LimitsValue = {
  perTransactionLiters: string;
  dailyLiters: string;
  monthlyLiters: string;
  dailyAmount: string;
  monthlyAmount: string;
  allowedFuelTypes: string[];
  allowedStationBrands: string;
  allowedRegions: string;
  allowedFrom: string;
  allowedTo: string;
  driverCanSeeFuelLevel: boolean;
};

export const EMPTY_LIMITS: LimitsValue = {
  perTransactionLiters: "300",
  dailyLiters: "600",
  monthlyLiters: "5000",
  dailyAmount: "",
  monthlyAmount: "",
  allowedFuelTypes: ["DIESEL"],
  allowedStationBrands: "",
  allowedRegions: "",
  allowedFrom: "",
  allowedTo: "",
  driverCanSeeFuelLevel: true,
};

const minuteToTime = (m: number | null) =>
  m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function limitsFromCard(
  l: {
    perTransactionLiters: number | null;
    dailyLiters: number | null;
    monthlyLiters: number | null;
    dailyAmount: number | null;
    monthlyAmount: number | null;
    allowedFuelTypes: string[];
    allowedStationBrands: string[];
    allowedRegions: string[];
    allowedFromMinute: number | null;
    allowedToMinute: number | null;
  },
  driverCanSeeFuelLevel: boolean,
): LimitsValue {
  const s = (v: number | null) => (v == null ? "" : String(v));
  return {
    perTransactionLiters: s(l.perTransactionLiters),
    dailyLiters: s(l.dailyLiters),
    monthlyLiters: s(l.monthlyLiters),
    dailyAmount: s(l.dailyAmount),
    monthlyAmount: s(l.monthlyAmount),
    allowedFuelTypes: l.allowedFuelTypes,
    allowedStationBrands: l.allowedStationBrands.join(", "),
    allowedRegions: l.allowedRegions.join(", "),
    allowedFrom: minuteToTime(l.allowedFromMinute),
    allowedTo: minuteToTime(l.allowedToMinute),
    driverCanSeeFuelLevel,
  };
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function limitsBody(v: LimitsValue) {
  return {
    perTransactionLiters: v.perTransactionLiters || null,
    dailyLiters: v.dailyLiters || null,
    monthlyLiters: v.monthlyLiters || null,
    dailyAmount: v.dailyAmount || null,
    monthlyAmount: v.monthlyAmount || null,
    allowedFuelTypes: v.allowedFuelTypes,
    allowedStationBrands: list(v.allowedStationBrands),
    allowedStationIds: [],
    allowedRegions: list(v.allowedRegions).map((x) => x.toUpperCase()),
    allowedFrom: v.allowedFrom || null,
    allowedTo: v.allowedTo || null,
    driverCanSeeFuelLevel: v.driverCanSeeFuelLevel,
  };
}
