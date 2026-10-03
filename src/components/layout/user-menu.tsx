"use client";
import { LogOut, Shield, User } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientActor } from "@/lib/auth/actor";
import { api } from "@/lib/client/api";
import { t } from "@/lib/i18n";
import type { NavKind } from "./nav-config";

/** Монограмма пользователя, как у контакта в iOS, и меню учётной записи. */
export function UserMenu({ actor, kind }: { actor: ClientActor; kind: NavKind }) {
  const router = useRouter();
  const initials = `${actor.firstName[0] ?? ""}${actor.lastName[0] ?? ""}`.toUpperCase();
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="bg-fill text-foreground text-footnote grid size-8 place-items-center rounded-full font-semibold tracking-wide transition-opacity duration-(--duration-micro) hover:opacity-80 lg:size-7"
        aria-label={`Меню пользователя ${actor.fullName}`}
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 pt-1.5 pb-2">
          <p className="font-semibold">{actor.fullName}</p>
          <p className="text-footnote text-muted-foreground truncate">{actor.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(kind === "driver" ? "/driver/profile" : "/profile")}>
          <User /> {t("nav.profile")}
        </DropdownMenuItem>
        {actor.isAdmin && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <Shield /> {t("nav.admin")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut /> {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
