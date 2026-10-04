import { z } from "zod";
import { parseJson, route } from "@/lib/api/handler";
import { previewRoute } from "@/server/geo/preview";

const coord = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();

const previewSchema = z.object({
  stops: z
    .array(
      z.object({
        country: z.string().trim().length(2),
        city: z.string().trim().min(1).max(120),
        street: z.string().trim().max(200).nullable().optional(),
        building: z.string().trim().max(40).nullable().optional(),
        latitude: coord(-90, 90),
        longitude: coord(-180, 180),
      }),
    )
    .min(2)
    .max(10),
});

/** Километраж и время в пути по точкам из мастера груза (до сохранения). */
export const POST = route({ rateLimit: "routePreview" }, async ({ req, actor }) =>
  previewRoute(actor, (await parseJson(req, previewSchema)).stops),
);
