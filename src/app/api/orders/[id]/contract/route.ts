import { route } from "@/lib/api/handler";
import { getOrderContract } from "@/server/services/contract.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getOrderContract(actor, params.id));
