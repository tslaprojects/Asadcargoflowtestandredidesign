import { execFileSync } from "node:child_process";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentActor, SESSION_COOKIE } from "@/lib/auth/session";
import { permissionsForRole } from "@/lib/permissions";
import { runWithDataMode } from "@/lib/db/data-mode";
import { authDb, dbFor, prisma } from "@/lib/db/prisma";
import { DEMO_ANCHORS } from "@/server/services/demo-workspace.service";
import type { CompanyType } from "@/generated/prisma/enums";
import { POST as dataModePOST } from "@/app/api/auth/data-mode/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as loadGET } from "@/app/api/loads/[id]/route";
import { GET as loadsGET, POST as loadsPOST } from "@/app/api/loads/route";
import { loadInput, makeCompany, makeUser, PASSWORD, resetDb } from "./helpers";

// Cookie-хранилище «браузера» и заголовки запроса для next/headers вне сервера Next.js
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.0.0.9" }),
}));

const demo = dbFor("demo");

function req(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function call<P extends Record<string, string>>(
  handler: (r: NextRequest, c: { params: Promise<P> }) => Promise<Response>,
  r: NextRequest,
  params?: P,
) {
  const res = await handler(r, { params: Promise.resolve(params ?? ({} as P)) });
  return { status: res.status, json: (await res.json()) as { success: boolean; data?: never; error?: { code: string } } };
}

async function signIn(email: string, dataMode?: "real" | "demo") {
  jar.clear();
  return call(loginPOST, req("/api/auth/login", { method: "POST", body: { email, password: PASSWORD, dataMode } }));
}

async function sessionRow() {
  const sessions = await authDb.session.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 });
  return sessions[0];
}

/** Ключевые демо-компании (в демо-базе их создаёт seed:demo). */
async function seedDemoAnchors() {
  await runWithDataMode("demo", async () => {
    await resetDb();
    const anchors: [keyof typeof DEMO_ANCHORS, CompanyType][] = [
      ["SHIPPER", "SHIPPER"],
      ["CARRIER", "CARRIER"],
      ["FORWARDER", "FORWARDER"],
    ];
    for (const [key, type] of anchors) {
      const c = await makeCompany(type, `Demo ${key}`);
      await prisma.company.update({ where: { id: c.id }, data: { registrationNumber: DEMO_ANCHORS[key] } });
    }
  });
}

let shipperEmail = "";
let adminEmail = "";
let blockedEmail = "";

beforeAll(async () => {
  await resetDb();
  await runWithDataMode("demo", resetDb);
});

beforeEach(async () => {
  jar.clear();
  await resetDb();
  const shipperCo = await makeCompany("SHIPPER", "Real Shipper LLP");
  shipperEmail = (await makeUser({ role: "SHIPPER", companyId: shipperCo.id })).email;
  adminEmail = (await makeUser({ admin: true })).email;
  blockedEmail = (await makeUser({ role: "SHIPPER", companyId: shipperCo.id })).email;
  await seedDemoAnchors();
});

