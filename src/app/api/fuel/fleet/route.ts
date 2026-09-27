import { route } from "@/lib/api/handler";
import { fleetOverview } from "@/server/services/fuel-report.service";

export const GET = route({}, async ({ actor }) => fleetOverview(actor));
