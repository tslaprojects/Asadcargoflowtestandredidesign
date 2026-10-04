"use client";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { enumOptions } from "@/lib/i18n";

export function UserBlockButton({ userId, status }: { userId: string; status: string }) {
  const { run } = useAction();
  const block = status === "ACTIVE";
  return (
    <ConfirmDialog
      title={block ? "Заблокировать пользователя?" : "Разблокировать пользователя?"}
      description={block ? "Все активные сессии будут завершены, вход станет невозможен." : "Пользователь снова сможет войти."}
      destructive={block}
      withReason={block}
      reasonLabel="Причина блокировки"
      confirmLabel={block ? "Заблокировать" : "Разблокировать"}
      onConfirm={async (reason) =>
        (await run(() => api(`/api/admin/users/${userId}`, { method: "PATCH", body: { action: block ? "BLOCK" : "UNBLOCK", reason } }), {
          success: block ? "Пользователь заблокирован" : "Пользователь разблокирован",
        })) !== undefined
      }
      trigger={
        <Button variant={block ? "outline" : "default"} size="sm" className={block ? "text-danger" : ""}>
          {block ? "Заблокировать" : "Разблокировать"}
        </Button>
      }
    />
  );
}

const DECISIONS = {
  APPROVE: { label: "Подтвердить проверку", success: "Компания проверена", destructive: false, reason: false },
  REJECT: { label: "Отклонить", success: "Проверка отклонена", destructive: true, reason: true },
  REQUEST_CHANGES: { label: "Запросить исправления", success: "Исправления запрошены", destructive: false, reason: true },
  SUSPEND: { label: "Приостановить", success: "Компания приостановлена", destructive: true, reason: true },
  RESTORE: { label: "Восстановить", success: "Компания восстановлена", destructive: false, reason: false },
} as const;

export function CompanyDecisionButtons({ companyId, status }: { companyId: string; status: string }) {
  const { run } = useAction();
  const available: (keyof typeof DECISIONS)[] =
    status === "SUSPENDED" ? ["RESTORE"] : status === "VERIFIED" ? ["SUSPEND"] : ["APPROVE", "REQUEST_CHANGES", "REJECT", "SUSPEND"];
  return (
    <div className="flex flex-wrap gap-2">
      {available.map((d) => {
        const cfg = DECISIONS[d];
        return (
          <ConfirmDialog
            key={d}
            title={`${cfg.label}?`}
            description="Компания получит уведомление. Решение записывается в историю проверки и журнал аудита."
            destructive={cfg.destructive}
            withReason
            reasonRequired={cfg.reason}
            reasonLabel="Комментарий для компании"
            confirmLabel={cfg.label}
            onConfirm={async (comment) =>
              (await run(
                (key) =>
                  api(`/api/admin/companies/${companyId}/decision`, {
                    body: { decision: d, comment: comment || null },
                    idempotencyKey: key,
                  }),
                { success: cfg.success },
              )) !== undefined
            }
            trigger={
              <Button
                size="sm"
                variant={d === "APPROVE" || d === "RESTORE" ? "success" : cfg.destructive ? "outline" : "outline"}
                className={cfg.destructive ? "text-danger" : ""}
              >
                {cfg.label}
              </Button>
            }
          />
        );
      })}
    </div>
  );
}

