import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Сквозной сценарий MVP (спецификация §82, §108):
 * регистрация → груз → публикация → ставка перевозчика → принятие → договор → подписи →
 * автомобиль → водитель → статусы водителя (+фото, геолокация) → доставка с POD →
 * подтверждение получения → CLOSED → отзывы обеих сторон. Плюс проверка RBAC на API.
 */

const DEMO_PASSWORD = "Demo1234!";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

function isoDate(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 86400_000).toISOString().slice(0, 10);
}

async function login(browser: Browser, email: string, password = DEMO_PASSWORD, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return { context, page };
}

async function confirmInDialog(page: Page, name: string | RegExp) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name }).click();
  await expect(dialog).toBeHidden();
}

async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("полный сценарий цифровой перевозки", async ({ browser }) => {
  const suffix = Date.now().toString().slice(-6);
  const shipperEmail = `e2e.shipper.${suffix}@cargoflow.test`;
  const shipperPassword = "E2eShipper123";

  // ── 1. Регистрация грузовладельца и создание компании ──
  const shipperCtx = await browser.newContext();
  const shipper = await shipperCtx.newPage();
  await shipper.goto("/register");
  await shipper.getByLabel("Имя").fill("Айгерим");
  await shipper.getByLabel("Фамилия").fill("Тестова");
  await shipper.getByLabel("Телефон").fill("+7 701 555 00 11");
  await shipper.getByLabel("Email").fill(shipperEmail);
  await shipper.getByLabel("Пароль").fill(shipperPassword);
  await shipper.getByRole("button", { name: "Продолжить" }).click();
  await expect(shipper.getByText("Выберите тип деятельности")).toBeVisible();
  await shipper.getByText("Грузовладелец", { exact: true }).click();
  await shipper.getByRole("button", { name: "Продолжить" }).click();
  await shipper.getByLabel("Юридическое название").fill(`E2E Cargo ${suffix} LLP`);
  await shipper.getByLabel(/Рег\. номер/).fill(`E2E-${suffix}`);
  await shipper.getByLabel("Город").fill("Алматы");
  await shipper.getByLabel("Адрес").fill("пр. Абая, 1");
  await shipper.getByRole("button", { name: "Зарегистрироваться" }).click();
  await shipper.waitForURL("**/dashboard");
  await expect(shipper.getByRole("heading", { name: /Здравствуйте, Айгерим/ })).toBeVisible();

  // ── 2. Создание груза: маршрут Китай → Алматы → Москва ──
  await shipper.getByRole("link", { name: "Создать груз" }).first().click();
  await shipper.waitForURL("**/loads/new");
  const stop0 = shipper.getByTestId("stop-0");
  await stop0.getByLabel("Страна").selectOption("CN");
  await stop0.getByLabel("Город").fill("Урумчи");
  await stop0.getByLabel("Адрес").fill("Промзона Мидун, склад 12");
  await stop0.getByLabel("Дата").fill(isoDate(3));
  await shipper.getByRole("button", { name: "Добавить точку" }).click();
  const stop1 = shipper.getByTestId("stop-1");
  await stop1.getByLabel("Тип точки").selectOption("TRANSIT");
  await stop1.getByLabel("Страна").selectOption("KZ");
  await stop1.getByLabel("Город").fill("Алматы");
  const stop2 = shipper.getByTestId("stop-2");
  await stop2.getByLabel("Страна").selectOption("RU");
  await stop2.getByLabel("Город").fill("Москва");
  await stop2.getByLabel("Дата").fill(isoDate(12));
  await shipper.getByRole("button", { name: "Продолжить" }).click();

  await shipper.getByLabel("Название груза").fill("E2E Электроника");
  await shipper.getByLabel("Вес, кг").fill("20000");
  await shipper.getByLabel("Объём, м³").fill("82");
  await shipper.getByRole("button", { name: "Продолжить" }).click();

  await expect(shipper.getByLabel("Тип кузова")).toHaveValue("CURTAINSIDER");
  await shipper.getByRole("button", { name: "Продолжить" }).click();

  await shipper.getByLabel("Стоимость").fill("4500");
  await expect(shipper.getByLabel("Валюта")).toHaveValue("USD");
  await shipper.getByRole("button", { name: "Предпросмотр" }).click();
  await expect(shipper.getByTestId("load-preview")).toContainText("E2E Электроника");
  await shipper.getByRole("button", { name: "Опубликовать груз" }).click();
  await shipper.waitForURL(/\/loads\/[0-9a-f-]{36}$/);
  const loadUrl = shipper.url();
  const loadHeading = await shipper.getByRole("heading", { level: 1 }).innerText();
  const loadNumber = loadHeading.match(/CF-L-\d{6}/)![0];
  await expect(shipper.getByRole("heading", { level: 1 })).toContainText("Опубликован");

  // ── 3. Перевозчик видит груз на бирже и предлагает цену ──
  const { page: carrier } = await login(browser, "carrier@cargoflow.demo");
  await carrier.goto(`/marketplace?q=${loadNumber}`);
  await carrier.getByTestId("load-card").filter({ hasText: loadNumber }).click();
  await carrier.waitForURL(loadUrl);
  await carrier.getByTestId("open-bid-dialog").first().click();
  await carrier.getByRole("dialog").getByLabel("Цена").fill("4200");
  await carrier.getByRole("dialog").getByRole("button", { name: "Отправить предложение" }).click();
  await expectToast(carrier, "Предложение отправлено");

  // ── 4. Грузовладелец получает уведомление и принимает предложение ──
  await shipper.goto("/dashboard");
  await shipper.getByTestId("notification-bell").click();
  await expect(shipper.getByRole("dialog").getByText(`Новое предложение по грузу ${loadNumber}`)).toBeVisible();
  await shipper.keyboard.press("Escape");
  await shipper.goto(`${loadUrl}?tab=bids`);
  await expect(shipper.getByTestId("bid-card")).toContainText("Demo Trans Logistics");
  await shipper.getByTestId("accept-bid").click();
  await confirmInDialog(shipper, "Принять предложение");
  await shipper.waitForURL(/\/orders\/[0-9a-f-]{36}\?tab=contract/);
  const orderUrl = shipper.url().split("?")[0];
  const orderNumber = (await shipper.getByRole("heading", { level: 1 }).innerText()).match(/CF-O-\d{6}/)![0];

  // ── 5. Подписание договора обеими сторонами ──
  const sign = async (page: Page, password: string) => {
    await page.goto(`${orderUrl}?tab=contract`);
    await expect(page.getByTestId("contract-hash")).toHaveText(/^[a-f0-9]{64}$/);
    await page.getByLabel("Я подтверждаю ознакомление с документом и согласие с его условиями.").check();
    await page.getByLabel("Пароль для подтверждения личности").fill(password);
    await page.getByTestId("sign-contract").click();
    await expectToast(page, /Договор успешно подписан/);
  };
  await sign(shipper, shipperPassword);
  await sign(carrier, DEMO_PASSWORD);
  await carrier.goto(orderUrl);
  await expect(carrier.getByRole("heading", { level: 1 })).toContainText("Договор подписан");

  // ── 6. Перевозчик назначает автомобиль и водителя ──
  await carrier.getByTestId("assign-vehicle").click();
  await carrier.getByRole("dialog").getByRole("radio", { name: "KZ 123 AB" }).check();
  await carrier.getByRole("dialog").getByRole("button", { name: "Назначить" }).click();
  await expectToast(carrier, "Автомобиль назначен");
  await expect(carrier.getByTestId("summary-vehicle")).toContainText("KZ 123 AB");
  await carrier.getByTestId("assign-driver").click();
  await carrier.getByRole("dialog").getByRole("radio", { name: "Demo Driver" }).check();
  await carrier.getByRole("dialog").getByRole("button", { name: "Назначить" }).click();
  await expectToast(carrier, "Водитель назначен");
  await expect(carrier.getByTestId("summary-driver")).toContainText("Demo Driver");
  await expect(carrier.getByRole("heading", { level: 1 })).toContainText("Ожидает загрузки");

  // ── 7. Водитель проводит рейс в мобильном интерфейсе ──
  const { context: driverCtx, page: driver } = await login(browser, "driver@cargoflow.demo", DEMO_PASSWORD, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 43.8256, longitude: 87.6168, accuracy: 20 },
    permissions: ["geolocation"],
  });
  await driver.waitForURL("**/driver");
  await expect(driver.getByTestId("driver-trip-number")).toHaveText(`#${orderNumber}`);

  const driverStep = async (status: string) => {
    await driver.getByTestId(`driver-action-${status}`).click();
    await confirmInDialog(driver, "Подтвердить");
    await expectToast(driver, "Статус перевозки обновлён");
  };
  await driverStep("AT_LOADING");
  // Фото груза при загрузке
  await driver.getByRole("button", { name: "Фото / документ" }).click();
  await driver.getByRole("dialog").getByLabel("Файл").setInputFiles({ name: "cargo.png", mimeType: "image/png", buffer: PNG });
  await driver.getByRole("dialog").getByRole("button", { name: "Загрузить документ" }).click();
  await expectToast(driver, "Документ загружен");
  await driverStep("LOADED");
  await driverStep("IN_TRANSIT");
  // Геолокация в пути
  await driverCtx.setGeolocation({ latitude: 44.2131, longitude: 80.4127, accuracy: 25 });
  await driver.getByTestId("driver-send-location").click();
  await expectToast(driver, "Местоположение отправлено");
  await driverStep("AT_BORDER");
  await driverStep("CUSTOMS");
  await driverStep("BORDER_CLEARED");
  await driverStep("IN_TRANSIT");
  await driverCtx.setGeolocation({ latitude: 55.7558, longitude: 37.6173, accuracy: 15 });
  await driverStep("AT_DELIVERY");
  // Доставка с подтверждением (POD)
  await driver.getByTestId("deliver").click();
  const deliverDialog = driver.getByRole("dialog");
  await deliverDialog.getByLabel("Файл").setInputFiles({ name: "cmr-signed.pdf", mimeType: "application/pdf", buffer: PDF });
  await deliverDialog.getByRole("button", { name: "Приложить файл" }).click();
  await expect(deliverDialog.getByText("cmr-signed.pdf")).toBeVisible();
  await deliverDialog.getByLabel("Комментарий").fill("Выгружено без замечаний");
  await driver.getByTestId("confirm-deliver").click();
  await expectToast(driver, /Доставка отмечена/);
  await expect(driver.getByText("Груз доставлен. Ожидаем подтверждения получения заказчиком.")).toBeVisible();

  // ── 8. Заказчик видит местоположение и подтверждает получение ──
  await shipper.goto(`${orderUrl}?tab=route`);
  await expect(shipper.getByTestId("last-location")).toContainText("Последнее обновление");
  await shipper.goto(orderUrl);
  await expect(shipper.getByRole("heading", { level: 1 })).toContainText("Доставлено");
  await shipper.getByTestId("confirm-delivery").click();
  await confirmInDialog(shipper, "Подтвердить получение груза");
  await expectToast(shipper, /Перевозка закрыта/);
  await expect(shipper.getByRole("heading", { level: 1 })).toContainText("Закрыто");

  // Финансы: сформирован окончательный расчёт
  await shipper.goto(`${orderUrl}?tab=finance`);
  await expect(shipper.getByTestId("finance-summary")).toContainText("4 200");
  await expect(shipper.getByRole("cell", { name: "Окончательный расчёт", exact: true })).toBeVisible();

  // ── 9. Обе стороны оставляют отзывы ──
  const review = async (page: Page) => {
    await page.goto(orderUrl);
    await page.getByTestId("open-review").click();
    await page.getByTestId("submit-review").click();
    await expectToast(page, /Отзыв опубликован/);
    await expect(page.getByText("Вы оставили отзыв по этой перевозке")).toBeVisible();
  };
  await review(shipper);
  await review(carrier);

  // История изменений связана с журналом аудита
  await shipper.goto(`${orderUrl}?tab=history`);
  const feed = shipper.getByTestId("audit-feed");
  await expect(feed).toContainText("принял предложение");
  await expect(feed).toContainText("подписал договор");
  await expect(feed).toContainText("подтвердил получение груза");

  await shipperCtx.close();
});

