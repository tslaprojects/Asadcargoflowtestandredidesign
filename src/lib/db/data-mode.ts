import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";

/**
 * Режим данных запроса: с какой базой работают бизнес-данные.
 * Identity (пользователь, пароль, сессия) всегда одна — в реальной базе; режим хранится в серверной сессии
 * и никогда не берётся из тела или заголовков запроса (см. docs/DATABASE_MODES.md).
 */
export type DataMode = "real" | "demo";

export const DATA_MODES: readonly DataMode[] = ["real", "demo"] as const;

export function isDataMode(v: unknown): v is DataMode {
  return v === "real" || v === "demo";
}

/** API-маршруты, задачи и скрипты: режим задаётся явно и наследуется всеми await внутри. */
const storage = new AsyncLocalStorage<{ mode: DataMode }>();

/**
 * Серверный рендер (RSC): страница и layout одного запроса делят этот объект (React cache — область запроса).
 * Вне рендера cache не запоминает значение, поэтому здесь всегда null — утечки между запросами нет.
 */
const renderScope = cache((): { mode: DataMode | null } => ({ mode: null }));

export function runWithDataMode<T>(mode: DataMode, fn: () => T): T {
  return storage.run({ mode }, fn);
}

/** Привязывает режим к текущему серверному рендеру (вызывается сессионным слоем до первого бизнес-запроса). */
export function bindRenderDataMode(mode: DataMode) {
  renderScope().mode = mode;
}

/** Режим текущего контекста или null, если запрос не привязан к режиму (вход, регистрация, скрипты). */
export function currentDataMode(): DataMode | null {
  return storage.getStore()?.mode ?? renderScope().mode;
}
