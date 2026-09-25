"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { passwordSchema, profileUpdateSchema } from "@/lib/validation/auth";

export function ProfileForm({ initial }: { initial: { firstName: string; lastName: string; phone: string } }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const f = useForm<z.input<typeof profileUpdateSchema>>({ resolver: zodResolver(profileUpdateSchema), defaultValues: initial });
  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      await api("/api/auth/profile", { method: "PATCH", body: v });
      toast.success("Профиль сохранён");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const e = f.formState.errors;
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      <Field id="pf-first" label="Имя" error={e.firstName?.message} required>
        <Input {...f.register("firstName")} />
      </Field>
      <Field id="pf-last" label="Фамилия" error={e.lastName?.message} required>
        <Input {...f.register("lastName")} />
      </Field>
      <Field id="pf-phone" label="Телефон" error={e.phone?.message} required>
        <Input type="tel" {...f.register("phone")} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={f.formState.isSubmitting} loadingText="Сохраняем...">
          Сохранить
        </Button>
      </div>
    </form>
  );
}

const pwForm = z
  .object({ currentPassword: z.string().min(1, "Введите текущий пароль"), newPassword: passwordSchema, repeat: z.string() })
  .refine((v) => v.newPassword === v.repeat, { path: ["repeat"], message: "Пароли не совпадают" });

export function ChangePasswordForm() {
  const [error, setError] = React.useState<string | null>(null);
  const f = useForm<z.input<typeof pwForm>>({
    resolver: zodResolver(pwForm),
    defaultValues: { currentPassword: "", newPassword: "", repeat: "" },
  });
  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      await api("/api/auth/password", { body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
      toast.success("Пароль изменён");
      f.reset();
    } catch (e) {
      if (e instanceof ApiError && e.fields?.currentPassword) f.setError("currentPassword", { message: e.fields.currentPassword[0] });
      setError(errorMessage(e));
    }
  });
  const e = f.formState.errors;
  return (
    <form onSubmit={submit} className="grid max-w-md gap-3" noValidate>
      <FormError message={error} />
      <Field id="pw-cur" label="Текущий пароль" error={e.currentPassword?.message} required>
        <Input type="password" autoComplete="current-password" {...f.register("currentPassword")} />
      </Field>
      <Field id="pw-new" label="Новый пароль" error={e.newPassword?.message} hint="Не менее 8 символов, буквы и цифры" required>
        <Input type="password" autoComplete="new-password" {...f.register("newPassword")} />
      </Field>
      <Field id="pw-rep" label="Повторите новый пароль" error={e.repeat?.message} required>
        <Input type="password" autoComplete="new-password" {...f.register("repeat")} />
      </Field>
      <div>
        <Button type="submit" loading={f.formState.isSubmitting} loadingText="Сохраняем...">
          Изменить пароль
        </Button>
      </div>
    </form>
  );
}
