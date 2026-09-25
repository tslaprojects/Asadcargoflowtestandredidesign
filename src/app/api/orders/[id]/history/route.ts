import { parseQuery, route } from "@/lib/api/handler";
import { paginationSchema } from "@/lib/validation/common";
import { getOrderAuditTrail } from "@/server/services/order.service";

export const GET = route<{ id: string }>({}, async ({ req, actor, params }) =>
  getOrderAuditTrail(actor, params.id, parseQuery(req, paginationSchema)),
);
