import "server-only";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE } from "@/components/layout/nav-config";

/** Состояние сайдбара пользователя (свёрнут до иконок) из cookie. */
export async function sidebarCollapsed() {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
}
