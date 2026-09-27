import { parseJson, route } from "@/lib/api/handler";
import { fuelCardCreateSchema } from "@/lib/validation/fuel";
import { issueFuelCard, listFuelCards } from "@/server/services/fuel-card.service";

export const GET = route({}, async ({ actor }) => listFuelCards(actor));

export const POST = route({ status: 201, idempotency: "fuel.card.issue" }, async ({ req, actor }) =>
  issueFuelCard(actor, await parseJson(req, fuelCardCreateSchema)),
);
