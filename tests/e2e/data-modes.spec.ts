import { expect, test, type Browser } from "@playwright/test";

/**
 * Режимы данных: вход в демо- и реальную базу с одними учётными данными, индикатор режима в шапке,
 * изоляция данных и переключение режима с новой серверной сессией.
 */

const PASSWORD = "Demo1234!";
const EMAIL = "shipper@cargoflow.demo";

async function loginIn(browser: Browser, mode: "demo" | "real") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByTestId(`data-mode-${mode}`).click();
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { context, page };
}

async function ordersTotal(page: import("@playwright/test").Page) {
  const res = await page.request.get("/api/orders?pageSize=1");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { data: { total: number } }).data.total;
}

test("демо и реальная база: одни учётные данные, разные данные, индикатор режима", async ({ browser }) => {
  const demo = await loginIn(browser, "demo");
  await expect(demo.page.getByTestId("data-mode-badge")).toHaveAttribute("data-mode", "demo");
  const demoTotal = await ordersTotal(demo.page);

  const real = await loginIn(browser, "real");
  await expect(real.page.getByTestId("data-mode-badge")).toHaveAttribute("data-mode", "real");
  const realTotal = await ordersTotal(real.page);

  // Демо-база заполнена генератором; реальная содержит только сценарии
  expect(demoTotal).toBeGreaterThan(realTotal);
  expect(demoTotal).toBeGreaterThanOrEqual(30);

  // Подмена режима в запросе не меняет базу: режим берётся только из серверной сессии
  const tampered = await real.page.request.get("/api/orders?pageSize=1&dataMode=demo", { headers: { "x-data-mode": "demo" } });
  expect(((await tampered.json()) as { data: { total: number } }).data.total).toBe(realTotal);

  // Переключение из шапки: новая сессия, полная перезагрузка, данные демо-базы
  await real.page.getByTestId("data-mode-badge").click();
  await real.page
    .getByRole("dialog")
    .getByRole("button", { name: /Перейти/ })
    .click();
  await expect(real.page.getByTestId("data-mode-badge")).toHaveAttribute("data-mode", "demo");
  expect(await ordersTotal(real.page)).toBe(demoTotal);

  await demo.context.close();
  await real.context.close();
});
