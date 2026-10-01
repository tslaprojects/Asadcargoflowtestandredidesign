import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { sidebarCollapsed } from "@/server/sidebar";
import { toClientActor } from "@/lib/auth/actor";
import { pageActor } from "@/server/page-context";
import { unreadMessagesTotal } from "@/server/services/chat.service";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  if (!actor.memberships.some((m) => m.role === "DRIVER")) redirect("/dashboard");
  return (
    <AppShell
      actor={toClientActor(actor)}
      kind="driver"
      unreadMessages={await unreadMessagesTotal(actor)}
      sidebarCollapsed={await sidebarCollapsed()}
    >
      <div className="mx-auto max-w-xl">{children}</div>
    </AppShell>
  );
}
