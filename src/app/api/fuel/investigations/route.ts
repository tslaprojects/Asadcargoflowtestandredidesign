import { z } from "zod";
import { parseJson, parseQuery, route } from "@/lib/api/handler";
import { investigationCreateSchema } from "@/lib/validation/fuel";
import { listInvestigations, openInvestigation } from "@/server/services/fuel-investigation.service";

const q = z.object({ status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]).optional() });

export const GET = route({}, async ({ req, actor }) => listInvestigations(actor, parseQuery(req, q)));

export const POST = route({ status: 201, idempotency: "fuel.investigation.open" }, async ({ req, actor }) =>
  openInvestigation(actor, await parseJson(req, investigationCreateSchema)),
);
