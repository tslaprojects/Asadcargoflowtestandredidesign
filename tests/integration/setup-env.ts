import "dotenv/config";
import os from "node:os";
import path from "node:path";

// Интеграционные тесты работают только с отдельной тестовой БД
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
delete process.env.DEMO_DATABASE_URL;
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), "cargoflow-test-storage");
process.env.APP_SECRET ||= "test-secret-test-secret-test-secret-123456";
process.env.DISABLE_RATE_LIMIT = "1";
process.env.EMAIL_DRIVER = "none";
// Тесты не ходят в сеть: без ключа маршруты — оценка, провайдеры подменяются фейками в самих тестах
delete process.env.GEOAPIFY_API_KEY;
