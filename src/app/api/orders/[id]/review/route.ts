import { parseJson, route } from "@/lib/api/handler";
import { reviewSchema } from "@/lib/validation/order";
import { createReview } from "@/server/services/review.service";

export const POST = route<{ id: string }>({ status: 201, idempotency: "review.create" }, async ({ req, actor, params }) =>
  createReview(actor, params.id, await parseJson(req, reviewSchema)),
);
