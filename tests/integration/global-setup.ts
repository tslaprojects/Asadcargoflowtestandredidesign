import { execSync } from "node:child_process";
import "dotenv/config";

/** Применяет миграции к тестовой БД (TEST_DATABASE_URL) — реальная схема и демо-схема — перед интеграционными тестами. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL — tests truncate the database");
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
  delete env.DEMO_DATABASE_URL; // демо-схема тестовой базы — cargoflow_demo рядом с ней
  execSync("npx tsx scripts/db-modes.ts migrate", { stdio: "inherit", env });
}