type Settings = {
  commissionPercent: number;
  commissionFixed: Partial<Record<"USD" | "CNY" | "KZT" | "RUB", number>>;
  secureDealEnabled: boolean;
  requireSecureDeal: boolean;
  confirmationWindowHours: number;
  autoConfirmOnTimeout: boolean;
  requirePodForClose: boolean;
  restrictedCargoTypes: string[];
  requireVerifiedToPublish: boolean;
  requireVerifiedToBid: boolean;
  supportEmail: string;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = React.useState(initial);
  const { run, pending } = useAction();
  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api("/api/admin/settings", { method: "PUT", body: s }), { success: "Настройки сохранены" });
      }}
    >
      <fieldset className="bg-fill-quaternary space-y-4 rounded-lg p-4">
        <legend className="text-body px-1 font-semibold">Безопасная сделка</legend>
        <div className="flex items-start gap-2">
          <Checkbox id="s-sd" checked={s.secureDealEnabled} onCheckedChange={(c) => setS({ ...s, secureDealEnabled: c === true })} />
          <Label htmlFor="s-sd" className="leading-snug font-normal">
            Заказчики могут оформлять безопасную сделку (оплата обеспечивается у платёжного провайдера)
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="s-sd-req" checked={s.requireSecureDeal} onCheckedChange={(c) => setS({ ...s, requireSecureDeal: c === true })} />
          <Label htmlFor="s-sd-req" className="leading-snug font-normal">
            Начало загрузки только после обеспечения оплаты
          </Label>
        </div>
        <Field
          id="s-window"
          label="Срок проверки после доставки, часов"
          hint="За это время заказчик подтверждает получение или открывает спор"
        >
          <Input
            type="number"
            min={1}
            max={720}
            value={s.confirmationWindowHours}
            onChange={(e) => setS({ ...s, confirmationWindowHours: Number(e.target.value) })}
          />
        </Field>
        <div className="flex items-start gap-2">
          <Checkbox
            id="s-auto"
            checked={s.autoConfirmOnTimeout}
            onCheckedChange={(c) => setS({ ...s, autoConfirmOnTimeout: c === true })}
          />
          <Label htmlFor="s-auto" className="leading-snug font-normal">
            По истечении срока без спора — подтвердить получение и выплатить перевозчику автоматически
          </Label>
        </div>
        <Field
          id="s-commission"
          label="Комиссия платформы, %"
          hint="Удерживается из выплаты перевозчику. Фиксируется в сделке при её оформлении."
        >
          <Input
            type="number"
            min={0}
            max={50}
            step="0.1"
            value={s.commissionPercent}
            onChange={(e) => setS({ ...s, commissionPercent: Number(e.target.value) })}
          />
        </Field>
        <div>
          <p className="text-body mb-2 font-medium">Фиксированная часть комиссии (в валюте сделки)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["USD", "CNY", "KZT", "RUB"] as const).map((c) => (
              <Field key={c} id={`s-fix-${c}`} label={c}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={s.commissionFixed?.[c] ?? 0}
                  onChange={(e) => setS({ ...s, commissionFixed: { ...s.commissionFixed, [c]: Number(e.target.value) } })}
                />
              </Field>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="flex items-start gap-2">
        <Checkbox id="s-pod" checked={s.requirePodForClose} onCheckedChange={(c) => setS({ ...s, requirePodForClose: c === true })} />
        <Label htmlFor="s-pod" className="leading-snug font-normal">
          Требовать подтверждение доставки (POD или CMR) для закрытия перевозки
        </Label>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="s-ver"
          checked={s.requireVerifiedToPublish}
          onCheckedChange={(c) => setS({ ...s, requireVerifiedToPublish: c === true })}
        />
        <Label htmlFor="s-ver" className="leading-snug font-normal">
          Публиковать грузы могут только проверенные компании
        </Label>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="s-ver-bid"
          checked={s.requireVerifiedToBid}
          onCheckedChange={(c) => setS({ ...s, requireVerifiedToBid: c === true })}
        />
        <Label htmlFor="s-ver-bid" className="leading-snug font-normal">
          Предлагать цену могут только проверенные перевозчики
        </Label>
      </div>
      <fieldset>
        <legend className="text-body mb-2 font-medium">Ограничить публикацию грузов типов</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {enumOptions("CargoType").map((o) => (
            <label key={o.value} className="text-body flex items-center gap-2">
              <Checkbox
                checked={s.restrictedCargoTypes.includes(o.value)}
                onCheckedChange={(c) =>
                  setS({
                    ...s,
                    restrictedCargoTypes: c ? [...s.restrictedCargoTypes, o.value] : s.restrictedCargoTypes.filter((x) => x !== o.value),
                  })
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="s-support" label="Email поддержки">
        <Input type="email" value={s.supportEmail} onChange={(e) => setS({ ...s, supportEmail: e.target.value })} />
      </Field>
      <Button type="submit" loading={pending} loadingText="Сохраняем...">
        Сохранить настройки
      </Button>
    </form>
  );
}
