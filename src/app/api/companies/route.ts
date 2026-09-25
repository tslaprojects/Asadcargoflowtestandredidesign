import { parseJson, route } from "@/lib/api/handler";
import { companyCreateSchema } from "@/lib/validation/auth";
import { createCompanyForActor } from "@/server/services/company.service";

export const POST = route({ status: 201, rateLimit: "critical", idempotency: "company.create" }, async ({ req, actor }) =>
  createCompanyForActor(actor, await parseJson(req, companyCreateSchema)),
);
