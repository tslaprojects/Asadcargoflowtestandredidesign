import type { Metadata } from "next";
import Link from "next/link";
import { DefinitionList, PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit/actions";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { UserBlockButton } from "@/features/admin/admin-actions";
import { guard, pageActorWith } from "@/server/page-context";
import { adminGetUser } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Пользователь" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActorWith("ADMIN_USERS");
  const { user, activity } = toPlain(await guard(adminGetUser(actor, id)));
  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "Пользователи" }}
        title={
          <span className="flex items-center gap-3">
            {user.firstName} {user.lastName} <StatusBadge kind="UserStatus" value={user.status} size="lg" />
          </span>
        }
        description={user.email}
        actions={user.id !== actor.userId && <UserBlockButton userId={user.id} status={user.status} />}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Профиль</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              items={[
                { label: "Телефон", value: user.phone ?? "—" },
                { label: "Роль платформы", value: label("PlatformRole", user.platformRole) },
                { label: "Регистрация", value: formatDateTime(user.createdAt) },
                { label: "Последний вход", value: formatDateTime(user.lastLoginAt) },
                ...(user.blockedAt
                  ? [
                      {
                        label: "Заблокирован",
                        value: `${formatDateTime(user.blockedAt)}${user.blockReason ? ` — ${user.blockReason}` : ""}`,
                      },
                    ]
                  : []),
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Компании</CardTitle>
          </CardHeader>
          <CardContent className="text-body space-y-2">
            {user.memberships.length === 0 && <p className="text-muted-foreground">Нет компаний</p>}
            {user.memberships.map((m) => (
              <Link
                key={m.id}
                href={`/admin/companies/${m.company.id}`}
                className="hover:bg-muted flex items-center justify-between rounded-lg p-2"
              >
                <span>
                  {m.company.legalName} · {label("MemberRole", m.role)}
                </span>
                <StatusBadge kind="VerificationStatus" value={m.company.verificationStatus} />
              </Link>
            ))}
            <p className="text-muted-foreground text-footnote pt-2">Активных сессий: {user.sessions.length}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Активность</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-body divide-y-(length:--hairline)">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {AUDIT_ACTION_LABELS[a.action as AuditAction] ?? a.action}{" "}
                    <span className="text-muted-foreground">· {a.entityType}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDateTime(a.createdAt)}
                    {a.ipAddress ? ` · ${a.ipAddress}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
