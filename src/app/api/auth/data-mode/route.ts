import { parseJson, route } from "@/lib/api/handler";
import { dataModeSwitchSchema } from "@/lib/validation/auth";
import { switchDataMode } from "@/server/services/auth.service";

/**
 * Переключение режима данных после входа: сервер проверяет режим, создаёт новую сессию (новый токен)
 * и отзывает прежнюю. Клиент после ответа полностью перезагружает приложение — данные режимов не смешиваются.
 */
export const POST = route({ rateLimit: "critical" }, async ({ req, actor, meta }) =>
  switchDataMode(actor, (await parseJson(req, dataModeSwitchSchema)).dataMode, meta),
);
