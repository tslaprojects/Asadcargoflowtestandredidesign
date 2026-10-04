import { describe, expect, it } from "vitest";
import { dataModeConfig, DEFAULT_DEMO_SCHEMA, parseDbUrl, prismaCliUrl, sameTarget } from "@/lib/db/data-mode-config";

const REAL = "postgresql://app:secret@db.local:5432/cargoflow";

describe("Конфигурация режимов данных", () => {
  it("REAL — DATABASE_URL, схема public по умолчанию", () => {
    expect(dataModeConfig("real", { DATABASE_URL: REAL })).toEqual({ connectionString: REAL, schema: "public" });
  });

  it("DEMO без DEMO_DATABASE_URL — та же СУБД, отдельная схема", () => {
    const t = dataModeConfig("demo", { DATABASE_URL: REAL });
    expect(t.schema).toBe(DEFAULT_DEMO_SCHEMA);
    expect(t.connectionString).toBe(REAL);
  });

  it("DEMO_DATABASE_URL указывает на реальную базу → ошибка (даже с другими учётными данными или ?schema=public)", () => {
    expect(() => dataModeConfig("demo", { DATABASE_URL: REAL, DEMO_DATABASE_URL: REAL })).toThrow();
    expect(() =>
      dataModeConfig("demo", { DATABASE_URL: REAL, DEMO_DATABASE_URL: "postgresql://other:pw@db.local/cargoflow?schema=public" }),
    ).toThrow();
    expect(() => dataModeConfig("demo", { DATABASE_URL: `${REAL}?schema=main`, DEMO_DATABASE_URL: `${REAL}?schema=main` })).toThrow();
  });

  it("отдельная демо-база допускается", () => {
    const t = dataModeConfig("demo", { DATABASE_URL: REAL, DEMO_DATABASE_URL: "postgresql://app:secret@db.local:5432/cargoflow_demo" });
    expect(t.schema).toBe("public");
    expect(sameTarget(t, parseDbUrl(REAL))).toBe(false);
  });

  it("без DATABASE_URL — ошибка", () => {
    expect(() => dataModeConfig("real", {})).toThrow("DATABASE_URL");
  });

  it("недопустимое имя схемы отклоняется (нет SQL-инъекции через ?schema=)", () => {
    expect(() => parseDbUrl(`${REAL}?schema=a";DROP SCHEMA public;--`)).toThrow();
  });

  it("prismaCliUrl добавляет схему", () => {
    expect(prismaCliUrl({ connectionString: REAL, schema: "cargoflow_demo" })).toContain("schema=cargoflow_demo");
  });
});
