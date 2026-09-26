import { route } from "@/lib/api/handler";
import { adminRetryTransaction } from "@/server/services/secure-deal.service";

export const POST = route<{ id: string }>({ rateLimit: "critical" }, async ({ actor, params }) => adminRetryTransaction(actor, params.id));
