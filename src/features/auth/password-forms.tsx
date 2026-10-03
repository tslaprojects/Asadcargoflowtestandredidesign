"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormError } from "@/components/common/field";
import { FormGroup, FormRow, rowInput } from "@/components/common/form-group";
import { Button } from "@/components/ui/button";
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
      <div className="text-center">
        <h1 className="text-large-title">Восстановление пароля</h1>
        {!sent && (
          <p className="text-subheadline text-muted-foreground mt-1">Укажите email, и мы пришлём ссылку для установки нового пароля.</p>
        )}
      </div>
      {sent ? (
        <div className="bg-card mt-7 flex flex-col items-center rounded-lg px-5 py-6 text-center" role="status">
          <CheckCircle2 className="text-success mb-2 size-9 [stroke-width:1.5]" aria-hidden />
          <p>Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля. Ссылка действует 1 час.</p>
          <p className="text-footnote text-muted-foreground mt-2">В локальной среде письмо выводится в лог сервера (EMAIL_DRIVER=log).</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
          <FormError message={error} />
          <FormGroup>
            <FormRow id="email" label="Email" error={form.formState.errors.email?.message} required>
              <input type="email" autoComplete="email" placeholder="name@company.com" className={rowInput} {...form.register("email")} />
            </FormRow>
          </FormGroup>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting} loadingText="Отправляем...">
            Отправить ссылку
          </Button>
        </form>
      )}
      <p className="text-subheadline mt-7 text-center">
        <Link href="/login" className="text-link hover:underline">
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
      <h1 className="text-large-title text-center">Новый пароль</h1>
      {done ? (
        <div className="mt-7 space-y-5">
          <div className="bg-card flex flex-col items-center rounded-lg px-5 py-6 text-center" role="status">
            <CheckCircle2 className="text-success mb-2 size-9 [stroke-width:1.5]" aria-hidden />
            Пароль изменён. Все активные сессии завершены.
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Войти</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
          <FormError message={error} />
          <FormGroup footer="Не менее 8 символов, буквы и цифры">
            <FormRow id="password" label="Новый пароль" error={form.formState.errors.password?.message} required>
              <input type="password" autoComplete="new-password" className={rowInput} {...form.register("password")} />
            </FormRow>
            <FormRow id="repeat" label="Повторите пароль" error={form.formState.errors.repeat?.message} required>
              <input type="password" autoComplete="new-password" className={rowInput} {...form.register("repeat")} />
            </FormRow>
          </FormGroup>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting} loadingText="Сохраняем...">
            Установить пароль
          </Button>
        </form>
      )}
    </div>
  );
}
