import "server-only";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE } from "@/components/layout/nav-config";

/** Навигация по умолчанию — компактная полоса иконок; развёрнутая с подписями — если пользователь так выбрал (cookie «0»). */
export async function sidebarCollapsed() {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value !== "0";
}
