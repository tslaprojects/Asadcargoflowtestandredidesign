import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { toClientActor } from "@/lib/auth/actor";
import { pageActor } from "@/server/page-context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  if (!actor.isAdmin) redirect("/forbidden");
  return (
    <AppShell actor={toClientActor(actor)} kind="admin" unreadMessages={0}>
      {children}
    </AppShell>
  );
}
