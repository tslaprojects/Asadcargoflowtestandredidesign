import { parseJson, route } from "@/lib/api/handler";
import { vehicleFuelSettingsSchema } from "@/lib/validation/fuel";
import { updateVehicleFuelSettings } from "@/server/services/fuel-card.service";
import { vehicleFuelReport } from "@/server/services/fuel-report.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => vehicleFuelReport(actor, params.id));

/** Топливные параметры: тип топлива, двигатель, ёмкость бака, норма расхода, устройство телематики. */
export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateVehicleFuelSettings(actor, params.id, await parseJson(req, vehicleFuelSettingsSchema)),
);
