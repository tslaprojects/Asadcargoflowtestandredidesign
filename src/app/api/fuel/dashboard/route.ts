import { parseQuery, route } from "@/lib/api/handler";
import { fuelListQuerySchema } from "@/lib/validation/fuel";
import { fuelDashboard } from "@/server/services/fuel-report.service";

export const GET = route({}, async ({ req, actor }) => fuelDashboard(actor, parseQuery(req, fuelListQuerySchema)));
