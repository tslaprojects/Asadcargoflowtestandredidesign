import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { currentDataMode, type DataMode } from "./data-mode";
import { dataModeConfig } from "./data-mode-config";

const globalForPrisma = globalThis as unknown as { prismaClients?: Partial<Record<DataMode, PrismaClient>> };

function createClient(mode: DataMode) {
  const { connectionString, schema } = dataModeConfig(mode);
  // search_path — для raw SQL (блокировки FOR UPDATE, последовательности номеров): иначе неквалифицированные
  // имена таблиц ушли бы в схему по умолчанию, т. е. в другую базу.
  const adapter = new PrismaPg({ connectionString, options: `-c search_path="${schema}"` }, { schema });
  return new PrismaClient({ adapter });
}

/** Клиент конкретной базы (создаётся при первом обращении, один на процесс). */
export function dbFor(mode: DataMode): PrismaClient {
  const clients = (globalForPrisma.prismaClients ??= {});
  return (clients[mode] ??= createClient(mode));
}

function routedProxy(resolve: () => PrismaClient): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const client = resolve();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

/**
 * Бизнес-данные: база режима текущего запроса (DEMO или REAL из серверной сессии).
 * Вне запроса (миграции, скрипты, тесты, вебхуки провайдеров) — реальная база, если режим не задан явно
 * через runWithDataMode. Сервисы пишут `prisma.load.findMany(...)` и не знают о режимах.
 */
export const prisma: PrismaClient = routedProxy(() => dbFor(currentDataMode() ?? "real"));

/**
 * Identity и сессии: всегда реальная база — единая система пользователей для обоих режимов.
 * Используется только сессионным слоем и сервисом авторизации.
 */
export const authDb: PrismaClient = routedProxy(() => dbFor("real"));

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
