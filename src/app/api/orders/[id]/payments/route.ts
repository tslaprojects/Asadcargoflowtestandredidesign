import { parseJson, route } from "@/lib/api/handler";
import { paymentCreateSchema } from "@/lib/validation/order";
import { createPayment, listPayments } from "@/server/services/payment.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => listPayments(actor, params.id));

export const POST = route<{ id: string }>({ status: 201, idempotency: "payment.create" }, async ({ req, actor, params }) =>
  createPayment(actor, params.id, await parseJson(req, paymentCreateSchema)),
);
