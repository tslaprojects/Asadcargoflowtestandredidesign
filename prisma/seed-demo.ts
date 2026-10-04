/**
 * Демо-база: сценарии + генератор (≈100 грузов, 20 машин, 20 водителей, 16 перевозчиков, 40 клиентов).
 *
 *   npm run seed:demo         — загрузить, если демо-данных ещё нет (идемпотентно; так запускается при старте контейнера)
 *   npm run seed:demo:reset   — очистить демо-базу и загрузить заново
 *
 * Защита реальной базы: целевая схема берётся только из конфигурации режима DEMO, должна отличаться
 * от DATABASE_URL и иметь метку `cargoflow:demo` (ставится `scripts/db-modes.ts migrate`). Иначе — остановка.
 * Seed выполняется внутри runWithDataMode("demo"): все сервисы пишут в демо-базу.
 */
import "dotenv/config";
import pg from "pg";
import { runWithDataMode } from "@/lib/db/data-mode";
import { dataModeConfig, SCHEMA_MARKER } from "@/lib/db/data-mode-config";
import { dbFor } from "@/lib/db/prisma";
import { readMarker } from "../scripts/db-modes";
import { generateDemoWorld } from "./demo/generator";
import { seedScenarios } from "./seed";

const SEED_LOCK = 72_700_001;

function abort(message: string): never {
  console.error(`ERROR: Demo seed can only run against DEMO database. ${message}`);
  process.exit(1);
}

async function main() {
  const reset = process.argv.includes("--reset");
  let target;
  try {
    target = dataModeConfig("demo");
  } catch (e) {
    abort(e instanceof Error ? e.message : String(e));
  }
  const marker = await readMarker(target);
  if (marker !== SCHEMA_MARKER.demo) {
    abort(
      `Схема "${target.schema}" имеет метку ${marker ?? "«нет»"}, ожидается ${SCHEMA_MARKER.demo}. Выполните: npx tsx scripts/db-modes.ts migrate`,
    );
  }

  // Один seed одновременно (несколько контейнеров при деплое): advisory-lock на соединении демо-базы
  const lock = new pg.Client({ connectionString: target.connectionString });
  await lock.connect();
  const { rows } = await lock.query("SELECT pg_try_advisory_lock($1) AS ok", [SEED_LOCK]);
  if (!rows[0].ok) {
    console.log("[demo-seed] Демо-данные уже загружает другой процесс — пропускаю.");
    await lock.end();
    return;
  }
  try {
    const demo = dbFor("demo");
    // Документы генератора пишутся последними перед уведомлениями: по ним видно, что прошлый запуск завершился
    const complete =
      (await demo.fuelTransaction.count()) > 0 &&
      (await demo.orderDocument.count({ where: { storageKey: { startsWith: "demo/documents/" } } })) > 0 &&
      (await demo.notification.count({ where: { title: { startsWith: "Доставка завершена" } } })) > 0;
    if (complete && !reset) {
      console.log("[demo-seed] Демо-данные уже загружены — пропускаю (seed:demo:reset — загрузить заново).");
      return;
    }
    const startedAt = Date.now();
    const now = process.env.DEMO_SEED_DATE ? new Date(process.env.DEMO_SEED_DATE) : new Date();
    await runWithDataMode("demo", async () => {
      console.log(`[demo-seed] Загрузка демо-базы (схема ${target.schema})...`);
      await seedScenarios();
      console.log("→ Генератор демо-мира (seed «cargoflow-demo»)");
      const summary = await generateDemoWorld({ seed: process.env.DEMO_SEED_KEY || "cargoflow-demo", now });
      console.table(summary);
    });
    console.log(`[demo-seed] Демо-данные загружены за ${Math.round((Date.now() - startedAt) / 1000)} с.`);
  } finally {
    await lock.end();
    await dbFor("demo").$disconnect();
  }
}

main().catch((e) => {
  console.error("[demo-seed] Не удалось загрузить демо-данные:", e);
  process.exit(1);
});
