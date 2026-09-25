"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { forgotPasswordSchema, passwordSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api("/api/auth/forgot-password", { body: v });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Восстановление пароля</h1>
      {sent ? (
        <div className="border-success-border bg-success-bg text-success mt-6 rounded-xl border p-4 text-sm" role="status">
          <CheckCircle2 className="mb-2 size-5" aria-hidden />
          Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля. Ссылка действует 1 час.
          <p className="text-muted-foreground mt-2 text-xs">В локальной среде письмо выводится в лог сервера (EMAIL_DRIVER=log).</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <p className="text-muted-foreground text-sm">Укажите email, и мы пришлём ссылку для установки нового пароля.</p>
          <FormError message={error} />
          <Field id="email" label="Email" error={form.formState.errors.email?.message} required>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting} loadingText="Отправляем...">
            Отправить ссылку
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Вернуться ко входу
        </Link>
      </p>
    </div>
  );
}

const resetForm = z
  .object({ password: passwordSchema, repeat: z.string() })
  .refine((v) => v.password === v.repeat, { path: ["repeat"], message: "Пароли не совпадают" });

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.input<typeof resetForm>>({ resolver: zodResolver(resetForm), defaultValues: { password: "", repeat: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api("/api/auth/reset-password", { body: { token, password: v.password } });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  if (!token) return <FormError message="Ссылка для сброса пароля недействительна. Запросите новую." />;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Новый пароль</h1>
      {done ? (
        <div className="mt-6 space-y-4">
          <p className="border-success-border bg-success-bg text-success rounded-xl border p-4 text-sm" role="status">
            Пароль изменён. Все активные сессии завершены.
          </p>
          <Button asChild className="w-full">
            <Link href="/login">Войти</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <FormError message={error} />
          <Field
            id="password"
            label="Новый пароль"
            error={form.formState.errors.password?.message}
            hint="Не менее 8 символов, буквы и цифры"
            required
          >
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field id="repeat" label="Повторите пароль" error={form.formState.errors.repeat?.message} required>
            <Input type="password" autoComplete="new-password" {...form.register("repeat")} />
          </Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting} loadingText="Сохраняем...">
            Установить пароль
          </Button>
        </form>
      )}
    </div>
  );
}
