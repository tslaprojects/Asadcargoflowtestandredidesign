/**
 * Минимальный структурированный логгер (JSON в stdout).
 * Никогда не передавайте сюда пароли, токены, содержимое документов.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = /pass(word)?|token|secret|authorization|cookie|hash|signature|api[-_]?key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const min = (process.env.LOG_LEVEL as Level) || "info";
  if (order[level] < (order[min] ?? 20)) return;
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.DEBUG_LOGS) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => write("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => write("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write("error", m, meta),
};
