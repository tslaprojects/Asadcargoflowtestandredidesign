import "server-only";
import type { NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Actor, RequestMeta } from "@/lib/auth/actor";
import { enforceRateLimit, type RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getCurrentActor, getRequestMeta } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors, isAppError, type FieldErrors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toPlain } from "@/lib/serialize";
import { fail, ok } from "./response";

type Params = Record<string, string>;

type HandlerCtx<P extends Params, A extends boolean> = {
  req: NextRequest;
  params: P;
  actor: A extends true ? Actor : Actor | null;
  meta: RequestMeta;
};

type Options<A extends boolean> = {
  /** Требуется авторизация (по умолчанию true). */
  auth?: A;
  rateLimit?: keyof typeof RATE_LIMITS;
  /** Включает защиту от повторов по заголовку Idempotency-Key. Значение — scope операции. */
  idempotency?: string;
  /** HTTP статус успешного ответа. */
  status?: number;
};

export function zodToFields(e: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

function checkOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // не-браузерный клиент; cookie SameSite=Lax не отправляется в кросс-сайтовых POST
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  const allowed = new Set([host, process.env.APP_URL ? new URL(process.env.APP_URL).host : null].filter(Boolean));
  if (!originHost || !allowed.has(originHost)) {
    throw new AppError("FORBIDDEN", "Запрос отклонён: недопустимый источник (CSRF).");
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Идентификаторы в пути (`[id]`) — UUID. Некорректный идентификатор = объект не найден (404), а не ошибка сервера. */
function assertIdParams(params: Params) {
  for (const [key, value] of Object.entries(params)) {
    if ((key === "id" || key.endsWith("Id")) && !UUID_RE.test(value)) throw errors.notFound();
  }
}

function mapUnknownError(e: unknown): AppError | null {
  if (e instanceof ZodError) return errors.validation(undefined, zodToFields(e));
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return new AppError("CONFLICT", "Такая запись уже существует или действие уже выполнено.");
    if (e.code === "P2025") return errors.notFound();
    if (e.code === "P2003") return new AppError("CONFLICT", "Операция нарушает связи между данными.");
    // Некорректные данные в условии запроса (например, не-UUID)
    if (e.code === "P2023" || e.code === "P2007") return errors.validation("Некорректные параметры запроса.");
  }
  if (e instanceof Prisma.PrismaClientValidationError) return errors.validation("Некорректные параметры запроса.");
  // PostgreSQL: invalid_text_representation (22P02) — например, не-UUID в raw SQL
  if (e instanceof Error && /invalid input syntax for type|22P02/.test(e.message))
    return errors.validation("Некорректные параметры запроса.");
  if (e instanceof SyntaxError) return errors.validation("Некорректный формат запроса (ожидается JSON).");
  return null;
}

/** Ключ зарезервирован, операция ещё выполняется. */
const IDEMPOTENCY_IN_PROGRESS = 102;
/** Резерв старше этого срока считается брошенным (процесс упал посреди операции). */
const IDEMPOTENCY_STALE_MS = 5 * 60_000;

/**
 * Атомарный резерв ключа идемпотентности до выполнения операции.
 * Возвращает сохранённый ответ (повтор), бросает DUPLICATE_ACTION, если такой же запрос ещё выполняется,
 * или null — ключ зарезервирован за текущим запросом.
 */
async function reserveIdempotencyKey(userId: string, scope: string, key: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.idempotencyKey.create({
        data: { userId, scope, key, responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: {} },
      });
      return null;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    const existing = await prisma.idempotencyKey.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
    if (!existing) continue;
    if (existing.responseStatus !== IDEMPOTENCY_IN_PROGRESS) {
      return Response.json(existing.responseBody, { status: existing.responseStatus, headers: { "Idempotent-Replay": "true" } });
    }
    if (Date.now() - existing.createdAt.getTime() < IDEMPOTENCY_STALE_MS) {
      throw new AppError("DUPLICATE_ACTION", "Этот запрос уже выполняется. Дождитесь результата.");
    }
    await prisma.idempotencyKey.deleteMany({ where: { id: existing.id, responseStatus: IDEMPOTENCY_IN_PROGRESS } });
  }
  throw new AppError("DUPLICATE_ACTION", "Этот запрос уже выполняется. Дождитесь результата.");
}

