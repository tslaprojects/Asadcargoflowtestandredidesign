import { route } from "@/lib/api/handler";
import { adminStats } from "@/server/services/admin.service";

export const GET = route({}, async ({ actor }) => adminStats(actor));
