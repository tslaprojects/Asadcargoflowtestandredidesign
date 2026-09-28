import { execSync } from "node:child_process";
import "dotenv/config";

/** Подготовка БД для E2E: миграции + демо-данные (seed) в TEST_DATABASE_URL. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (process.env.E2E_BASE_URL) return; // внешний сервер — БД готовит оператор
  // Тестовая база (TEST_DATABASE_URL) заведомо одноразовая — seed разрешено запускать поверх тестовых данных
  const env = { ...process.env, DATABASE_URL: url, STORAGE_LOCAL_DIR: "./storage-e2e", SEED_FORCE: "1" };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { stdio: "ignore", env });
}
