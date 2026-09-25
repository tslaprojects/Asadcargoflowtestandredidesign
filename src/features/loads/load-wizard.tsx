"use client";
import { ArrowDown, Check, MapPin, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Field, FormError } from "@/components/common/field";
import { DefinitionList, MoneyDisplay } from "@/components/common/misc";
import { RouteTimeline } from "@/components/common/route-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorMessage, newIdempotencyKey } from "@/lib/client/api";
import { formatVolume, formatWeight } from "@/lib/format";
import { COUNTRIES, countryFlag, countryName, defaultTimezone } from "@/lib/geo/countries";
import { knownCities } from "@/lib/geo/geocoder";
import { enumOptions, label } from "@/lib/i18n";
import { CURRENCIES } from "@/lib/money";
import { zonedToUtc } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { loadInputSchema, type LoadInput } from "@/lib/validation/load";
import { defaultWizardValues, emptyStop, type WizardValues } from "./wizard-values";

function toPayload(v: WizardValues): LoadInput {
  return {
    ...v,
    stops: v.stops.map((s) => {
      const tz = defaultTimezone(s.country);
      return {
        type: s.type,
        country: s.country,
        city: s.city,
        street: s.street,
        building: s.building,
        fullAddress: s.fullAddress,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
        notes: s.notes,
        timezone: tz,
        plannedDateFrom: s.date ? zonedToUtc(s.date, s.timeFrom || "00:00", tz).toISOString() : null,
        plannedDateTo: s.date && s.timeTo ? zonedToUtc(s.date, s.timeTo, tz).toISOString() : null,
      };
    }),
  } as LoadInput;
}

/** Сопоставление пути ошибки схемы с полем формы. */
function mapPath(path: string): string {
  return path.replace(/^stops\.(\d+)\.plannedDateFrom$/, "stops.$1.date").replace(/^stops\.(\d+)\.plannedDateTo$/, "stops.$1.timeTo");
}

const STEP_FIELDS: ((p: string) => boolean)[] = [
  (p) => p.startsWith("stops"),
  (p) => ["title", "clientName", "cargoType", "cargoDescription", "weightKg", "volumeM3", "packagesCount", "packageType"].includes(p),
  (p) => ["vehicleType", "bodyType", "temperatureFrom", "temperatureTo", "requiresGps", "requirements"].includes(p),
  () => true,
];

const STEPS = ["Маршрут", "Груз", "Транспорт", "Цена и публикация"];