export function route<P extends Params = Params, A extends boolean = true>(
  options: Options<A>,
  fn: (ctx: HandlerCtx<P, A>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const started = Date.now();
    let actor: Actor | null = null;
    let idemKey: string | null = null;
    let idemScope = "";
    let reserved = false;
    try {
      checkOrigin(req);
      const meta = await getRequestMeta();
      actor = await getCurrentActor();
      if (options.auth !== false && !actor) throw errors.unauthorized();
      if (options.rateLimit) enforceRateLimit(options.rateLimit, actor?.userId ?? meta.ip ?? "anon");

      idemKey = options.idempotency && actor ? req.headers.get("idempotency-key") : null;
      if (idemKey && actor) {
        if (idemKey.length > 200) throw errors.validation("Слишком длинный Idempotency-Key.");
        // Ключ привязан к операции и ресурсу (путь запроса): тот же ключ на другой заказ не вернёт чужой ответ
        idemScope = `${options.idempotency}:${req.nextUrl.pathname}`;
        const replay = await reserveIdempotencyKey(actor.userId, idemScope, idemKey);
        if (replay) return replay;
        reserved = true;
      }

      const params = ((await context?.params) ?? {}) as P;
      assertIdParams(params);
      const result = await fn({ req, params, actor: actor as HandlerCtx<P, A>["actor"], meta });
      if (result instanceof Response) return result;

      const status = options.status ?? 200;
      const body = { success: true as const, data: toPlain(result) };
      if (reserved && idemKey && actor) {
        await prisma.idempotencyKey
          .update({
            where: { userId_scope_key: { userId: actor.userId, scope: idemScope, key: idemKey } },
            data: { responseStatus: status, responseBody: body as unknown as Prisma.InputJsonValue },
          })
          .catch((err) => logger.error("idempotency.save_failed", { path: req.nextUrl.pathname, error: err }));
      }
      return ok(body.data, status);
    } catch (e) {
      // Операция не выполнена — освобождаем ключ, чтобы клиент мог повторить её с тем же ключом
      if (reserved && idemKey && actor) {
        await prisma.idempotencyKey
          .deleteMany({ where: { userId: actor.userId, scope: idemScope, key: idemKey, responseStatus: IDEMPOTENCY_IN_PROGRESS } })
          .catch(() => {});
      }
      const appErr = isAppError(e) ? e : mapUnknownError(e);
      if (appErr) {
        if (appErr.status >= 500) logger.error("api.error", { path: req.nextUrl.pathname, code: appErr.code });
        else if (appErr.code === "UNAUTHORIZED" || appErr.code === "FORBIDDEN")
          logger.warn("api.denied", { path: req.nextUrl.pathname, method: req.method, userId: actor?.userId, code: appErr.code });
        return fail(appErr.code, appErr.message, appErr.status, appErr.fields);
      }
      logger.error("api.unexpected", {
        path: req.nextUrl.pathname,
        method: req.method,
        userId: actor?.userId,
        error: e,
        ms: Date.now() - started,
      });
      return fail("INTERNAL_ERROR", "Внутренняя ошибка сервера. Попробуйте ещё раз.", 500);
    }
  };
}

/** Разбор и валидация JSON тела запроса. */
export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw errors.validation("Некорректный формат запроса (ожидается JSON).");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw errors.validation(undefined, zodToFields(parsed.error));
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string | string[]> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    const prev = obj[k];
    obj[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw errors.validation(undefined, zodToFields(parsed.error));
  return parsed.data;
}

/**
 * Проверка размера multipart-запроса до его разбора: иначе тело целиком читается в память
 * и только потом отклоняется. Запас 1 МБ — на служебные поля формы.
 */
export async function readUploadForm(req: NextRequest): Promise<FormData> {
  const { maxUploadBytes } = await import("@/lib/storage/file-validation");
  const limit = maxUploadBytes() + 1024 * 1024;
  const length = Number(req.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length)) throw errors.validation("Не указан размер загружаемого файла (Content-Length).");
  if (length > limit) {
    throw new AppError(
      "DOCUMENT_NOT_ALLOWED",
      `Файл слишком большой. Максимальный размер — ${Math.round(maxUploadBytes() / 1024 / 1024)} МБ.`,
      {
        status: 413,
      },
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) throw errors.validation("Ожидается multipart/form-data.");
  return form;
}
