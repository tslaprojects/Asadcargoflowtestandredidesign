"use client";
import type { ApiResponse } from "@/lib/api/response";
import type { FieldErrors } from "@/lib/errors";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public fields?: FieldErrors,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  /** Ключ идемпотентности — один на пользовательское действие (повторы не создают дублей). */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Вызов REST API CargoFlow. Бросает ApiError с понятным сообщением. */
export async function api<T>(url: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Нет связи с сервером. Проверьте подключение к интернету.", 0);
  }
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = null;
  }
  if (!json) throw new ApiError("INTERNAL_ERROR", "Сервер вернул некорректный ответ. Попробуйте ещё раз.", res.status);
  if (!json.success) {
    if (json.error.code === "UNAUTHORIZED" && typeof window !== "undefined" && !url.includes("/api/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError(json.error.code, json.error.message, res.status, json.error.fields);
  }
  return json.data;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
