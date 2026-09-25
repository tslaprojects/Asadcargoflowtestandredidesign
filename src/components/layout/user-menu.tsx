"use client";
import { LogOut, Shield, User } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientActor } from "@/lib/auth/actor";
import { api } from "@/lib/client/api";
import type { NavKind } from "./nav-config";

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
        className="grid size-9 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-white hover:bg-slate-700"
        aria-label={`Меню пользователя ${actor.fullName}`}
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-foreground">
          <span className="block font-semibold">{actor.fullName}</span>
          <span className="text-muted-foreground block truncate font-normal">{actor.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(kind === "driver" ? "/driver/profile" : "/profile")}>
          <User /> Профиль
        </DropdownMenuItem>
        {actor.isAdmin && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <Shield /> Администрирование
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} className="text-destructive">
          <LogOut className="!text-destructive" /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
