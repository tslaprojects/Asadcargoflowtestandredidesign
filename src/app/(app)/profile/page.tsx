import type { Metadata } from "next";
import { DefinitionList, PageHeader } from "@/components/common/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { label } from "@/lib/i18n";
import { LogoutButton } from "@/features/auth/logout-button";
import { ChangePasswordForm, ProfileForm } from "@/features/profile/profile-forms";
import { pageActor } from "@/server/page-context";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const actor = await pageActor();
  return (
    <>
      <PageHeader title="Профиль" description={actor.email} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Личные данные</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm initial={{ firstName: actor.firstName, lastName: actor.lastName, phone: actor.phone ?? "" }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Безопасность</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Компании и роли</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              className="sm:grid-cols-1"
              items={actor.memberships.map((m) => ({
                label: m.company.legalName,
                value: `${label("MemberRole", m.role)}${m.companyId === actor.active?.companyId ? " (текущая)" : ""}`,
              }))}
            />
            {actor.isAdmin && <p className="text-body mt-3">Роль платформы: {label("PlatformRole", actor.platformRole)}</p>}
            <p className="text-muted-foreground text-footnote mt-3">
              Часовой пояс: {actor.timezone}. Даты хранятся в UTC и отображаются в вашем часовом поясе.
            </p>
          </CardContent>
        </Card>
        <div className="lg:max-w-xs">
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
