import { parseJson, route } from "@/lib/api/handler";
import { paymentUpdateSchema } from "@/lib/validation/order";
import { updatePayment } from "@/server/services/payment.service";

export const PATCH = route<{ id: string }>({ idempotency: "payment.update" }, async ({ req, actor, params }) =>
  updatePayment(actor, params.id, await parseJson(req, paymentUpdateSchema)),
);
