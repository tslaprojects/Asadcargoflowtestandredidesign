import { AppShell } from "@/components/layout/app-shell";
import { sidebarCollapsed } from "@/server/sidebar";
import { toClientActor } from "@/lib/auth/actor";
import { navKindFor, pageActor } from "@/server/page-context";
import { unreadMessagesTotal } from "@/server/services/chat.service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const unread = await unreadMessagesTotal(actor);
  return (
    <AppShell actor={toClientActor(actor)} kind={navKindFor(actor)} unreadMessages={unread} sidebarCollapsed={await sidebarCollapsed()}>
      {children}
    </AppShell>
  );
}
