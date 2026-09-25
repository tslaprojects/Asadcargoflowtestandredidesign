"use client";
import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

export function MarkAllReadButton() {
  const { run, pending } = useAction();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() => run(() => api("/api/notifications/read-all", { method: "POST" }), { success: "Все уведомления прочитаны" })}
    >
      <CheckCheck /> Отметить все прочитанными
    </Button>
  );
}

/** Клик по уведомлению ведёт прямо к объекту и отмечает его прочитанным. */
export function NotificationLink({
  id,
  href,
  unread,
  children,
}: {
  id: string;
  href: string | null;
  unread: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="hover:bg-muted/60 block w-full px-4 py-3 text-left"
      onClick={async () => {
        if (unread) await api(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
        if (href) router.push(href);
        else router.refresh();
      }}
    >
      {children}
    </button>
  );
}
