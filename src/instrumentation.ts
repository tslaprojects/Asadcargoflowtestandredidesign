/**
 * Встроенный планировщик плановых задач (Next.js вызывает register() один раз при старте сервера).
 *
 * Безопасная сделка требует периодической обработки истёкших сроков проверки (автоподтверждение и выплата).
 * Если внешний cron не настроен, сервер сам вызывает POST /api/system/jobs/secure-deal с интервалом
 * JOB_SECURE_DEAL_INTERVAL_MIN (по умолчанию 10 минут в production, 0 — отключено; вне production — выключено,
 * пока интервал не задан явно). Задача идемпотентна: повторный или параллельный запуск на нескольких
 * инстансах не приводит к двойной выплате (блокировки строк и уникальная «одна незавершённая операция на платёж»).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const production = process.env.NODE_ENV === "production";
  const raw = process.env.JOB_SECURE_DEAL_INTERVAL_MIN;
  const minutes = raw === undefined || raw === "" ? (production ? 10 : 0) : Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const { randomBytes } = await import("node:crypto");
  // Endpoint задачи защищён CRON_SECRET; если он не задан, используем случайный ключ только для этого процесса
  process.env.CRON_SECRET ||= randomBytes(32).toString("hex");
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/system/jobs/secure-deal`;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      if (!res.ok) console.error(JSON.stringify({ level: "error", msg: "job.secure-deal.http", status: res.status }));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "job.secure-deal.unreachable", error: String(e) }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), minutes * 60_000);
  timer.unref?.();
}
