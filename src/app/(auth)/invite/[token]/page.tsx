import type { Metadata } from "next";
import Link from "next/link";
import { FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { getCurrentActor } from "@/lib/auth/session";
import { label } from "@/lib/i18n";
import { getInvitePreview } from "@/server/services/auth.service";
import { AcceptInviteButton } from "@/features/auth/accept-invite-button";

export const metadata: Metadata = { title: "Приглашение" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, actor] = await Promise.all([getInvitePreview(token), getCurrentActor()]);
  if (!preview) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Приглашение</h1>
        <FormError message="Приглашение недействительно, истекло или уже использовано. Попросите руководителя компании отправить новое." />
        <Button asChild variant="outline">
          <Link href="/login">Ко входу</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Приглашение в компанию</h1>
      <div className="border-border bg-card rounded-lg border p-4">
        <p className="text-lg font-medium">{preview.company.legalName}</p>
        <p className="text-muted-foreground text-sm">
          Роль: {label("MemberRole", preview.role)} · для {preview.email}
        </p>
      </div>
      {actor ? (
        actor.email.toLowerCase() === preview.email.toLowerCase() ? (
          <AcceptInviteButton token={token} />
        ) : (
          <FormError message={`Вы вошли как ${actor.email}. Приглашение выписано на ${preview.email} — войдите под этим адресом.`} />
        )
      ) : (
        <div className="flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={`/register?invite=${encodeURIComponent(token)}`}>Зарегистрироваться и присоединиться</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>У меня уже есть аккаунт</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
