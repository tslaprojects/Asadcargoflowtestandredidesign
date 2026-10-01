/**
 * Удаление демо-данных из РЕАЛЬНОЙ базы (наследие прежнего seed, который грузил демо в основную базу).
 *
 *   npx tsx --conditions=react-server scripts/purge-demo-from-real.ts           — сухой прогон: что будет удалено
 *   npx tsx --conditions=react-server scripts/purge-demo-from-real.ts --apply   — удалить (одна транзакция)
 *
 * Удаляются демо-компании (регистрационный номер `DEMO-…` и только демо-участники `*cargoflow.demo`) со всеми
 * их данными: грузы, ставки, перевозки, договоры, документы (и файлы в хранилище), машины, водители, топливо,
 * платежи, отзывы. У демо-аккаунтов удаляются уведомления и сессии.
 *
 * Остаются учётные записи демо-аккаунтов (email/пароль): вход единый и проверяется по реальной базе.
 * В демо-режиме такой аккаунт занимает место своего персонажа в демо-базе (demo-workspace.service).
 * Журнал аудита не изменяется. Повторный запуск ничего не делает.
 */
import "dotenv/config";
import pg from "pg";
import { dataModeConfig, SCHEMA_MARKER } from "@/lib/db/data-mode-config";
import { storage } from "@/lib/storage/storage";
import { readMarker } from "./db-modes";

const DEMO_EMAIL = `(u.email LIKE '%@cargoflow.demo' OR u.email LIKE '%.cargoflow.demo')`;
const DEMO_COMPANIES = `
  SELECT c.id FROM "Company" c
  WHERE c."registrationNumber" LIKE 'DEMO-%'
    AND NOT EXISTS (SELECT 1 FROM "CompanyMember" m JOIN "User" u ON u.id = m."userId" WHERE m."companyId" = c.id AND NOT ${DEMO_EMAIL})`;
const DEMO_USERS = `SELECT u.id FROM "User" u WHERE ${DEMO_EMAIL}`;

type Fk = { child: string; childCol: string; parent: string; parentCol: string; onDelete: string };

async function foreignKeys(db: pg.Client, schema: string): Promise<Fk[]> {
  const { rows } = await db.query<Fk>(
    `SELECT cc.relname AS child, ca.attname AS "childCol", pc.relname AS parent, pa.attname AS "parentCol", c.confdeltype AS "onDelete"
       FROM pg_constraint c
       JOIN pg_class cc ON cc.oid = c.conrelid
       JOIN pg_class pc ON pc.oid = c.confrelid
       JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND c.connamespace = $1::regnamespace`,
    [schema],
  );
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const target = dataModeConfig("real");
  const marker = await readMarker(target);
  if (marker !== SCHEMA_MARKER.real) {
    throw new Error(
      `Схема "${target.schema}" имеет метку ${marker ?? "«нет»"}, ожидается ${SCHEMA_MARKER.real}. Выполните: npm run db:migrate:all`,
    );
  }

  const db = new pg.Client({ connectionString: target.connectionString });
  await db.connect();
  const deleted = new Map<string, number>();
  const storageKeys: string[] = [];
  try {
    await db.query(`SET search_path TO "${target.schema}"`);
    const fks = await foreignKeys(db, target.schema);
    const keyTables = new Set(
      (
        await db.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'storageKey'`,
          [target.schema],
        )
      ).rows.map((r) => r.table_name),
    );

    // Сначала зависимые строки (кроме SET NULL — их обнулит СУБД), затем сами строки
    async function deleteWhere(table: string, where: string, path: string[]) {
      if (path.length > 12) throw new Error(`Слишком глубокая цепочка связей: ${[...path, table].join(" → ")}`);
      for (const fk of fks) {
        if (fk.parent !== table || fk.onDelete === "n" || fk.child === table || path.includes(fk.child)) continue;
        await deleteWhere(fk.child, `"${fk.childCol}" IN (SELECT "${fk.parentCol}" FROM "${table}" WHERE ${where})`, [...path, table]);
      }
      if (keyTables.has(table)) {
        const { rows } = await db.query<{ storageKey: string }>(`SELECT "storageKey" FROM "${table}" WHERE ${where}`);
        storageKeys.push(...rows.map((r) => r.storageKey));
      }
      const res = await db.query(`DELETE FROM "${table}" WHERE ${where}`);
      if (res.rowCount) deleted.set(table, (deleted.get(table) ?? 0) + res.rowCount);
    }

    await db.query("BEGIN");
    const companies = (await db.query<{ id: string }>(DEMO_COMPANIES)).rows.length;
    if (companies > 0) {
      for (const t of ["Notification", "Session", "IdempotencyKey", "ChatReadState"]) {
        await deleteWhere(t, `"userId" IN (${DEMO_USERS})`, []);
      }
      await deleteWhere("Company", `id IN (${DEMO_COMPANIES})`, []);
    }
    const kept = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "User" u WHERE ${DEMO_EMAIL}`)).rows[0].n;
    await db.query(apply ? "COMMIT" : "ROLLBACK");

    if (companies === 0) {
      console.log("[purge-demo] В реальной базе нет демо-компаний — нечего удалять.");
      return;
    }
    console.log(`[purge-demo] ${apply ? "Удалено" : "Будет удалено (сухой прогон, --apply — выполнить)"}:`);
    console.table(Object.fromEntries([...deleted].sort((a, b) => b[1] - a[1])));
    console.log(`[purge-demo] Учётные записи демо-аккаунтов сохранены: ${kept}. Файлов в хранилище: ${storageKeys.length}.`);
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }

  if (apply && storageKeys.length) {
    const store = storage();
    let failed = 0;
    for (const key of storageKeys) await store.delete(key).catch(() => (failed += 1));
    if (failed) console.warn(`[purge-demo] Не удалось удалить файлов: ${failed} (записи в базе уже удалены).`);
  }
}

main().catch((e) => {
  console.error("[purge-demo] Ошибка, изменения отменены:", e instanceof Error ? e.message : e);
  process.exit(1);
});
