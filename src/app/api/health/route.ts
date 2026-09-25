import { prisma } from "@/lib/db/prisma";
import { route } from "@/lib/api/handler";

export const GET = route({ auth: false }, async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", time: new Date().toISOString() };
});
