import { route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { navKindFor } from "@/server/page-context";
import { carrierDashboard, customerDashboard, forwarderDashboard } from "@/server/services/dashboard.service";
import { liveOperations } from "@/server/services/operations.service";

/**
 * Операционная картина активной компании (то же, что экран «Операции»): живые объекты с позицией и маршрутом,
 * индикаторы, поток событий и «требует внимания». Используется нативными приложениями CargoFlow.
 */
export const GET = route({}, async ({ actor }) => {
  const kind = navKindFor(actor);
  if (kind === "none" || kind === "driver" || kind === "admin") throw errors.forbidden("Операции доступны компаниям-участникам перевозок.");
  const [ops, dashboard] = await Promise.all([
    liveOperations(actor),
    kind === "carrier" ? carrierDashboard(actor) : kind === "forwarder" ? forwarderDashboard(actor) : customerDashboard(actor),
  ]);
  return { ...ops, actions: dashboard.actions, kind };
});
