import { parseJson, route } from "@/lib/api/handler";
import { inviteSchema } from "@/lib/validation/company";
import { inviteMember } from "@/server/services/company.service";

export const POST = route<{ id: string }>({ rateLimit: "critical", status: 201 }, async ({ req, actor, params }) =>
  inviteMember(actor, params.id, await parseJson(req, inviteSchema)),
);
