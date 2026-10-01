"use client";
import { UserPlus } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FormError } from "@/components/common/field";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { InviteLinkNotice } from "@/features/fleet/driver-components";
import { useRouter } from "next/navigation";

type Member = {
  id: string;
  role: string;
  status: string;
  createdAt: string | Date;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; lastLoginAt: string | Date | null };
};
type Invite = { id: string; email: string; role: string; expiresAt: string | Date };

export function MembersPanel({
  companyId,
  members,
  invites,
  roles,
  canManage,
  currentUserId,
}: {
  companyId: string;
  members: Member[];
  invites: Invite[];
  roles: string[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const { run } = useAction();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState(roles.find((r) => r !== "DRIVER") ?? roles[0]);
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const invite = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await api<{ link: string }>(`/api/companies/${companyId}/invites`, { body: { email, role } });
      setLink(r.link);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setOpen(true)}>
          <UserPlus /> Пригласить сотрудника
        </Button>
      )}
      <div className="border-border bg-card overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Последний вход</TableHead>
              {canManage && <TableHead className="text-right">Действия</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <p className="font-medium">
                    {m.user.firstName} {m.user.lastName}
                  </p>
                  <p className="text-muted-foreground text-xs">{m.user.email}</p>
                </TableCell>
                <TableCell>
                  {canManage && m.user.id !== currentUserId && roles.length > 1 ? (
                    <NativeSelect
                      className="h-8 w-auto"
                      aria-label={`Роль ${m.user.firstName}`}
                      defaultValue={m.role}
                      onChange={(e) =>
                        run(() => api(`/api/members/${m.id}`, { method: "PATCH", body: { role: e.target.value } }), {
                          success: "Роль изменена",
                        })
                      }
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {label("MemberRole", r)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    label("MemberRole", m.role)
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge kind="MemberStatus" value={m.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{m.user.lastLoginAt ? formatRelative(m.user.lastLoginAt) : "—"}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {m.user.id !== currentUserId && (
                      <ConfirmDialog
                        title={m.status === "ACTIVE" ? "Отключить сотрудника?" : "Включить сотрудника?"}
                        description={
                          m.status === "ACTIVE" ? "Сотрудник потеряет доступ к данным компании." : "Сотрудник снова получит доступ."
                        }
                        destructive={m.status === "ACTIVE"}
                        confirmLabel={m.status === "ACTIVE" ? "Отключить" : "Включить"}
                        onConfirm={async () =>
                          (await run(
                            () =>
                              api(`/api/members/${m.id}`, {
                                method: "PATCH",
                                body: { status: m.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
                              }),
                            { success: "Доступ обновлён" },
                          )) !== undefined
                        }
                        trigger={
                          <Button variant="ghost" size="sm">
                            {m.status === "ACTIVE" ? "Отключить" : "Включить"}
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {invites.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ожидающие приглашения</h3>
          <ul className="space-y-1 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                <span className="font-medium">{i.email}</span>
                <span className="text-muted-foreground">
                  {label("MemberRole", i.role)} · до {formatDate(i.expiresAt)}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive ml-auto"
                    onClick={() => run(() => api(`/api/invites/${i.id}`, { method: "DELETE" }), { success: "Приглашение отозвано" })}
                  >
                    Отозвать
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setLink(null);
            setEmail("");
          }
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Пригласить сотрудника</DialogTitle>
            <DialogDescription>Приглашение действует 7 дней.</DialogDescription>
          </DialogHeader>
          {link ? (
            <InviteLinkNotice link={link} />
          ) : (
            <>
              <FormError message={error} />
              <Field id="i-email" label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field id="i-role" label="Роль" required>
                <NativeSelect value={role} onChange={(e) => setRole(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {label("MemberRole", r)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={invite} loading={pending} loadingText="Создаём..." disabled={!email.includes("@")}>
                  Пригласить
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