export function LoadWizard({
  mode,
  loadId,
  initial,
  carriers,
  isForwarder,
  loadStatus,
}: {
  mode: "create" | "edit";
  loadId?: string;
  initial?: WizardValues;
  carriers: { id: string; legalName: string; verificationStatus: string; city: string }[];
  isForwarder: boolean;
  loadStatus?: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [preview, setPreview] = React.useState(false);
  const [submitting, setSubmitting] = React.useState<null | "draft" | "publish" | "save">(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [idemKey, setIdemKey] = React.useState(newIdempotencyKey);
  const form = useForm<WizardValues>({ defaultValues: initial ?? defaultWizardValues });
  const { fields, insert, remove } = useFieldArray({ control: form.control, name: "stops" });
  const errors = form.formState.errors;
  const values = form.watch();

  const validate = (upTo: number): boolean => {
    form.clearErrors();
    const parsed = loadInputSchema.safeParse(toPayload(form.getValues()));
    if (parsed.success) return true;
    let firstStep = -1;
    for (const issue of parsed.error.issues) {
      const path = mapPath(issue.path.join("."));
      const s = STEP_FIELDS.findIndex((f) => f(path));
      if (s <= upTo) {
        form.setError(path as FieldPath<WizardValues>, { message: issue.message });
        if (firstStep === -1 || s < firstStep) firstStep = s;
      }
    }
    if (firstStep !== -1) {
      setStep(firstStep);
      setPreview(false);
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validate(step)) return;
    if (step < 3) setStep(step + 1);
    else setPreview(true);
  };

  const submit = async (action: "draft" | "publish" | "save") => {
    if (submitting) return;
    if (!validate(3)) {
      setFormError("Проверьте правильность заполнения полей.");
      return;
    }
    setFormError(null);
    setSubmitting(action);
    const payload = toPayload(form.getValues());
    try {
      let id = loadId;
      if (mode === "create") {
        const res = await api<{ id: string; publicNumber: string }>("/api/loads", {
          body: { load: payload, publish: action === "publish" },
          idempotencyKey: idemKey,
        });
        id = res.id;
        toast.success(action === "publish" ? `Груз ${res.publicNumber} опубликован` : `Черновик ${res.publicNumber} сохранён`);
      } else {
        await api(`/api/loads/${loadId}`, { method: "PATCH", body: payload });
        if (action === "publish") await api(`/api/loads/${loadId}/publish`, { method: "POST", idempotencyKey: idemKey });
        toast.success(action === "publish" ? "Груз опубликован" : "Изменения сохранены");
      }
      router.push(`/loads/${id}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [k, msgs] of Object.entries(e.fields))
          form.setError(mapPath(k.replace(/^load\./, "")) as FieldPath<WizardValues>, { message: msgs[0] });
      }
      setFormError(errorMessage(e));
      setIdemKey(newIdempotencyKey());
      setSubmitting(null);
    }
  };

  const err = (path: string) => {
    let cur: unknown = errors;
    for (const p of path.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[p];
    return (cur as { message?: string } | undefined)?.message;
  };

  const payloadPreview = toPayload(values);

  return (
    <div className="space-y-5">
      {/* Индикатор шагов */}
      <ol className="grid grid-cols-4 gap-2" aria-label="Шаги создания груза">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                if (i < step || (i > step && validate(i - 1))) {
                  setStep(i);
                  setPreview(false);
                }
              }}
              aria-current={i === step ? "step" : undefined}
              className="flex w-full flex-col items-start gap-1.5 text-left"
            >
              <span className={cn("h-1.5 w-full rounded-full", i < step ? "bg-success" : i === step ? "bg-primary" : "bg-muted")} />
              <span className={cn("text-xs sm:text-sm", i === step ? "font-medium" : "text-muted-foreground")}>
                <span className="hidden sm:inline">Шаг {i + 1}. </span>
                {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <FormError message={formError} />

      {!preview && step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Маршрут</CardTitle>
            <p className="text-muted-foreground text-sm">
              Укажите точки загрузки, транзита/границы и доставки. Время — местное для каждой точки.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm" aria-label="Цепочка маршрута">
              {values.stops.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ArrowDown className="text-muted-foreground size-4 -rotate-90" aria-hidden />}
                  <span className="font-medium whitespace-nowrap">
                    {countryFlag(s.country)} {s.city || countryName(s.country)}
                  </span>
                </React.Fragment>
              ))}
            </div>
            {fields.map((f, i) => {
              const isFirst = i === 0;
              const isLast = i === fields.length - 1;
              const country = values.stops[i]?.country;
              return (
                <fieldset key={f.id} className="border-border rounded-xl border p-4" data-testid={`stop-${i}`}>
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                    <MapPin className="text-primary size-4" aria-hidden />
                    Точка {i + 1}: {label("StopType", values.stops[i]?.type)}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {!isFirst && !isLast && (
                      <Field id={`stops.${i}.type`} label="Тип точки">
                        <NativeSelect {...form.register(`stops.${i}.type`)}>
                          <option value="BORDER">Граница</option>
                          <option value="TRANSIT">Транзит</option>
                        </NativeSelect>
                      </Field>
                    )}
                    <Field id={`stops.${i}.country`} label="Страна" error={err(`stops.${i}.country`)} required>
                      <NativeSelect {...form.register(`stops.${i}.country`)}>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field id={`stops.${i}.city`} label="Город" error={err(`stops.${i}.city`)} required>
                      <Input list={`cities-${i}`} autoComplete="off" {...form.register(`stops.${i}.city`)} />
                    </Field>
                    <datalist id={`cities-${i}`}>
                      {knownCities(country ?? "").map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <Field id={`stops.${i}.fullAddress`} label="Адрес" className="sm:col-span-2" hint="Улица, дом, склад/терминал">
                      <Input {...form.register(`stops.${i}.fullAddress`)} />
                    </Field>
                    <Field id={`stops.${i}.date`} label="Дата" error={err(`stops.${i}.date`)} required={isFirst}>
                      <Input type="date" {...form.register(`stops.${i}.date`)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field id={`stops.${i}.timeFrom`} label="С">
                        <Input type="time" {...form.register(`stops.${i}.timeFrom`)} />
                      </Field>
                      <Field id={`stops.${i}.timeTo`} label="До" error={err(`stops.${i}.timeTo`)}>
                        <Input type="time" {...form.register(`stops.${i}.timeTo`)} />
                      </Field>
                    </div>
                    {(isFirst || isLast) && (
                      <>
                        <Field id={`stops.${i}.contactName`} label="Контактное лицо">
                          <Input {...form.register(`stops.${i}.contactName`)} />
                        </Field>
                        <Field id={`stops.${i}.contactPhone`} label="Телефон контакта">
                          <Input type="tel" {...form.register(`stops.${i}.contactPhone`)} />
                        </Field>
                      </>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                    <span>Часовой пояс точки: {defaultTimezone(country)}</span>
                    {!isFirst && !isLast && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Удалить точку ${i + 1}`}>
                        <Trash2 /> Удалить
                      </Button>
                    )}
                  </div>
                </fieldset>
              );
            })}
            {err("stops") && <p className="text-destructive text-sm">{err("stops")}</p>}
            <Button
              type="button"
              variant="outline"
              onClick={() => insert(fields.length - 1, emptyStop("BORDER", "KZ"))}
              disabled={fields.length >= 12}
            >
              <Plus /> Добавить точку
            </Button>
          </CardContent>
        </Card>
      )}

      {!preview && step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Груз</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="title" label="Название груза" error={err("title")} required className="sm:col-span-2">
              <Input placeholder="Например: Электроника, мониторы" {...form.register("title")} />
            </Field>
            {isForwarder && (
              <Field
                id="clientName"
                label="Клиент (от чьего имени груз)"
                hint="Для экспедитора — заказчик перевозки"
                className="sm:col-span-2"
              >
                <Input {...form.register("clientName")} />
              </Field>
            )}
            <Field id="cargoType" label="Тип груза" error={err("cargoType")} required>
              <NativeSelect {...form.register("cargoType")}>
                {enumOptions("CargoType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="packageType" label="Тип упаковки">
              <Input placeholder="Паллеты, коробки, биг-бэги…" {...form.register("packageType")} />
            </Field>
            <Field id="weightKg" label="Вес, кг" error={err("weightKg")} required>
              <Input type="number" inputMode="decimal" min={0} step="any" {...form.register("weightKg")} />
            </Field>
            <Field id="volumeM3" label="Объём, м³" error={err("volumeM3")}>
              <Input type="number" inputMode="decimal" min={0} step="any" {...form.register("volumeM3")} />
            </Field>
            <Field id="packagesCount" label="Количество мест" error={err("packagesCount")}>
              <Input type="number" inputMode="numeric" min={1} step={1} {...form.register("packagesCount")} />
            </Field>
            <Field id="cargoDescription" label="Описание" className="sm:col-span-2" hint="Особенности груза, условия обращения">
              <Textarea rows={3} {...form.register("cargoDescription")} />
            </Field>
            <p className="text-muted-foreground text-xs sm:col-span-2">
              Опасные грузы (ADR) в MVP не поддерживаются отдельно — укажите особенности в описании.
            </p>
          </CardContent>
        </Card>
      )}

      {!preview && step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Транспорт</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="vehicleType" label="Тип транспорта">
              <NativeSelect {...form.register("vehicleType")}>
                <option value="">Любой</option>
                {enumOptions("VehicleType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="bodyType" label="Тип кузова">
              <NativeSelect {...form.register("bodyType")}>
                <option value="">Любой</option>
                {enumOptions("BodyType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="temperatureFrom" label="Температура от, °C" error={err("temperatureFrom")} hint="Для рефрижератора">
              <Input type="number" inputMode="decimal" step="any" {...form.register("temperatureFrom")} />
            </Field>
            <Field id="temperatureTo" label="Температура до, °C" error={err("temperatureTo")}>
              <Input type="number" inputMode="decimal" step="any" {...form.register("temperatureTo")} />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="requiresGps" checked={values.requiresGps} onCheckedChange={(c) => form.setValue("requiresGps", c === true)} />
              <Label htmlFor="requiresGps">Нужен GPS на автомобиле</Label>
            </div>
            <Field id="requirements" label="Требования" className="sm:col-span-2" hint="Ремни, коники, санобработка, документы водителя…">
              <Textarea rows={3} {...form.register("requirements")} />
            </Field>
          </CardContent>
        </Card>
      )}

      {!preview && step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Цена и публикация</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field id="priceType" label="Тип цены" required>
              <NativeSelect {...form.register("priceType")}>
                {enumOptions("PriceType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="targetPrice"
              label="Стоимость"
              error={err("targetPrice")}
              required={values.priceType === "FIXED"}
              hint={values.priceType === "REQUEST_QUOTE" ? "Перевозчики предложат цену сами" : undefined}
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                disabled={values.priceType === "REQUEST_QUOTE"}
                {...form.register("targetPrice")}
              />
            </Field>
            <Field id="currency" label="Валюта" required>
              <NativeSelect {...form.register("currency")}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {label("Currency", c)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="additionalTerms"
              label="Дополнительные условия"
              className="sm:col-span-3"
              hint="Попадут в договор: порядок оплаты, простой, страхование…"
            >
              <Textarea rows={3} {...form.register("additionalTerms")} />
            </Field>
            <fieldset className="sm:col-span-3">
              <legend className="mb-2 text-sm font-medium">Кто увидит груз</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["MARKETPLACE", "INVITE_ONLY"] as const).map((v) => (
                  <label
                    key={v}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm",
                      values.visibility === v ? "border-primary bg-accent" : "border-border",
                    )}
                  >
                    <input type="radio" value={v} className="mt-0.5 accent-[var(--primary)]" {...form.register("visibility")} />
                    <span>
                      <span className="block font-medium">{label("LoadVisibility", v)}</span>
                      <span className="text-muted-foreground">
                        {v === "MARKETPLACE" ? "Груз увидят все перевозчики на бирже" : "Только выбранные перевозчики"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {values.visibility === "INVITE_ONLY" && (
                <div className="border-border mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {carriers.length === 0 && <p className="text-muted-foreground p-2 text-sm">Нет доступных перевозчиков</p>}
                  {carriers.map((c) => {
                    const checked = values.invitedCarrierIds.includes(c.id);
                    return (
                      <label key={c.id} className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            form.setValue(
                              "invitedCarrierIds",
                              v ? [...values.invitedCarrierIds, c.id] : values.invitedCarrierIds.filter((x) => x !== c.id),
                            )
                          }
                        />
                        <span className="flex-1">{c.legalName}</span>
                        <span className="text-muted-foreground text-xs">
                          {c.city} · {label("VerificationStatus", c.verificationStatus)}
                        </span>
                      </label>
                    );
                  })}
                  {err("invitedCarrierIds") && <p className="text-destructive p-2 text-sm">{err("invitedCarrierIds")}</p>}
                </div>
              )}
            </fieldset>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card data-testid="load-preview">
          <CardHeader>
            <CardTitle>Предпросмотр груза</CardTitle>
            <p className="text-muted-foreground text-sm">Проверьте данные перед публикацией.</p>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Маршрут</h3>
              <RouteTimeline
                stops={payloadPreview.stops.map((s) => ({
                  type: s.type,
                  country: s.country,
                  city: s.city,
                  fullAddress: (s.fullAddress as string) || null,
                  plannedDateFrom: (s.plannedDateFrom as string) || null,
                  plannedDateTo: (s.plannedDateTo as string) || null,
                  timezone: (s.timezone as string) || null,
                  contactName: (s.contactName as string) || null,
                  contactPhone: (s.contactPhone as string) || null,
                }))}
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{values.title}</h3>
              <DefinitionList
                items={[
                  { label: "Тип груза", value: label("CargoType", values.cargoType) },
                  { label: "Вес", value: formatWeight(Number(values.weightKg)) },
                  { label: "Объём", value: values.volumeM3 ? formatVolume(Number(values.volumeM3)) : "—" },
                  { label: "Мест", value: values.packagesCount ? `${values.packagesCount} ${values.packageType}` : "—" },
                  {
                    label: "Транспорт",
                    value:
                      [
                        values.vehicleType && label("VehicleType", values.vehicleType),
                        values.bodyType && label("BodyType", values.bodyType),
                      ]
                        .filter(Boolean)
                        .join(", ") || "Любой",
                  },
                  { label: "GPS", value: values.requiresGps ? "Обязателен" : "Не требуется" },
                  {
                    label: "Цена",
                    value:
                      values.priceType === "REQUEST_QUOTE" || !values.targetPrice ? (
                        "Запрос цены"
                      ) : (
                        <>
                          <MoneyDisplay amount={Number(values.targetPrice)} currency={values.currency} /> ·{" "}
                          {label("PriceType", values.priceType)}
                        </>
                      ),
                  },
                  { label: "Видимость", value: label("LoadVisibility", values.visibility) },
                ]}
              />
              {values.additionalTerms && <p className="text-muted-foreground text-sm">Условия: {values.additionalTerms}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border-border bg-card/95 sticky bottom-16 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 shadow-sm backdrop-blur lg:bottom-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => (preview ? setPreview(false) : setStep(Math.max(0, step - 1)))}
          disabled={(!preview && step === 0) || submitting !== null}
        >
          {preview ? "Вернуться" : "Назад"}
        </Button>
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <>
              {(mode === "create" || loadStatus === "DRAFT") && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submit("draft")}
                  loading={submitting === "draft"}
                  loadingText="Сохраняем..."
                  disabled={submitting !== null}
                >
                  Сохранить черновик
                </Button>
              )}
              {mode === "edit" && loadStatus !== "DRAFT" ? (
                <Button
                  type="button"
                  onClick={() => submit("save")}
                  loading={submitting === "save"}
                  loadingText="Сохраняем..."
                  disabled={submitting !== null}
                >
                  <Check /> Сохранить изменения
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => submit("publish")}
                  loading={submitting === "publish"}
                  loadingText="Публикуем..."
                  disabled={submitting !== null}
                >
                  <Check /> Опубликовать груз
                </Button>
              )}
            </>
          ) : (
            <Button type="button" onClick={goNext}>
              {step === 3 ? "Предпросмотр" : "Продолжить"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
