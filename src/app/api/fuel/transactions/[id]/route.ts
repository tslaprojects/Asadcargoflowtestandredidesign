import { route } from "@/lib/api/handler";
import { getFuelTransaction } from "@/server/services/fuel-transaction.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getFuelTransaction(actor, params.id));
