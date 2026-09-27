import { parseJson, parseQuery, route } from "@/lib/api/handler";
import { fuelListQuerySchema, fuelPurchaseSchema } from "@/lib/validation/fuel";
import { listFuelTransactions, recordFromOwner } from "@/server/services/fuel-transaction.service";

export const GET = route({}, async ({ req, actor }) => listFuelTransactions(actor, parseQuery(req, fuelListQuerySchema)));

/** Демо-симулятор АЗС (только для демо-карт; реальные операции приходят от процессинга). */
export const POST = route({ status: 201, idempotency: "fuel.tx.simulate", rateLimit: "critical" }, async ({ req, actor }) =>
  recordFromOwner(actor, await parseJson(req, fuelPurchaseSchema)),
);
