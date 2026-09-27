import type { NextRequest } from "next/server";
import { parseJson, route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { fuelTopUpSchema } from "@/lib/validation/fuel";
import { getAccounts, topUpAccount } from "@/server/services/fuel-card.service";

export const GET = route({}, async ({ actor }) => getAccounts(actor));

function key(req: NextRequest) {
  const k = req.headers.get("idempotency-key");
  if (!k) throw errors.validation("Требуется заголовок Idempotency-Key.");
  return k;
}

/** Фиксация пополнения топливного счёта у провайдера. Idempotency-Key обязателен. */
export const POST = route({ status: 201, idempotency: "fuel.topup", rateLimit: "critical" }, async ({ req, actor }) =>
  topUpAccount(actor, await parseJson(req, fuelTopUpSchema), key(req)),
);
