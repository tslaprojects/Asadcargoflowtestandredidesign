import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDb } from "@/lib/db/prisma";
import { GET as meGET } from "@/app/api/auth/me/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as operationsGET } from "@/app/api/operations/route";
import { GET as driverProfileGET } from "@/app/api/driver/profile/route";
import { GET as driverTripGET } from "@/app/api/driver/trip/route";
import { GET as driverTripsGET } from "@/app/api/driver/trips/route";
import { prisma } from "@/lib/db/prisma";
import { makeCompany, makeUser, PASSWORD, resetDb, scene } from "./helpers";

// Нативное приложение: нет cookie, есть заголовок клиента и Authorization; браузер — cookie и Origin
const jar = new Map<string, string>();
let reqHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => reqHeaders,
}));

const ctx = { params: Promise.resolve({} as Record<string, string>) };
async function call(handler: (r: NextRequest, c: typeof ctx) => Promise<Response>, method: string, path: string, body?: unknown) {
  const res = await handler(
    new NextRequest(`http://localhost${path}`, {
      method,
      headers: reqHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ctx,
  );
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string } } };
}

let email = "";
beforeEach(async () => {
  jar.clear();
  await resetDb();
  const co = await makeCompany("SHIPPER");
  email = (await makeUser({ role: "SHIPPER", companyId: co.id })).email;
});

describe("Нативные приложения: вход по токену", () => {
  it("приложение получает токен и работает с ним без cookie", async () => {
    reqHeaders = new Headers({ "content-type": "application/json", "x-cargoflow-client": "native" });
    const login = await call(loginPOST, "POST", "/api/auth/login", { email, password: PASSWORD });
    const token = login.json.data?.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    jar.clear();
    reqHeaders = new Headers({ authorization: `Bearer ${token}`, "x-cargoflow-client": "native" });
    const me = await call(meGET, "GET", "/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.json.data?.email).toBe(email);
    const ops = await call(operationsGET, "GET", "/api/operations");
    expect(ops.status).toBe(200);
    expect(ops.json.data).toHaveProperty("objects");
    expect(ops.json.data).toHaveProperty("indicators");

    // Выход отзывает токен
    await call(logoutPOST, "POST", "/api/auth/logout");
    expect((await call(meGET, "GET", "/api/auth/me")).status).toBe(401);
  });

  it("браузер (есть Origin) токен в ответе не получает — только httpOnly cookie", async () => {
    reqHeaders = new Headers({
      "content-type": "application/json",
      "x-cargoflow-client": "native",
      origin: "http://localhost",
      host: "localhost",
    });
    const login = await call(loginPOST, "POST", "/api/auth/login", { email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.json.data).not.toHaveProperty("token");
  });

  it("поддельный или отозванный токен не даёт доступа", async () => {
    reqHeaders = new Headers({ authorization: "Bearer " + "x".repeat(43) });
    expect((await call(meGET, "GET", "/api/auth/me")).status).toBe(401);
    await authDb.session.updateMany({ data: { revokedAt: new Date() } });
  });
});

describe("Приложение водителя: API", () => {
  it("рейс, история и профиль водителя по токену; паспортные данные не отдаются; другим ролям — запрет", async () => {
    const sc = await scene();
    await prisma.driverProfile.update({ where: { id: sc.driver.id }, data: { passportNumber: "N0000000" } });
    const driverEmail = sc.driverActor.email;

    reqHeaders = new Headers({ "content-type": "application/json", "x-cargoflow-client": "native" });
    const token = (await call(loginPOST, "POST", "/api/auth/login", { email: driverEmail, password: PASSWORD })).json.data?.token as string;
    expect(token).toBeTruthy();
    reqHeaders = new Headers({ authorization: `Bearer ${token}`, "x-cargoflow-client": "native" });

    const trip = await call(driverTripGET, "GET", "/api/driver/trip");
    expect(trip.status).toBe(200);
    expect(trip.json.data ?? null).toBeNull();

    const trips = await call(driverTripsGET, "GET", "/api/driver/trips?pageSize=500");
    expect(trips.status).toBe(200);
    expect(trips.json.data).toMatchObject({ items: [], total: 0, page: 1, pageSize: 50 });

    const profile = await call(driverProfileGET, "GET", "/api/driver/profile");
    expect(profile.status).toBe(200);
    const profiles = profile.json.data as unknown as Record<string, unknown>[];
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ licenseNumber: "DL1" });
    expect(profiles[0]).not.toHaveProperty("passportNumber");

    // Грузовладелец не видит разделы водителя
    reqHeaders = new Headers({ "content-type": "application/json", "x-cargoflow-client": "native" });
    const shipperToken = (await call(loginPOST, "POST", "/api/auth/login", { email: sc.shipper.email, password: PASSWORD })).json.data
      ?.token as string;
    reqHeaders = new Headers({ authorization: `Bearer ${shipperToken}`, "x-cargoflow-client": "native" });
    expect((await call(driverTripsGET, "GET", "/api/driver/trips")).status).toBe(403);
    expect((await call(driverProfileGET, "GET", "/api/driver/profile")).status).toBe(403);
  });
});
