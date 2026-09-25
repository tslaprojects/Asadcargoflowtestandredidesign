#!/usr/bin/env node
/**
 * Локальный запуск CargoFlow «в одну команду» — без Docker и без ручной установки PostgreSQL.
 *
 *   npm run setup   — .env, база данных, миграции, демо-данные
 *   npm run local   — запуск базы + приложения на http://localhost:3000
 *
 * Если в .env указан доступный PostgreSQL (например, из docker compose), используется он.
 * Иначе поднимается встроенный PostgreSQL 16 (npm-пакет embedded-postgres) в папке .local/pgdata.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");
const DATA_DIR = path.join(ROOT, ".local", "pgdata");
const EMBEDDED_PORT = 54329;
const EMBEDDED_URL = (db) => `postgresql://postgres:postgres@localhost:${EMBEDDED_PORT}/${db}?schema=public`;
const isWin = process.platform === "win32";

const log = (m) => console.log(`\x1b[36m[cargoflow]\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m[cargoflow] ${m}\x1b[0m`);
  process.exit(1);
};

// ───────── .env ─────────

function readEnv() {
  const env = {};
  if (!existsSync(ENV_FILE)) return env;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function setEnvValue(key, value) {
  let text = readFileSync(ENV_FILE, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${value}"`;
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_FILE, text);
}

function ensureEnvFile() {
  if (!existsSync(ENV_FILE)) {
    copyFileSync(path.join(ROOT, ".env.example"), ENV_FILE);
    setEnvValue("APP_SECRET", randomBytes(32).toString("hex"));
    log("Создан файл .env (со случайным APP_SECRET)");
  }
}

// ───────── PostgreSQL ─────────

async function canConnect(url) {
  if (!url) return false;
  const client = new pg.Client({ connectionString: url.replace(/\?schema=\w+/, ""), connectionTimeoutMillis: 2500 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureDatabases(adminUrl, names) {
  const client = new pg.Client({ connectionString: adminUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres") });
  await client.connect();
  for (const name of names) {
    const r = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (r.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
      log(`Создана база данных ${name}`);
    }
  }
  await client.end();
}

let embedded = null;

async function startEmbedded() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch {
    fail("Пакет embedded-postgres не установлен. Выполните: npm install");
  }
  const fresh = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  embedded = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: EMBEDDED_PORT,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error(String(e)),
  });
  if (fresh) {
    log("Первый запуск: инициализация встроенного PostgreSQL 16 (один раз, ~10 сек)...");
    await embedded.initialise();
  }
  await embedded.start();
  log(`PostgreSQL запущен на порту ${EMBEDDED_PORT} (данные: .local/pgdata)`);
}

async function stopEmbedded() {
  if (embedded) {
    await embedded.stop().catch(() => {});
    embedded = null;
  }
}

/** Выбирает базу: внешний PostgreSQL из .env, если доступен, иначе встроенный. */
async function ensureDatabase() {
  ensureEnvFile();
  const env = readEnv();
  if (env.LOCAL_EMBEDDED_DB !== "1" && (await canConnect(env.DATABASE_URL))) {
    log("Используется PostgreSQL из .env");
    await ensureDatabases(env.DATABASE_URL, [dbName(env.DATABASE_URL), dbName(env.TEST_DATABASE_URL ?? "")].filter(Boolean));
    return readEnv();
  }
  await startEmbedded();
  setEnvValue("LOCAL_EMBEDDED_DB", "1");
  setEnvValue("DATABASE_URL", EMBEDDED_URL("cargoflow"));
  setEnvValue("TEST_DATABASE_URL", EMBEDDED_URL("cargoflow_test"));
  await ensureDatabases(EMBEDDED_URL("postgres"), ["cargoflow", "cargoflow_test"]);
  return readEnv();
}

function dbName(url) {
  return url.match(/\/([^/?]+)(\?|$)/)?.[1];
}

// ───────── Команды ─────────

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`Команда завершилась с ошибкой: ${cmd} ${args.join(" ")}`);
}

async function setup() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 9)) fail(`Нужен Node.js 20.9+ (сейчас ${process.versions.node})`);
  const env = await ensureDatabase();
  try {
    log("Генерация Prisma Client...");
    run("npx", ["prisma", "generate"], env);
    log("Применение миграций...");
    run("npx", ["prisma", "migrate", "deploy"], env);
    log("Загрузка демо-данных...");
    run("npx", ["tsx", "--conditions=react-server", "prisma/seed.ts"], env);
  } finally {
    await stopEmbedded();
  }
  log("Готово! Запустите приложение: npm run local");
}

async function dev(mode) {
  const env = await ensureDatabase();
  const args = mode === "start" ? ["next", "start", "-p", "3000"] : ["next", "dev", "-p", "3000"];
  log(`Запуск приложения: http://localhost:3000  (остановка — Ctrl+C)`);
  log("Демо-вход: shipper@cargoflow.demo / Demo1234! (кнопки ролей — на странице входа)");
  const child = spawn("npx", args, { cwd: ROOT, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
  const shutdown = async () => {
    child.kill("SIGINT");
    await stopEmbedded();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", async (code) => {
    await stopEmbedded();
    process.exit(code ?? 0);
  });
}

const cmd = process.argv[2];
try {
  if (cmd === "setup") await setup();
  else if (cmd === "dev" || cmd === "start") await dev(cmd);
  else if (cmd === "db") {
    await ensureDatabase();
    log("База работает. Ctrl+C — остановить.");
    process.on("SIGINT", async () => {
      await stopEmbedded();
      process.exit(0);
    });
    setInterval(() => {}, 1 << 30);
  } else fail("Использование: node scripts/local.mjs setup|dev|start|db");
} catch (e) {
  await stopEmbedded();
  fail(e instanceof Error ? e.message : String(e));
}
