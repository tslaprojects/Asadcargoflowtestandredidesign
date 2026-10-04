import "server-only";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE } from "@/components/layout/nav-config";

/** Боковая панель видна по умолчанию; скрыта — если пользователь так выбрал (cookie «1»). */
export async function sidebarCollapsed() {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
}
