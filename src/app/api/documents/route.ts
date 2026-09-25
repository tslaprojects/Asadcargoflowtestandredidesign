import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { listMyDocuments } from "@/server/services/document.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  type: z
    .enum([
      "CONTRACT",
      "APPLICATION",
      "CMR",
      "INVOICE",
      "PACKING_LIST",
      "VEHICLE_DOCUMENT",
      "DRIVER_DOCUMENT",
      "CARGO_PHOTO",
      "SEAL_PHOTO",
      "PROOF_OF_DELIVERY",
      "OTHER",
    ])
    .optional(),
});

export const GET = route({}, async ({ req, actor }) => listMyDocuments(actor, parseQuery(req, q)));