describe("Режимы данных: вход и сессия", () => {
  it("по умолчанию вход в реальную базу; режим хранится в серверной сессии", async () => {
    const res = await signIn(shipperEmail);
    expect(res.status).toBe(200);
    expect((await sessionRow()).dataMode).toBe("REAL");
    expect((await getCurrentActor())?.dataMode).toBe("real");
  });

  it("вход в демо: те же учётные данные, сессия DEMO, роль сохраняется, пароль в демо-базе не хранится", async () => {
    const res = await signIn(shipperEmail, "demo");
    expect(res.status).toBe(200);
    expect((await sessionRow()).dataMode).toBe("DEMO");
    const actor = await getCurrentActor();
    expect(actor?.dataMode).toBe("demo");
    expect(actor?.active?.role).toBe("SHIPPER");
    expect(actor?.active?.companyId).toBe(
      (await demo.company.findFirstOrThrow({ where: { registrationNumber: DEMO_ANCHORS.SHIPPER } })).id,
    );
    const mirror = await demo.user.findFirstOrThrow({ where: { email: shipperEmail } });
    expect(mirror.passwordHash.startsWith("$")).toBe(false);
  });

  it("при первом входе в демо пользователь получает ленту уведомлений персонажа с той же ролью", async () => {
    await runWithDataMode("demo", async () => {
      const anchor = await prisma.company.findFirstOrThrow({ where: { registrationNumber: DEMO_ANCHORS.SHIPPER } });
      const persona = await makeUser({ role: "SHIPPER", companyId: anchor.id });
      await prisma.notification.createMany({
        data: [
          { userId: persona.id, type: "SYSTEM", title: "Новая ставка" },
          { userId: persona.id, type: "SYSTEM", title: "Груз доставлен", readAt: new Date() },
        ],
      });
    });
    await signIn(shipperEmail, "demo");
    const actor = await getCurrentActor();
    const feed = await demo.notification.findMany({ where: { userId: actor!.userId } });
    expect(feed.map((n) => n.title).sort()).toEqual(["Груз доставлен", "Новая ставка"]);
    expect(feed.filter((n) => !n.readAt)).toHaveLength(1);
    expect(await authDb.notification.count({ where: { userId: actor!.userId } })).toBe(0);
  });

  it("демо недоступно, пока демо-база не загружена (503), а не тихий вход в реальную", async () => {
    await runWithDataMode("demo", resetDb);
    const res = await signIn(shipperEmail, "demo");
    expect(res.status).toBe(503);
    expect(res.json.error?.code).toBe("SERVICE_UNAVAILABLE");
    expect(await authDb.session.count()).toBe(0);
  });

  it("неверный режим в теле входа отклоняется валидацией", async () => {
    jar.clear();
    const res = await call(
      loginPOST,
      req("/api/auth/login", { method: "POST", body: { email: shipperEmail, password: PASSWORD, dataMode: "prod" } }),
    );
    expect(res.status).toBe(422);
    expect(res.json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("неверный пароль не входит ни в один режим", async () => {
    jar.clear();
    const res = await call(
      loginPOST,
      req("/api/auth/login", { method: "POST", body: { email: shipperEmail, password: "wrong-pass1", dataMode: "demo" } }),
    );
    expect(res.status).toBe(401);
    expect(await demo.user.count({ where: { email: shipperEmail } })).toBe(0);
  });
});

describe("Режимы данных: изоляция и атаки на режим", () => {
  it("груз, созданный в демо, есть только в демо-базе — даже если клиент подставляет режим real", async () => {
    await signIn(shipperEmail, "demo");
    const tampered = req("/api/loads", {
      method: "POST",
      body: { load: loadInput({ title: "Демо-груз" }), publish: false, dataMode: "real" },
      headers: { "x-data-mode": "real", cookie: "cf_data_mode=real" },
    });
    const res = await call(loadsPOST, tampered);
    expect(res.status).toBe(201);
    expect(await demo.load.count({ where: { title: "Демо-груз" } })).toBe(1);
    expect(await authDb.load.count({ where: { title: "Демо-груз" } })).toBe(0);
  });

  it("объект реальной базы недоступен из демо-сессии по id и наоборот", async () => {
    await signIn(shipperEmail, "real");
    const real = await call(loadsPOST, req("/api/loads", { method: "POST", body: { load: loadInput({ title: "Реальный груз" }) } }));
    const realId = (real.json.data as unknown as { id: string }).id;
    expect((await call(loadGET, req(`/api/loads/${realId}`), { id: realId })).status).toBe(200);

    await signIn(shipperEmail, "demo");
    const demoRes = await call(loadsPOST, req("/api/loads", { method: "POST", body: { load: loadInput({ title: "Демо-груз" }) } }));
    const demoId = (demoRes.json.data as unknown as { id: string }).id;
    expect(
      (await call(loadGET, req(`/api/loads/${realId}?dataMode=real`, { headers: { "x-data-mode": "real" } }), { id: realId })).status,
    ).toBe(404);
    expect((await call(loadGET, req(`/api/loads/${demoId}`), { id: demoId })).status).toBe(200);

    await signIn(shipperEmail, "real");
    expect((await call(loadGET, req(`/api/loads/${demoId}`), { id: demoId })).status).toBe(404);
  });

  it("подделанный токен сессии не даёт доступа ни к одному режиму", async () => {
    jar.set(SESSION_COOKIE, "forged-token");
    const res = await call(loadsGET, req("/api/loads"));
    expect(res.status).toBe(401);
  });

  it("роль платформы берётся из реальной identity: правка демо-базы не делает пользователя админом", async () => {
    await signIn(shipperEmail, "demo");
    await demo.user.updateMany({ where: { email: shipperEmail }, data: { platformRole: "PLATFORM_ADMIN" } });
    const actor = await getCurrentActor();
    expect(actor?.isAdmin).toBe(false);
    expect([...(actor?.permissions ?? [])].sort()).toEqual([...permissionsForRole("SHIPPER")].sort());
  });

  it("администратор остаётся администратором в демо-режиме", async () => {
    await signIn(adminEmail, "demo");
    const actor = await getCurrentActor();
    expect(actor?.dataMode).toBe("demo");
    expect(actor?.isAdmin).toBe(true);
  });

  it("блокировка в реальной базе действует и в демо-сессии", async () => {
    await signIn(blockedEmail, "demo");
    expect(await getCurrentActor()).not.toBeNull();
    await authDb.user.update({ where: { email: blockedEmail }, data: { status: "BLOCKED" } });
    expect(await getCurrentActor()).toBeNull();
  });

  it("переключение режима выдаёт новую сессию и отзывает прежнюю", async () => {
    await signIn(shipperEmail, "real");
    const before = await sessionRow();
    const oldToken = jar.get(SESSION_COOKIE);
    const res = await call(dataModePOST, req("/api/auth/data-mode", { method: "POST", body: { dataMode: "demo" } }));
    expect(res.status).toBe(200);
    expect(jar.get(SESSION_COOKIE)).not.toBe(oldToken);
    expect((await authDb.session.findUniqueOrThrow({ where: { id: before.id } })).revokedAt).not.toBeNull();
    expect((await sessionRow()).dataMode).toBe("DEMO");
    expect((await getCurrentActor())?.dataMode).toBe("demo");
  });

  it("переключение без сессии запрещено", async () => {
    jar.clear();
    const res = await call(dataModePOST, req("/api/auth/data-mode", { method: "POST", body: { dataMode: "demo" } }));
    expect(res.status).toBe(401);
  });

  it("демо-база пересоздана после входа — рабочее пространство восстанавливается автоматически", async () => {
    await signIn(shipperEmail, "demo");
    await seedDemoAnchors();
    const actor = await getCurrentActor();
    expect(actor?.dataMode).toBe("demo");
    expect(actor?.active?.role).toBe("SHIPPER");
  });
});

describe("seed:demo не запускается против реальной базы", () => {
  function runSeed(demoUrl: string) {
    try {
      execFileSync("npx", ["tsx", "--conditions=react-server", "prisma/seed-demo.ts"], {
        env: { ...process.env, DEMO_DATABASE_URL: demoUrl },
        stdio: "pipe",
      });
      return { code: 0, stderr: "" };
    } catch (e) {
      const err = e as { status: number; stderr: Buffer };
      return { code: err.status, stderr: err.stderr.toString() };
    }
  }

  it("DEMO_DATABASE_URL = DATABASE_URL → остановка", async () => {
    const before = await authDb.user.count();
    const r = runSeed(process.env.DATABASE_URL!);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("ERROR: Demo seed can only run against DEMO database.");
    expect(await authDb.user.count()).toBe(before);
  }, 60_000);

  it("схема без метки cargoflow:demo → остановка", async () => {
    await authDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS cf_unmarked_test`);
    try {
      const u = new URL(process.env.DATABASE_URL!);
      u.searchParams.set("schema", "cf_unmarked_test");
      const r = runSeed(u.toString());
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("ERROR: Demo seed can only run against DEMO database.");
    } finally {
      await authDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS cf_unmarked_test CASCADE`);
    }
  }, 60_000);
});
