"use client";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

export function LogoutButton() {
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        window.location.assign("/login");
      }}
    >
      <LogOut /> Выйти
    </Button>
  );
}
