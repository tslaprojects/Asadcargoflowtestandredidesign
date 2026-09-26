import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Безопасная сделка и следующий рейс на демо-данных (seed):
 * CF-O-000004 — Китай → Алматы, $3 000, доставлено, оплата обеспечена (PAYMENT_RESERVED).
 * Водитель указывает направление → заказчик подтверждает получение → выплата → CLOSED →
 * перевозчик подбирает следующий груз из Алматы.
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

async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("безопасная сделка → выплата → закрытие → следующий рейс", async ({ browser }) => {
  // ── Водитель после доставки сообщает, куда планирует ехать ──
  const driver = await login(browser, "driver@cargoflow.demo");
  await expect(driver.page.getByTestId("driver-next-step")).toBeVisible();
  await driver.page.getByRole("button", { name: "В Астана" }).click();
  await expectToast(driver.page, /Диспетчер получил ваш план\. Подходящих грузов: [1-9]/);
  await expect(driver.page.getByTestId("driver-next-step")).toContainText("Ваш план: Астана");
  await driver.context.close();

  // ── Заказчик: оплата обеспечена, подтверждает получение ──
  const shipper = await login(browser, "shipper@cargoflow.demo");
  await shipper.page.goto("/orders?q=CF-O-000004");
  await shipper.page.getByRole("link", { name: "CF-O-000004" }).first().click();
  await shipper.page.waitForURL(/\/orders\/[0-9a-f-]{36}/);
  const orderUrl = new URL(shipper.page.url());
  const orderId = orderUrl.pathname.split("/").pop()!;
  await expect(shipper.page.getByTestId("summary-secure-deal")).toContainText("Оплата обеспечена");
  await shipper.page.goto(`/orders/${orderId}?tab=finance`);
  const deal = shipper.page.getByTestId("secure-deal");
  await expect(deal).toContainText("Тестовый режим");
  await expect(shipper.page.getByTestId("secure-deal-tiles")).toContainText("2 940");
  await expect(shipper.page.getByTestId("release-conditions")).toContainText("Срок проверки: до");

  await shipper.page.getByTestId("confirm-delivery").click();
  const dialog = shipper.page.getByRole("dialog");
  await expect(dialog).toContainText("выплата перевозчику передаётся платёжному провайдеру");
  await dialog.getByRole("button", { name: "Подтвердить получение груза" }).click();
  await expectToast(shipper.page, "Выплата перевозчику запущена");
  await shipper.page.reload();
  await expect(shipper.page.getByTestId("order-summary")).toContainText("Закрыто");
  await expect(shipper.page.getByTestId("summary-secure-deal")).toContainText("Выплачено перевозчику");
  await expect(shipper.page.getByTestId("payment-history")).toContainText("Выплата в обработке");
  await shipper.context.close();

  // ── Перевозчик: RBAC и подбор следующего груза ──
  const carrier = await login(browser, "carrier@cargoflow.demo");
  const origin = new URL(carrier.page.url()).origin;
  const denied = await carrier.page.request.post(`/api/orders/${orderId}/secure-deal`, { headers: { origin } });
  expect(denied.status()).toBe(403);
  const payments = await carrier.page.request.get(`/api/orders/${orderId}/secure-deal`);
  const paymentId = (await payments.json()).data.payment.id as string;
  const release = await carrier.page.request.post(`/api/admin/payments/${paymentId}/release`, {
    headers: { origin },
    data: { reason: "Попытка выплатить себе" },
  });
  expect(release.status()).toBe(403);

  await carrier.page.goto("/dashboard");
  await expect(carrier.page.getByTestId("next-load-previews")).toContainText("KZ 123 AB");
  await carrier.page.goto("/next-load");
  // План водителя «в Астану» — подходящие грузы уже подобраны
  await expect(carrier.page.getByTestId("nl-plan")).toContainText("Астана");
  await expect(carrier.page.getByTestId("nl-matches")).toContainText("Алматы — Астана");

  // Диспетчер меняет план: пока не определился → грузы рядом с Алматы
  await carrier.page.getByTestId("nl-undecided").click();
  await carrier.page.getByTestId("nl-submit").click();
  await carrier.page.waitForURL(/movement=/);
  await expect(carrier.page.getByTestId("nl-plan")).toContainText("любое направление");
  await expect(carrier.page.getByTestId("nl-count")).toContainText(/Подходящие грузы: [4-9]/);
  await expect(carrier.page.getByTestId("nl-matches")).toContainText("Бишкек");
  await carrier.context.close();
});
