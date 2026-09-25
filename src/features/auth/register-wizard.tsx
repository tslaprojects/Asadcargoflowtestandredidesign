"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, Package, Truck, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useForm, type FieldPath } from "react-hook-form";
import type { z } from "zod";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { label } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { registerSchema } from "@/lib/validation/auth";

type Values = z.input<typeof registerSchema>;

const ACTIVITIES = [
  { value: "SHIPPER", title: "Грузовладелец", text: "Размещаю грузы и выбираю перевозчиков", icon: Package },
  { value: "CARRIER", title: "Перевозчик", text: "Транспортная компания: автопарк, водители, рейсы", icon: Truck },
  { value: "FORWARDER", title: "Экспедитор", text: "Организую перевозки для своих клиентов", icon: Users },
] as const;

const STEPS = ["Контакты", "Деятельность", "Компания"];

export function RegisterWizard({
  countries,
  invite,
}: {
  countries: { code: string; name: string }[];
  invite: { token: string; email: string; role: string; companyName: string; companyType: string } | null;
}) {
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: invite?.email ?? "",
      password: "",
      activity: (invite?.companyType as Values["activity"]) ?? "SHIPPER",
      companyMode: invite ? "invite" : "create",
      inviteToken: invite?.token ?? "",
      company: { legalName: "", registrationNumber: "", country: "KZ", city: "", address: "" },
    },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;
  const activity = form.watch("activity");
  const companyMode = form.watch("companyMode");

  const next = async () => {
    const fields: FieldPath<Values>[][] = [["firstName", "lastName", "phone", "email", "password"], ["activity"]];
    const ok = await form.trigger(fields[step]);
    if (ok) setStep((s) => s + 1);
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      setError(null);
      try {
        const payload = { ...values, company: values.companyMode === "create" ? values.company : undefined };
        const res = await api<{ redirectTo: string }>("/api/auth/register", { body: payload });
        window.location.assign(res.redirectTo);
      } catch (e) {
        if (e instanceof ApiError && e.fields) {
          for (const [k, msgs] of Object.entries(e.fields)) form.setError(k as FieldPath<Values>, { message: msgs[0] });
          if (e.fields.email || e.fields.password) setStep(0);
        }
        setError(errorMessage(e));
      }
    },
    () => setError("Проверьте правильность заполнения полей."),
  );

  const err = (path: string) => {
    const parts = path.split(".");
    let cur: unknown = errors;
    for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
    return (cur as { message?: string } | undefined)?.message;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Регистрация в CargoFlow</h1>
      <ol className="mt-5 flex items-center gap-2" aria-label="Шаги регистрации">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                i < step ? "bg-success text-white" : i === step ? "bg-primary text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-4" aria-label="выполнено" /> : i + 1}
            </span>
            <span className={cn("text-sm", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="bg-border h-px flex-1" aria-hidden />}
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <FormError message={error} />
        {invite && (
          <div className="border-info-border bg-info-bg text-info rounded-lg border p-3 text-sm">
            Приглашение в компанию <b>{invite.companyName}</b> на роль «{label("MemberRole", invite.role)}».
          </div>
        )}

        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field id="firstName" label="Имя" error={err("firstName")} required>
                <Input autoComplete="given-name" {...form.register("firstName")} />
              </Field>
              <Field id="lastName" label="Фамилия" error={err("lastName")} required>
                <Input autoComplete="family-name" {...form.register("lastName")} />
              </Field>
            </div>
            <Field id="phone" label="Телефон" error={err("phone")} hint="В международном формате, например +7 700 123 45 67" required>
              <Input type="tel" autoComplete="tel" inputMode="tel" {...form.register("phone")} />
            </Field>
            <Field id="email" label="Email" error={err("email")} required>
              <Input type="email" autoComplete="email" readOnly={!!invite} {...form.register("email")} />
            </Field>
            <Field id="password" label="Пароль" error={err("password")} hint="Не менее 8 символов, буквы и цифры" required>
              <Input type="password" autoComplete="new-password" {...form.register("password")} />
            </Field>
            <Button type="button" className="w-full" onClick={next}>
              Продолжить
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">Выберите тип деятельности</legend>
              <div className="space-y-2">
                {ACTIVITIES.map((a) => (
                  <label
                    key={a.value}
                    className={cn(
                      "has-[:focus-visible]:outline-ring flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2",
                      activity === a.value ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted",
                      invite && "pointer-events-none opacity-70",
                    )}
                  >
                    <input type="radio" value={a.value} className="sr-only" {...form.register("activity")} disabled={!!invite} />
                    <a.icon className={cn("mt-0.5 size-5", activity === a.value ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span>
                      <span className="block font-medium">{a.title}</span>
                      <span className="text-muted-foreground block text-sm">{a.text}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                Назад
              </Button>
              <Button type="button" className="flex-1" onClick={next}>
                Продолжить
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {!invite && (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Компания">
                {(["create", "invite"] as const).map((m) => (
                  <label
                    key={m}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      companyMode === m ? "border-primary bg-accent text-primary font-medium" : "border-border",
                    )}
                  >
                    <input type="radio" value={m} className="sr-only" {...form.register("companyMode")} />
                    {m === "create" ? <Building2 className="size-4" aria-hidden /> : <Users className="size-4" aria-hidden />}
                    {m === "create" ? "Создать компанию" : "По приглашению"}
                  </label>
                ))}
              </div>
            )}
            {companyMode === "create" ? (
              <>
                <Field id="company.legalName" label="Юридическое название" error={err("company.legalName")} required>
                  <Input autoComplete="organization" {...form.register("company.legalName")} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="company.registrationNumber"
                    label="Рег. номер (БИН/ОГРН/USCC)"
                    error={err("company.registrationNumber")}
                    required
                  >
                    <Input {...form.register("company.registrationNumber")} />
                  </Field>
                  <Field id="company.taxId" label="ИНН / налоговый номер" error={err("company.taxId")}>
                    <Input {...form.register("company.taxId")} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="company.country" label="Страна" error={err("company.country")} required>
                    <NativeSelect {...form.register("company.country")}>
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field id="company.city" label="Город" error={err("company.city")} required>
                    <Input autoComplete="address-level2" {...form.register("company.city")} />
                  </Field>
                </div>
                <Field id="company.address" label="Адрес" error={err("company.address")} required>
                  <Input autoComplete="street-address" {...form.register("company.address")} />
                </Field>
                <p className="text-muted-foreground text-xs">
                  Вы станете {label("MemberRole", activity === "CARRIER" ? "CARRIER_ADMIN" : activity).toLowerCase()} компании и сможете
                  пригласить сотрудников.
                </p>
              </>
            ) : (
              <Field
                id="inviteToken"
                label="Код приглашения"
                error={err("inviteToken")}
                hint="Код из ссылки-приглашения, которую прислал руководитель компании"
                required
              >
                <Input readOnly={!!invite} {...form.register("inviteToken")} />
              </Field>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(invite ? 0 : 1)}>
                Назад
              </Button>
              <Button type="submit" className="flex-1" loading={isSubmitting} loadingText="Создаём аккаунт...">
                Зарегистрироваться
              </Button>
            </div>
          </>
        )}
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
