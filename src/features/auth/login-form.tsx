"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { api, errorMessage } from "@/lib/client/api";
import { loginSchema } from "@/lib/validation/auth";
import { DataModeSelector, useRememberedDataMode } from "./data-mode";
import type { z } from "zod";

type Values = z.input<typeof loginSchema>;

const DEMO = [
  { label: "Грузовладелец", email: "shipper@cargoflow.demo" },
  { label: "Перевозчик", email: "carrier@cargoflow.demo" },
  { label: "Экспедитор", email: "forwarder@cargoflow.demo" },
  { label: "Водитель", email: "driver@cargoflow.demo" },
  { label: "Автопарк (топливо)", email: "fleet@cargoflow.demo" },
  { label: "Водитель Ivan", email: "ivan@cargoflow.demo" },
  { label: "Администратор", email: "admin@cargoflow.demo" },
];

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next");
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;
  const [dataMode, setDataMode] = useRememberedDataMode("real");

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/login", { body: { ...values, dataMode } });
      const safeNext = safeRedirectPath(next, window.location.origin);
      window.location.assign(safeNext ?? res.redirectTo);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const isProduction = process.env.NODE_ENV === "production";
  const showDemo = !isProduction || process.env.NEXT_PUBLIC_SHOW_DEMO === "1";
  // В production у администратора нет общеизвестного пароля — кнопку не показываем
  const demoAccounts = isProduction ? DEMO.filter((d) => d.email !== "admin@cargoflow.demo") : DEMO;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Вход в CargoFlow</h1>
      <p className="text-muted-foreground mt-1 text-sm">Цифровая платформа международных грузоперевозок</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <FormError message={error} />
        <DataModeSelector value={dataMode} onChange={setDataMode} />
        <Field id="email" label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field id="password" label="Пароль" error={errors.password?.message} required>
          <Input type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-primary text-sm hover:underline">
            Забыли пароль?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} loadingText="Входим...">
          Войти
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Зарегистрироваться
        </Link>
      </p>
      {showDemo && (
        <div className="border-border bg-card mt-8 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">Демо-доступ {isProduction ? "(демо-стенд: данные публичны)" : "(локальная среда)"}</p>
          <p className="text-muted-foreground mb-3 text-xs">Пароль для всех: Demo1234!</p>
          <div className="flex flex-wrap gap-2">
            {demoAccounts.map((d) => (
              <Button
                key={d.email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setValue("email", d.email);
                  form.setValue("password", "Demo1234!");
                }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
