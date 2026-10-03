"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { FormError } from "@/components/common/field";
import { FormGroup, FormRow, rowInput } from "@/components/common/form-group";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { api, errorMessage } from "@/lib/client/api";
import { t } from "@/lib/i18n";
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
      <div className="text-center">
        <h1 className="text-large-title">Вход в CargoFlow</h1>
        <p className="text-subheadline text-muted-foreground mt-1">Цифровая платформа международных грузоперевозок</p>
      </div>
      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        <FormError message={error} />
        <DataModeSelector value={dataMode} onChange={setDataMode} />
        <FormGroup>
          <FormRow id="email" label="Email" error={errors.email?.message} required>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="name@company.com"
              className={rowInput}
              {...form.register("email")}
            />
          </FormRow>
          <FormRow id="password" label="Пароль" error={errors.password?.message} required>
            <input
              type="password"
              autoComplete="current-password"
              placeholder={t("ui.required")}
              className={rowInput}
              {...form.register("password")}
            />
          </FormRow>
        </FormGroup>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} loadingText="Входим...">
          Войти
        </Button>
        <p className="text-center">
          <Link href="/forgot-password" className="text-link text-subheadline hover:underline">
            Забыли пароль?
          </Link>
        </p>
      </form>
      <p className="text-subheadline text-muted-foreground mt-8 text-center">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-link font-medium hover:underline">
          Зарегистрироваться
        </Link>
      </p>
      {showDemo && (
        <section className="mt-8">
          <p className="text-section px-4">Демо-доступ · {isProduction ? "демо-стенд, данные публичны" : t("ui.localEnv")}</p>
          <div className="bg-card mt-1.5 rounded-lg p-3">
            <div className="flex flex-wrap gap-1.5">
              {demoAccounts.map((d) => (
                <Button
                  key={d.email}
                  type="button"
                  variant="secondary"
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
          <p className="text-footnote text-muted-foreground mt-1.5 px-4">Пароль для всех: Demo1234!</p>
        </section>
      )}
    </div>
  );
}
