import { route } from "@/lib/api/handler";
import { getSecureDealView, initiateSecureDeal } from "@/server/services/secure-deal.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getSecureDealView(actor, params.id));

/** Заказчик оформляет безопасную сделку. Сумма и валюта берутся из перевозки — тело запроса не используется. */
export const POST = route<{ id: string }>(
  { status: 201, idempotency: "secure-deal.initiate", rateLimit: "critical" },
  async ({ actor, params }) => initiateSecureDeal(actor, params.id),
);
