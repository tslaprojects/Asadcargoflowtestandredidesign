import { route } from "@/lib/api/handler";
import { fileResponse } from "@/lib/api/files";
import { deleteLoadDocument, getLoadDocumentFile } from "@/server/services/load.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) => {
  const doc = await getLoadDocumentFile(actor, params.id);
  return fileResponse(doc, req.nextUrl.searchParams.get("inline") === "1");
});

export const DELETE = route<{ id: string }>({}, async ({ actor, params }) => deleteLoadDocument(actor, params.id));
