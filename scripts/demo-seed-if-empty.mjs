// Демо-данные для стенда: запускается при старте контейнера.
// Seed очищает базу, поэтому он выполняется ТОЛЬКО если DEMO_SEED=1 и в базе ещё нет ни одного пользователя.
import { execSync } from "node:child_process";
import pg from "pg";

if (process.env.DEMO_SEED !== "1") process.exit(0);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM "User"');
await client.end();

if (rows[0].n > 0) {
  console.log(`[demo-seed] В базе уже есть пользователи (${rows[0].n}) — seed пропущен, данные не тронуты.`);
  process.exit(0);
}
console.log("[demo-seed] База пустая — загружаю демо-данные...");
execSync("npm run db:seed", { stdio: "inherit" });
