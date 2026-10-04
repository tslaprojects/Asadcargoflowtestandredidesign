"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Package, Truck, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import type { z } from "zod";
import { FormError } from "@/components/common/field";
import { FormGroup, FormRow, rowInput, rowSelect } from "@/components/common/form-group";
import { Button } from "@/components/ui/button";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { label, t } from "@/lib/i18n";
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
  const activity = useWatch({ control: form.control, name: "activity" });
  const companyMode = useWatch({ control: form.control, name: "companyMode" });

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
      <div className="text-center">
        <h1 className="text-large-title">Регистрация в CargoFlow</h1>
        <p className="text-subheadline text-muted-foreground mt-1">
          Шаг {step + 1} из {STEPS.length} · {STEPS[step]}
        </p>
      </div>
      <ol className="mt-4 flex justify-center gap-1.5" aria-label="Шаги регистрации">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "block h-1.5 rounded-full transition-[width,background-color] duration-(--duration-complex)",
                i === step ? "bg-primary w-6" : i < step ? "bg-primary/45 w-1.5" : "bg-fill w-1.5",
              )}
              aria-hidden
            />
            <span className="sr-only">
              {s}
              {i < step ? ` — ${t("ui.stepDone")}` : ""}
            </span>
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
        <FormError message={error} />
        {invite && (
          <p className="bg-info-bg text-info text-subheadline rounded-md px-3 py-2.5">
            Приглашение в компанию <b>{invite.companyName}</b> на роль «{label("MemberRole", invite.role)}».
          </p>
        )}

        {step === 0 && (
          <>
            <FormGroup footer={t("ui.phoneAndPasswordHint")}>
              <FormRow id="firstName" label="Имя" error={err("firstName")} required>
                <input autoComplete="given-name" className={rowInput} {...form.register("firstName")} />
              </FormRow>
              <FormRow id="lastName" label="Фамилия" error={err("lastName")} required>
                <input autoComplete="family-name" className={rowInput} {...form.register("lastName")} />
              </FormRow>
              <FormRow id="phone" label="Телефон" error={err("phone")} required>
                <input type="tel" autoComplete="tel" inputMode="tel" placeholder="+7" className={rowInput} {...form.register("phone")} />
              </FormRow>
              <FormRow id="email" label="Email" error={err("email")} required>
                <input
                  type="email"
                  autoComplete="email"
                  readOnly={!!invite}
                  placeholder="name@company.com"
                  className={rowInput}
                  {...form.register("email")}
                />
              </FormRow>
              <FormRow id="password" label="Пароль" error={err("password")} required>
                <input type="password" autoComplete="new-password" className={rowInput} {...form.register("password")} />
              </FormRow>
            </FormGroup>
            <Button type="button" size="lg" className="w-full" onClick={next}>
              Продолжить
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset>
              <legend className="text-section mb-1.5 px-4">Выберите тип деятельности</legend>
              <div className="bg-card [&>label+label>[data-row-content]]:hairline-t overflow-hidden rounded-lg">
                {ACTIVITIES.map((a) => (
                  <label
                    key={a.value}
                    className={cn(
                      "has-[:focus-visible]:bg-accent/60 hover:bg-fill-quaternary flex cursor-pointer items-stretch gap-3 pl-4 transition-colors duration-(--duration-micro)",
                      invite && "pointer-events-none opacity-60",
                    )}
                  >
                    <input type="radio" value={a.value} className="sr-only" {...form.register("activity")} disabled={!!invite} />
                    <a.icon className="text-link mt-3.5 size-5 shrink-0" aria-hidden />
                    <span data-row-content className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{a.title}</span>
                        <span className="text-subheadline text-muted-foreground block">{a.text}</span>
                      </span>
                      <Check
                        className={cn("text-link size-5 shrink-0 [stroke-width:2.5]", activity !== a.value && "invisible")}
                        aria-hidden
                      />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep(0)}>
                Назад
              </Button>
              <Button type="button" size="lg" className="flex-1" onClick={next}>
                Продолжить
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {!invite && (
              <div className="bg-fill-tertiary grid grid-cols-2 gap-0.5 rounded-md p-0.5" role="radiogroup" aria-label="Компания">
                {(["create", "invite"] as const).map((m) => (
                  <label
                    key={m}
                    className={cn(
                      "has-[:focus-visible]:outline-ring text-body flex h-11 cursor-pointer items-center justify-center rounded-[0.4375rem] font-medium transition-[background-color,box-shadow] duration-(--duration-standard) has-[:focus-visible]:outline-3 lg:h-8",
                      companyMode === m ? "bg-segment-thumb shadow-control" : "text-foreground/75",
                    )}
                  >
                    <input type="radio" value={m} className="sr-only" {...form.register("companyMode")} />
                    {m === "create" ? "Создать компанию" : "По приглашению"}
                  </label>
                ))}
              </div>
            )}
            {companyMode === "create" ? (
              <FormGroup
                header="Компания"
                footer={`Вы станете ${label("MemberRole", activity === "CARRIER" ? "CARRIER_ADMIN" : activity).toLowerCase()} компании и сможете пригласить сотрудников.`}
              >
                <FormRow id="company.legalName" label="Юридическое название" error={err("company.legalName")} required>
                  <input autoComplete="organization" className={rowInput} {...form.register("company.legalName")} />
                </FormRow>
                <FormRow
                  id="company.registrationNumber"
                  label="Рег. номер (БИН/ОГРН/USCC)"
                  error={err("company.registrationNumber")}
                  required
                >
                  <input className={rowInput} {...form.register("company.registrationNumber")} />
                </FormRow>
                <FormRow id="company.taxId" label="ИНН / налоговый номер" error={err("company.taxId")}>
                  <input className={rowInput} placeholder={t("ui.optional")} {...form.register("company.taxId")} />
                </FormRow>
                <FormRow id="company.country" label="Страна" error={err("company.country")} required>
                  <select className={rowSelect} {...form.register("company.country")}>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow id="company.city" label="Город" error={err("company.city")} required>
                  <input autoComplete="address-level2" className={rowInput} {...form.register("company.city")} />
                </FormRow>
                <FormRow id="company.address" label="Адрес" error={err("company.address")} required>
                  <input autoComplete="street-address" className={rowInput} {...form.register("company.address")} />
                </FormRow>
              </FormGroup>
            ) : (
              <FormGroup footer="Код из ссылки-приглашения, которую прислал руководитель компании">
                <FormRow id="inviteToken" label="Код приглашения" error={err("inviteToken")} required>
                  <input readOnly={!!invite} className={rowInput} {...form.register("inviteToken")} />
                </FormRow>
              </FormGroup>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep(invite ? 0 : 1)}>
                Назад
              </Button>
              <Button type="submit" size="lg" className="flex-1" loading={isSubmitting} loadingText="Создаём аккаунт...">
                Зарегистрироваться
              </Button>
            </div>
          </>
        )}
      </form>
      <p className="text-subheadline text-muted-foreground mt-8 text-center">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-link font-medium hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
