"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Mail, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/client/api";

const form = z.object({
  fullName: z.string().trim().min(3, "Укажите ФИО водителя"),
  phone: z.string().trim().min(7, "Укажите телефон"),
  licenseNumber: z.string().trim().min(3, "Укажите номер удостоверения"),
  licenseCategory: z.string().trim().min(1, "Укажите категорию"),
  licenseExpiry: z.string().optional(),
  passportNumber: z.string().optional(),
  status: z.string().optional(),
  inviteEmail: z.string().optional(),
});
type Values = z.infer<typeof form>;

export type DriverRow = {
  id: string;
  fullName: string;
  phone: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiry: string | Date | null;
  passportNumber: string | null;
  status: string;
};

export function InviteLinkNotice({ link }: { link: string }) {
  return (
    <div className="border-info-border bg-info-bg text-body space-y-2 rounded-lg border p-3">
      <p className="text-info font-medium">Приглашение создано</p>
      <p className="text-muted-foreground">
        Отправьте ссылку водителю (в локальной среде письмо пишется в лог сервера). Ссылка показывается один раз.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label="Ссылка-приглашение" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Скопировать ссылку"
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            toast.success("Ссылка скопирована");
          }}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

export function DriverFormDialog({ driver, trigger }: { driver?: DriverRow; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const f = useForm<Values>({
    resolver: zodResolver(form),
    defaultValues: driver
      ? {
          ...driver,
          licenseExpiry: driver.licenseExpiry ? new Date(driver.licenseExpiry).toISOString().slice(0, 10) : "",
          passportNumber: driver.passportNumber ?? "",
          inviteEmail: "",
        }
      : {
          fullName: "",
          phone: "",
          licenseNumber: "",
          licenseCategory: "CE",
          licenseExpiry: "",
          passportNumber: "",
          status: "ACTIVE",
          inviteEmail: "",
        },
  });
  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      const body = {
        ...v,
        licenseExpiry: v.licenseExpiry || null,
        passportNumber: v.passportNumber || null,
        inviteEmail: v.inviteEmail || null,
      };
      if (driver) {
        await api(`/api/drivers/${driver.id}`, { method: "PATCH", body });
        toast.success("Данные водителя обновлены");
        setOpen(false);
      } else {
        const res = await api<{ invite: { link: string } | null }>("/api/drivers", { body });
        toast.success("Водитель добавлен");
        if (res.invite) setInviteLink(res.invite.link);
        else setOpen(false);
        f.reset();
      }
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.fields)
        for (const [k, m] of Object.entries(e.fields)) f.setError(k as keyof Values, { message: m[0] });
      setError(errorMessage(e));
    }
  });
  const e = f.formState.errors;
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setInviteLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{driver ? `Водитель: ${driver.fullName}` : "Добавить водителя"}</DialogTitle>
          </DialogHeader>
          {inviteLink ? (
            <>
              <InviteLinkNotice link={inviteLink} />
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Готово</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
              <div className="sm:col-span-2">
                <FormError message={error} />
              </div>
              <Field id="d-name" label="ФИО" error={e.fullName?.message} required className="sm:col-span-2">
                <Input {...f.register("fullName")} />
              </Field>
              <Field id="d-phone" label="Телефон" error={e.phone?.message} required>
                <Input type="tel" {...f.register("phone")} />
              </Field>
              <Field id="d-status" label="Статус">
                <NativeSelect {...f.register("status")}>
                  <option value="ACTIVE">Активен</option>
                  <option value="INACTIVE">Неактивен</option>
                  <option value="SUSPENDED">Отстранён</option>
                </NativeSelect>
              </Field>
              <Field id="d-lic" label="Водительское удостоверение" error={e.licenseNumber?.message} required>
                <Input {...f.register("licenseNumber")} />
              </Field>
              <Field id="d-cat" label="Категория" error={e.licenseCategory?.message} required>
                <Input {...f.register("licenseCategory")} />
              </Field>
              <Field id="d-exp" label="Удостоверение действует до">
                <Input type="date" {...f.register("licenseExpiry")} />
              </Field>
              <Field id="d-pass" label="Паспорт (необязательно)">
                <Input {...f.register("passportNumber")} />
              </Field>
              {!driver && (
                <Field
                  id="d-invite"
                  label="Email для приглашения в приложение"
                  hint="Водитель получит ссылку и сможет видеть свой рейс"
                  className="sm:col-span-2"
                >
                  <Input type="email" {...f.register("inviteEmail")} />
                </Field>
              )}
              <DialogFooter className="sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" loading={f.formState.isSubmitting} loadingText="Сохраняем...">
                  {driver ? "Сохранить" : "Добавить водителя"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddDriverButton() {
  return (
    <DriverFormDialog
      trigger={
        <Button>
          <Plus /> Добавить водителя
        </Button>
      }
    />
  );
}

export function EditDriverButton({ driver }: { driver: DriverRow }) {
  return (
    <DriverFormDialog
      driver={driver}
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Редактировать ${driver.fullName}`}>
          <Pencil /> <span className="hidden xl:inline">Редактировать</span>
        </Button>
      }
    />
  );
}

export function InviteDriverButton({ driverId, name }: { driverId: string; name: string }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Mail /> Пригласить
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setLink(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Пригласить водителя</DialogTitle>
            <DialogDescription>{name} получит доступ к приложению водителя «Мой рейс».</DialogDescription>
          </DialogHeader>
          {link ? (
            <InviteLinkNotice link={link} />
          ) : (
            <>
              <FormError message={error} />
              <Field id="inv-email" label="Email водителя" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button
                  loading={pending}
                  loadingText="Отправляем..."
                  disabled={!email.includes("@")}
                  onClick={async () => {
                    setPending(true);
                    setError(null);
                    try {
                      const r = await api<{ link: string }>(`/api/drivers/${driverId}/invite`, { body: { email } });
                      setLink(r.link);
                      router.refresh();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Отправить приглашение
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
