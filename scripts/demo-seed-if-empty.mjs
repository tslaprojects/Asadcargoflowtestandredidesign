// Демо-данные для стенда: запускается при старте контейнера (только при DEMO_SEED=1).
// Seed очищает базу, поэтому он выполняется, только если:
//   - демо-данные ещё не загружены полностью (нет топливного демо — это последний шаг seed), и
//   - в базе нет ни одного «настоящего» пользователя (все email — @cargoflow.demo).
// Так недогруженное демо (seed прервали) восстанавливается при следующем старте, а реальные данные не трогаются никогда.
// Ошибка seed не мешает запуску сервера — она пишется в лог деплоя.
import { execSync } from "node:child_process";
import pg from "pg";

if (process.env.DEMO_SEED !== "1") {
  console.log("[demo-seed] DEMO_SEED не равен 1 — демо-данные не загружаются.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const one = async (sql) => (await client.query(sql)).rows[0].n;
const realUsers = await one(`SELECT COUNT(*)::int AS n FROM "User" WHERE email NOT LIKE '%@cargoflow.demo'`);
const demoComplete = await one(
  `SELECT (EXISTS (SELECT 1 FROM "User" WHERE email = 'fleet@cargoflow.demo')
       AND EXISTS (SELECT 1 FROM "FuelTransaction"))::int AS n`,
);
await client.end();

if (demoComplete) {
  console.log("[demo-seed] Демо-данные уже загружены — seed пропущен, данные не тронуты.");
  process.exit(0);
}
if (realUsers > 0) {
  console.log(`[demo-seed] В базе есть пользователи не из демо (${realUsers}) — seed пропущен, чтобы не стереть данные.`);
  process.exit(0);
}
console.log("[demo-seed] Демо-данных нет или они неполные — загружаю демо-данные...");
try {
  // В базе только демо-пользователи (или никого) и DEMO_SEED=1 явно задан — разрешаем seed в production-режиме.
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, ALLOW_PRODUCTION_SEED: "1" } });
  console.log("[demo-seed] Демо-данные загружены. Пароль демо-аккаунтов: Demo1234!");
} catch {
  console.error("[demo-seed] Не удалось загрузить демо-данные — см. ошибку выше. Сервер запускается без них.");
}
