import { fileResponse } from "@/lib/api/files";
import { route } from "@/lib/api/handler";
import { getInvestigationAttachment } from "@/server/services/fuel-investigation.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) =>
  fileResponse(await getInvestigationAttachment(actor, params.id), req.nextUrl.searchParams.get("inline") === "1"),
);
