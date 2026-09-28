import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: полный сценарий сделки через браузер.
 * Сервер — production-сборка (`npm run build`) на порту 3100, БД — TEST_DATABASE_URL (пересоздаётся seed-ом).
 * Если браузеры Playwright не установлены, укажите PLAYWRIGHT_CHROMIUM_PATH (путь к Chromium).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/api/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
          APP_URL: baseURL,
          STORAGE_DRIVER: "local",
          STORAGE_LOCAL_DIR: "./storage-e2e",
          EMAIL_DRIVER: "none",
          // Плановую задачу в E2E запускают тесты явно
          JOB_SECURE_DEAL_INTERVAL_MIN: "0",
        },
      },
});
