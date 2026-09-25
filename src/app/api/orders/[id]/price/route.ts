import { route } from "@/lib/api/handler";
import { requestPriceChange } from "@/server/services/order.service";

/** Изменение согласованной цены. После подписания — только через администратора. */
export const POST = route<{ id: string }>({}, async ({ actor, params }) => requestPriceChange(actor, params.id));