test("RBAC защищён на backend (API возвращает 403)", async ({ browser }) => {
  const { context: shipperCtx } = await login(browser, "shipper@cargoflow.demo");
  const { context: driverCtx } = await login(browser, "driver@cargoflow.demo");
  const orders = await (await shipperCtx.request.get("/api/orders?pageSize=50")).json();
  const signed = orders.data.items.find((o: { currentStatus: string }) => o.currentStatus === "CONTRACT_SIGNED");
  expect(signed).toBeTruthy();

  // Грузовладелец пытается назначить автомобиль → 403
  const vehicleRes = await shipperCtx.request.post(`/api/orders/${signed.id}/vehicle`, {
    data: { vehicleId: "00000000-0000-4000-8000-000000000000" },
  });
  expect(vehicleRes.status()).toBe(403);
  expect((await vehicleRes.json()).error.code).toBe("FORBIDDEN");

  // Водитель пытается получить список грузов биржи → 403
  const loadsRes = await driverCtx.request.get("/api/loads?scope=marketplace");
  expect(loadsRes.status()).toBe(403);

  // Без авторизации → 401 в едином формате
  const anon = await browser.newContext();
  const anonRes = await anon.request.get("/api/orders");
  expect(anonRes.status()).toBe(401);
  expect(await anonRes.json()).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });

  // CSRF: запрос с чужим Origin отклоняется
  const csrf = await shipperCtx.request.post("/api/notifications/read-all", { headers: { Origin: "https://evil.example" } });
  expect(csrf.status()).toBe(403);
});

test("защищённые страницы требуют входа", async ({ page }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders/);
});

export type { BrowserContext };
