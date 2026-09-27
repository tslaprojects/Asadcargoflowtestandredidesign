import { expect, test, type Browser } from "@playwright/test";

/**
 * Fleet Fuel Control на демо-данных (seed, DEMO DATA):
 * ABC Logistics, MAN TGX 123ABC, водитель Ivan, карта FC-001, 4 заправки / 850 л, 2 несоответствия.
 * Владелец видит сводку и проверки → открывает расследование; водитель видит только «Оплата разрешена».
 */
const DEMO_PASSWORD = "Demo1234!";

async function login(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { context, page };
}

test.describe.configure({ mode: "serial" });

test("топливо: сводка владельца → проверка → расследование; водитель без баланса", async ({ browser }) => {
  // ── Владелец автопарка ──
  const owner = await login(browser, "fleet@cargoflow.demo");
  await owner.page.goto("/fuel");
  await expect(owner.page.getByText("DEMO DATA").first()).toBeVisible();
  const kpi = owner.page.getByTestId("fuel-kpi");
  await expect(kpi).toContainText("850 л");
  await expect(kpi).toContainText("4");

  await owner.page.goto("/fuel?tab=checks");
  const anomaly = owner.page.getByRole("link", { name: /Место заправки не совпадает с GPS/ });
  await expect(anomaly).toBeVisible();
  await expect(owner.page.getByText(/Уровень топлива не соответствует заправке/).first()).toBeVisible();
  // Никаких обвинений — только нейтральная формулировка.
  await expect(owner.page.locator("body")).not.toContainText(/укра|хищени/i);

  await anomaly.click();
  await expect(owner.page.getByTestId("anomaly-explanation")).toContainText("Требуется проверка");
  await owner.page.getByTestId("open-investigation").click();
  await owner.page.getByRole("dialog").getByRole("textbox").fill("Запросить у водителя чек АЗС");
  await owner.page.getByRole("dialog").getByRole("button", { name: "Открыть расследование" }).click();
  await owner.page.waitForURL(/\/fuel\/investigations\//);
  await expect(owner.page.getByTestId("investigation-comments")).toContainText("Запросить у водителя чек АЗС");
  await owner.context.close();

  // ── Водитель Ivan ──
  const driver = await login(browser, "ivan@cargoflow.demo");
  await driver.page.goto("/driver/fuel");
  await expect(driver.page.getByTestId("driver-card")).toContainText("FC-001");
  await expect(driver.page.getByTestId("payment-status")).toContainText("Оплата разрешена");
  // Баланс компании и суммы водителю не показываются.
  await expect(driver.page.getByTestId("driver-fuel")).not.toContainText(/баланс|KZT|₸/i);

  await driver.page.getByLabel("Литры").fill("100");
  await driver.page.getByTestId("driver-refuel").click();
  await expect(driver.page.locator("[data-sonner-toast]").filter({ hasText: "Заправка зарегистрирована" }).first()).toBeVisible();
  await driver.context.close();
});
