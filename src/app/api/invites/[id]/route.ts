import { route } from "@/lib/api/handler";
import { revokeInvite } from "@/server/services/company.service";

export const DELETE = route<{ id: string }>({}, async ({ actor, params }) => revokeInvite(actor, params.id));
