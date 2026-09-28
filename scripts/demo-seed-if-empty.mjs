// Демо-данные для стенда: запускается при старте контейнера.
// Seed очищает базу, поэтому он выполняется ТОЛЬКО если DEMO_SEED=1 и в базе ещё нет ни одного пользователя.
// Ошибка seed не мешает запуску сервера — она пишется в лог деплоя.
import { execSync } from "node:child_process";
import pg from "pg";

if (process.env.DEMO_SEED !== "1") {
  console.log("[demo-seed] DEMO_SEED не равен 1 — демо-данные не загружаются.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM "User"');
await client.end();

if (rows[0].n > 0) {
  console.log(`[demo-seed] В базе уже есть пользователи (${rows[0].n}) — seed пропущен, данные не тронуты.`);
  process.exit(0);
}
console.log("[demo-seed] База пустая — загружаю демо-данные...");
try {
  // База пустая и DEMO_SEED=1 явно задан — разрешаем seed в production-режиме.
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, ALLOW_PRODUCTION_SEED: "1" } });
  console.log("[demo-seed] Демо-данные загружены. Пароль демо-аккаунтов: Demo1234!");
} catch {
  console.error("[demo-seed] Не удалось загрузить демо-данные — см. ошибку выше. Сервер запускается без них.");
}
