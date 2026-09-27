import { parseJson, route } from "@/lib/api/handler";
import { telemetryReadingSchema } from "@/lib/validation/fuel";
import { addManualReading } from "@/server/services/telemetry.service";

/** Ручной ввод показания владельцем (источник MANUAL). */
export const POST = route<{ id: string }>({ status: 201 }, async ({ req, actor, params }) =>
  addManualReading(actor, params.id, await parseJson(req, telemetryReadingSchema)),
);
