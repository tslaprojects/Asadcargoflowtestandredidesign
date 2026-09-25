import { defaultTimezone } from "@/lib/geo/countries";
import { utcToZonedParts } from "@/lib/tz";

/** Значения формы мастера груза (общий модуль: используется и сервером, и клиентом). */
export type StopForm = {
  type: "PICKUP" | "BORDER" | "DELIVERY" | "TRANSIT";
  country: string;
  city: string;
  street: string;
  building: string;
  fullAddress: string;
  date: string;
  timeFrom: string;
  timeTo: string;
  contactName: string;
  contactPhone: string;
  notes: string;
};

export type WizardValues = {
  stops: StopForm[];
  title: string;
  clientName: string;
  cargoType: string;
  cargoDescription: string;
  weightKg: string;
  volumeM3: string;
  packagesCount: string;
  packageType: string;
  vehicleType: string;
  bodyType: string;
  temperatureFrom: string;
  temperatureTo: string;
  requiresGps: boolean;
  requirements: string;
  priceType: string;
  targetPrice: string;
  currency: string;
  additionalTerms: string;
  notes: string;
  visibility: "MARKETPLACE" | "INVITE_ONLY";
  invitedCarrierIds: string[];
};

export const emptyStop = (type: StopForm["type"], country = "KZ"): StopForm => ({
  type,
  country,
  city: "",
  street: "",
  building: "",
  fullAddress: "",
  date: "",
  timeFrom: "09:00",
  timeTo: "",
  contactName: "",
  contactPhone: "",
  notes: "",
});

export const defaultWizardValues: WizardValues = {
  stops: [emptyStop("PICKUP", "CN"), emptyStop("DELIVERY", "KZ")],
  title: "",
  clientName: "",
  cargoType: "GENERAL",
  cargoDescription: "",
  weightKg: "",
  volumeM3: "",
  packagesCount: "",
  packageType: "",
  vehicleType: "TRACTOR_TRAILER",
  bodyType: "CURTAINSIDER",
  temperatureFrom: "",
  temperatureTo: "",
  requiresGps: false,
  requirements: "",
  priceType: "NEGOTIABLE",
  targetPrice: "",
  currency: "USD",
  additionalTerms: "",
  notes: "",
  visibility: "MARKETPLACE",
  invitedCarrierIds: [],
};

/** Преобразование сохранённого груза в значения формы (для редактирования). */
export function loadToWizardValues(load: {
  stops: {
    type: string;
    country: string;
    city: string;
    street: string | null;
    building: string | null;
    fullAddress: string | null;
    plannedDateFrom: Date | string | null;
    plannedDateTo: Date | string | null;
    timezone: string | null;
    contactName: string | null;
    contactPhone: string | null;
    notes: string | null;
  }[];
  invitations: { carrierCompanyId: string }[];
  [k: string]: unknown;
}): WizardValues {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    stops: load.stops.map((st) => {
      const tz = st.timezone ?? defaultTimezone(st.country);
      const from = st.plannedDateFrom ? utcToZonedParts(st.plannedDateFrom, tz) : null;
      const to = st.plannedDateTo ? utcToZonedParts(st.plannedDateTo, tz) : null;
      return {
        type: st.type as StopForm["type"],
        country: st.country,
        city: st.city,
        street: s(st.street),
        building: s(st.building),
        fullAddress: s(st.fullAddress),
        date: from?.date ?? "",
        timeFrom: from?.time ?? "",
        timeTo: to?.time ?? "",
        contactName: s(st.contactName),
        contactPhone: s(st.contactPhone),
        notes: s(st.notes),
      };
    }),
    title: s(load.title),
    clientName: s(load.clientName),
    cargoType: s(load.cargoType),
    cargoDescription: s(load.cargoDescription),
    weightKg: s(load.weightKg),
    volumeM3: s(load.volumeM3),
    packagesCount: s(load.packagesCount),
    packageType: s(load.packageType),
    vehicleType: s(load.vehicleType),
    bodyType: s(load.bodyType),
    temperatureFrom: s(load.temperatureFrom),
    temperatureTo: s(load.temperatureTo),
    requiresGps: Boolean(load.requiresGps),
    requirements: s(load.requirements),
    priceType: s(load.priceType),
    targetPrice: s(load.targetPrice),
    currency: s(load.currency),
    additionalTerms: s(load.additionalTerms),
    notes: s(load.notes),
    visibility: load.invitations.length ? "INVITE_ONLY" : "MARKETPLACE",
    invitedCarrierIds: load.invitations.map((i) => i.carrierCompanyId),
  };
}
