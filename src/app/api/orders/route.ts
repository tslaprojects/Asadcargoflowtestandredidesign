import { parseQuery, route } from "@/lib/api/handler";
import { orderListQuerySchema } from "@/lib/validation/order";
import { listOrders } from "@/server/services/order.service";

export const GET = route({}, async ({ req, actor }) => listOrders(actor, parseQuery(req, orderListQuerySchema)));
