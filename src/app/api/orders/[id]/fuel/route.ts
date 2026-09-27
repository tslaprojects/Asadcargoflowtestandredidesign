import { route } from "@/lib/api/handler";
import { tripFuelReport } from "@/server/services/fuel-report.service";

/** Отчёт по топливу за рейс (перевозчик, администратор). */
export const GET = route<{ id: string }>({}, async ({ actor, params }) => tripFuelReport(actor, params.id));
