import { route } from "@/lib/api/handler";
import { getOrderDetail } from "@/server/services/order.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getOrderDetail(actor, params.id));
