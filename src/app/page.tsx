import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { homePathFor } from "@/server/services/auth.service";

export default async function Home() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  redirect(homePathFor(actor.active?.role ?? null, actor.isAdmin));
}
