"use client";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

export function AcceptInviteButton({ token }: { token: string }) {
  const { run, pending } = useAction();
  return (
    <Button
      size="lg"
      className="w-full"
      loading={pending}
      loadingText="Присоединяем..."
      onClick={() =>
        run(() => api("/api/auth/invite/accept", { body: { token } }), {
          success: "Вы присоединились к компании",
          refresh: false,
          onSuccess: () => {
            window.location.assign("/");
          },
        })
      }
    >
      Принять приглашение
    </Button>
  );
}
