"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { api, ApiError, errorMessage, newIdempotencyKey } from "@/lib/client/api";
import { COUNTRIES } from "@/lib/geo/countries";
import { companyCreateSchema } from "@/lib/validation/auth";
import { companyUpdateSchema } from "@/lib/validation/company";

type UpdateValues = z.input<typeof companyUpdateSchema>;

export function CompanyEditForm({
  companyId,
  initial,
  readOnly,
}: {
  companyId: string;
  initial: Record<string, string | null>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const f = useForm<UpdateValues>({
    resolver: zodResolver(companyUpdateSchema),
    defaultValues: Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ""])) as UpdateValues,
  });
  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      await api(`/api/companies/${companyId}`, { method: "PATCH", body: v });
      toast.success("Данные компании сохранены");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.fields)
        for (const [k, m] of Object.entries(e.fields)) f.setError(k as keyof UpdateValues, { message: m[0] });
      setError(errorMessage(e));
    }
  });
  const e = f.formState.errors;
  const field = (name: keyof UpdateValues, lbl: string, opts: { required?: boolean; type?: string; span?: boolean } = {}) => (
    <Field
      id={`c-${name}`}
      label={lbl}
      error={e[name]?.message as string | undefined}
      required={opts.required}
      className={opts.span ? "sm:col-span-2" : undefined}
    >
      <Input type={opts.type ?? "text"} disabled={readOnly} {...f.register(name)} />
    </Field>
  );
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      {field("legalName", "Юридическое название", { required: true, span: true })}
      {field("tradeName", "Торговое название")}
      {field("taxId", "ИНН / налоговый номер")}
      {field("region", "Регион")}
      {field("city", "Город", { required: true })}
      {field("address", "Адрес", { required: true, span: true })}
      {field("postalCode", "Индекс")}
      {field("phone", "Телефон", { type: "tel" })}
      {field("email", "Email", { type: "email" })}
      {field("website", "Сайт")}
      <Field id="c-description" label="О компании" className="sm:col-span-2">
        <Textarea rows={3} disabled={readOnly} {...f.register("description")} />
      </Field>
      {!readOnly && (
        <div className="sm:col-span-2">
          <Button type="submit" loading={f.formState.isSubmitting} loadingText="Сохраняем...">
            Сохранить
          </Button>
        </div>
      )}
    </form>
  );
}

type CreateValues = z.input<typeof companyCreateSchema>;

export function CompanyCreateForm() {
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState(newIdempotencyKey);
  const f = useForm<CreateValues>({
    resolver: zodResolver(companyCreateSchema),
    defaultValues: { type: "SHIPPER", legalName: "", registrationNumber: "", country: "KZ", city: "", address: "" },
  });
  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      await api("/api/companies", { body: v, idempotencyKey: key });
      toast.success("Компания создана");
      window.location.assign("/dashboard");
    } catch (e) {
      setKey(newIdempotencyKey());
      if (e instanceof ApiError && e.fields)
        for (const [k, m] of Object.entries(e.fields)) f.setError(k as keyof CreateValues, { message: m[0] });
      setError(errorMessage(e));
    }
  });
  const e = f.formState.errors;
  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      <Field id="n-type" label="Тип деятельности" required className="sm:col-span-2">
        <NativeSelect {...f.register("type")}>
          <option value="SHIPPER">Грузовладелец</option>
          <option value="CARRIER">Перевозчик</option>
          <option value="FORWARDER">Экспедитор</option>
        </NativeSelect>
      </Field>
      <Field id="n-legal" label="Юридическое название" error={e.legalName?.message} required className="sm:col-span-2">
        <Input {...f.register("legalName")} />
      </Field>
      <Field id="n-reg" label="Регистрационный номер" error={e.registrationNumber?.message} required>
        <Input {...f.register("registrationNumber")} />
      </Field>
      <Field id="n-tax" label="ИНН / налоговый номер">
        <Input {...f.register("taxId")} />
      </Field>
      <Field id="n-country" label="Страна" required>
        <NativeSelect {...f.register("country")}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="n-city" label="Город" error={e.city?.message} required>
        <Input {...f.register("city")} />
      </Field>
      <Field id="n-address" label="Адрес" error={e.address?.message} required className="sm:col-span-2">
        <Input {...f.register("address")} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={f.formState.isSubmitting} loadingText="Создаём...">
          Создать компанию
        </Button>
      </div>
    </form>
  );
}
