"use client";
import { CheckCircle2, Circle, FlaskConical, Landmark, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { MoneyDisplay } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDateTime, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_HINTS, type SecureDealStatus } from "@/lib/state-machine/payment-state-machine";
import { cn } from "@/lib/utils";

type D = Date | string;

export type SecureDealPanelView = {
  payment: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    platformFee: number;
    feePercent: number | null;
    releasedAmount: number;
    refundedAmount: number;
    feeCollected: number;
    provider: string | null;
    providerTransactionId: string | null;
    reservedAt: D | null;
    releasedAt: D | null;
    failureReason: string | null;
    createdAt: D;
  } | null;
  held?: number;
  payout?: number;
  transactions?: {
    id: string;
    kind: string;
    status: string;
    amount: number;
    fee: number;
    currency: string;
    provider: string;
    providerTransactionId: string | null;
    reason: string | null;
    failureReason: string | null;
    createdAt: D;
    completedAt: D | null;
  }[];
  history?: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    actorUserId: string | null;
    reason: string | null;
    createdAt: D;
  }[];
  userNames?: Record<string, string>;
  conditions?: { key: string; label: string; met: boolean; hint?: string }[];
  ready?: boolean;
  canCancel?: boolean;
  hasPendingOperation?: boolean;
  order: {
    status: string;
    deliveredAt: D | null;
    receiptConfirmedAt: D | null;
    receiptAutoConfirmed: boolean;
    confirmationDueAt: D | null;
    amount: number;
    currency: string;
  };
  provider: { code: string; title: string; testMode: boolean; manualConfirmation: boolean };
  settings: { enabled: boolean; required: boolean; confirmationWindowHours: number; autoConfirmOnTimeout: boolean; requirePod: boolean };
  feePreview: { fee: number; payout: number; percent: number; fixed: number };
  canInitiate: boolean;
  ledgerBlocks: boolean;
  side: string;
};

function ProviderNote({ provider }: { provider: SecureDealPanelView["provider"] }) {
  if (provider.testMode) {
    return (
      <Badge tone="warning" className="gap-1.5" data-testid="provider-test-mode">
        <FlaskConical className="size-3.5" aria-hidden /> Тестовый режим: реальные деньги не движутся
      </Badge>
    );
  }
  return (
    <Badge tone="info" className="gap-1.5">
      <Landmark className="size-3.5" aria-hidden /> {provider.title}
    </Badge>
  );
}

export function SecureDealPanel({ orderId, view }: { orderId: string; view: SecureDealPanelView }) {
  const { run, pending } = useAction();
  const p = view.payment;
  const isAdmin = view.side === "ADMIN";
  const currency = view.order.currency;

  if (!p) {
    return (
      <Card data-testid="secure-deal">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary size-5" aria-hidden /> Безопасная сделка
            </CardTitle>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Заказчик обеспечивает оплату у платёжного провайдера до начала перевозки. Перевозчик видит, что деньги есть, а получает их
              после доставки, документов и подтверждения получения. Если заказчик не ответит за {view.settings.confirmationWindowHours} ч. и
              не откроет спор, выплата выполнится автоматически.
            </p>
          </div>
          <ProviderNote provider={view.provider} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {view.canInitiate ? (
            <ConfirmDialog
              title="Оформить безопасную сделку?"
              description={`Сумма ${formatMoney(view.order.amount, currency)} будет обеспечена у платёжного провайдера и выплачена перевозчику после выполнения условий.`}
              consequences={[
                `Комиссия платформы: ${formatMoney(view.feePreview.fee, currency)} (удерживается из выплаты перевозчику).`,
                `Перевозчик получит: ${formatMoney(view.feePreview.payout, currency)}.`,
                "Сумма фиксируется и не меняется после оформления.",
                view.provider.testMode ? "Тестовый режим: реальное списание не выполняется." : "Операции подтверждаются банком-партнёром.",
              ]}
              confirmLabel="Оформить и обеспечить оплату"
              pendingLabel="Оформляем..."
              onConfirm={async () =>
                (await run((key) => api(`/api/orders/${orderId}/secure-deal`, { method: "POST", idempotencyKey: key }), {
                  success: (d: { status: string }) =>
                    d.status === "PAYMENT_RESERVED" ? "Оплата обеспечена" : "Безопасная сделка оформлена, ожидаем подтверждения оплаты",
                })) !== undefined
              }
              trigger={
                <Button size="lg" data-testid="secure-deal-initiate">
                  <Lock /> Оформить безопасную сделку · {formatMoney(view.order.amount, currency)}
                </Button>
              }
            />
          ) : view.side === "CARRIER" ? (
            <p className="text-muted-foreground">
              Заказчик ещё не оформил безопасную сделку.{" "}
              {view.settings.required
                ? "Начать загрузку можно только после обеспечения оплаты."
                : "Расчёты ведутся по договорённости сторон (раздел «Платежи» ниже)."}
            </p>
          ) : view.ledgerBlocks ? (
            <p className="text-muted-foreground">По перевозке ведётся ручной учёт платежей — безопасная сделка недоступна.</p>
          ) : !view.settings.enabled ? (
            <p className="text-muted-foreground">Безопасная сделка отключена администратором платформы.</p>
          ) : (
            <p className="text-muted-foreground">Безопасную сделку можно оформить до начала загрузки.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const status = p.status as SecureDealStatus;
  const tiles = [
    { label: "Сумма сделки", value: p.amount },
    { label: `Комиссия платформы${p.feePercent ? ` (${p.feePercent}%)` : ""}`, value: p.platformFee },
    { label: "Перевозчику к выплате", value: view.payout ?? p.amount - p.platformFee },
    { label: "Удерживается", value: view.held ?? 0 },
    { label: "Выплачено перевозчику", value: p.releasedAmount },
    ...(p.refundedAmount > 0 ? [{ label: "Возвращено заказчику", value: p.refundedAmount }] : []),
  ];
  const due = view.order.confirmationDueAt;
  const pendingTx = view.transactions?.find((t) => t.status === "PENDING");

  return (
    <div className="space-y-5" data-testid="secure-deal">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary size-5" aria-hidden /> Безопасная сделка
            </CardTitle>
            <p className="text-muted-foreground max-w-2xl text-sm">{PAYMENT_STATUS_HINTS[status]}</p>
            {p.failureReason && <p className="text-danger text-sm">Провайдер: {p.failureReason}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="PaymentStatus" value={p.status} size="lg" />
            <ProviderNote provider={view.provider} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="secure-deal-tiles">
            {tiles.map((t) => (
              <div key={t.label} className="border-border bg-card rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">{t.label}</p>
                <MoneyDisplay amount={t.value} currency={currency} className="text-lg" />
              </div>
            ))}
          </div>

          {view.conditions && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Условия выплаты перевозчику</h3>
              <ul className="space-y-1.5 text-sm" data-testid="release-conditions">
                {view.conditions.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    {c.met ? (
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-label="выполнено" />
                    ) : (
                      <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="не выполнено" />
                    )}
                    <span>
                      {c.label}
                      {c.hint === "confirmationDue" && due ? (
                        <span className="text-muted-foreground block text-xs">
                          Срок проверки: до {formatDateTime(due)} ({formatRelative(due)}).{" "}
                          {view.settings.autoConfirmOnTimeout
                            ? "Если спор не будет открыт, получение подтвердится автоматически."
                            : "Автоподтверждение отключено — решение примет администратор."}
                        </span>
                      ) : c.hint ? (
                        <span className="text-muted-foreground block text-xs">{c.hint}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {view.canCancel && (
              <ConfirmDialog
                title="Отменить безопасную сделку?"
                description="Оплата ещё не обеспечена. Сделка будет отменена, расчёты можно вести в ручном учёте или оформить сделку заново."
                destructive
                confirmLabel="Отменить сделку"
                onConfirm={async () =>
                  (await run((key) => api(`/api/orders/${orderId}/secure-deal/cancel`, { method: "POST", idempotencyKey: key }), {
                    success: "Безопасная сделка отменена",
                  })) !== undefined
                }
                trigger={<Button variant="outline">Отменить безопасную сделку</Button>}
              />
            )}
            {(view.side === "CUSTOMER" || view.side === "CARRIER") &&
              ["PAYMENT_RESERVED", "PAYMENT_PARTIALLY_RELEASED"].includes(status) && (
                <Button variant="ghost" className="text-destructive" asChild>
                  <Link href={`/orders/${orderId}?tab=dispute`} scroll={false}>
                    Есть проблема? Открыть спор
                  </Link>
                </Button>
              )}
          </div>

          {isAdmin && (
            <AdminPaymentActions
              paymentId={p.id}
              status={status}
              held={view.held ?? 0}
              currency={currency}
              pendingTx={pendingTx}
              provider={view.provider}
              pending={pending}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История платежа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="border-border space-y-3 border-l pl-4 text-sm" data-testid="payment-history">
            {(view.history ?? []).map((h) => (
              <li key={h.id} className="relative">
                <span className="bg-primary absolute top-1.5 -left-[21px] size-2.5 rounded-full" aria-hidden />
                <p className="font-medium">{label("PaymentStatus", h.toStatus)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(h.createdAt)} ·{" "}
                  {h.actorUserId
                    ? (view.userNames?.[h.actorUserId] ?? "Пользователь")
                    : h.actorType === "SYSTEM"
                      ? "Система / провайдер"
                      : "—"}
                </p>
                {h.reason && <p className="text-muted-foreground">{h.reason}</p>}
              </li>
            ))}
          </ol>
          {(view.transactions?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Операция у провайдера</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Комиссия</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Номер у провайдера</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.transactions!.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        {label("PaymentTransactionKind", t.kind)}
                        {t.reason && <span className="text-muted-foreground block max-w-72 truncate text-xs">{t.reason}</span>}
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay amount={t.amount} currency={t.currency} />
                      </TableCell>
                      <TableCell>{t.fee > 0 ? formatMoney(t.fee, t.currency) : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge kind="PaymentTransactionStatus" value={t.status} />
                        {t.failureReason && <span className="text-danger block text-xs">{t.failureReason}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-48 truncate font-mono text-xs">
                        {t.providerTransactionId ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDateTime(t.completedAt ?? t.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            CargoFlow не хранит деньги и данные банковских карт: средства резервирует и перечисляет платёжный провайдер, платформа фиксирует
            условия, статусы и журнал операций.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminPaymentActions({
  paymentId,
  status,
  held,
  currency,
  pendingTx,
  provider,
  pending,
}: {
  paymentId: string;
  status: SecureDealStatus;
  held: number;
  currency: string;
  pendingTx?: { id: string; kind: string; amount: number; provider: string };
  provider: SecureDealPanelView["provider"];
  pending: boolean;
}) {
  const { run } = useAction();
  const [op, setOp] = React.useState<null | "release" | "refund">(null);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [ref, setRef] = React.useState("");
  const canMove =
    ["PAYMENT_RESERVED", "PAYMENT_DISPUTED", "PAYMENT_PARTIALLY_RELEASED", "PAYMENT_RELEASE_PENDING"].includes(status) &&
    !pendingTx &&
    held > 0;

  const submit = () =>
    run(
      (key) =>
        api(`/api/admin/payments/${paymentId}/${op}`, {
          body: { amount: amount ? Number(amount) : null, reason },
          idempotencyKey: key,
        }),
      {
        success: op === "release" ? "Выплата передана провайдеру" : "Возврат передан провайдеру",
        onSuccess: () => {
          setOp(null);
          setAmount("");
          setReason("");
        },
      },
    );

  return (
    <div className="border-border space-y-3 rounded-lg border border-dashed p-3" data-testid="admin-payment-actions">
      <p className="text-sm font-semibold">Администратор: операции по безопасной сделке</p>
      {pendingTx && (
        <div className="space-y-2 text-sm">
          <p>
            Ожидает подтверждения: {label("PaymentTransactionKind", pendingTx.kind)} · {formatMoney(pendingTx.amount, currency)}
          </p>
          {provider.manualConfirmation ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field id="tx-ref" label="Номер операции в банке" className="min-w-64">
                <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Платёжное поручение / выписка" maxLength={200} />
              </Field>
              <Button
                size="sm"
                disabled={!ref.trim() || pending}
                onClick={() =>
                  run(
                    (key) =>
                      api(`/api/admin/payment-transactions/${pendingTx.id}/confirm`, {
                        body: { outcome: "SUCCEEDED", providerTransactionId: ref, failureReason: null },
                        idempotencyKey: key,
                      }),
                    { success: "Операция подтверждена" },
                  )
                }
              >
                Подтвердить по данным банка
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() =>
                  run(
                    (key) =>
                      api(`/api/admin/payment-transactions/${pendingTx.id}/confirm`, {
                        body: { outcome: "FAILED", providerTransactionId: ref || null, failureReason: "Отклонено банком" },
                        idempotencyKey: key,
                      }),
                    { success: "Операция отмечена как отклонённая" },
                  )
                }
              >
                Банк отклонил
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => api(`/api/admin/payment-transactions/${pendingTx.id}/retry`, { method: "POST" }), { success: "Запрос повторён" })
              }
            >
              Повторить запрос к провайдеру
            </Button>
          )}
        </div>
      )}
      {canMove && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOp("release")}>
            Выплатить перевозчику
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOp("refund")}>
            Вернуть заказчику
          </Button>
          <span className="text-muted-foreground self-center text-xs">Удерживается: {formatMoney(held, currency)}</span>
        </div>
      )}
      <Dialog open={op !== null} onOpenChange={(o) => !o && setOp(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{op === "release" ? "Выплата перевозчику" : "Возврат заказчику"}</DialogTitle>
            <DialogDescription>
              Операция будет передана платёжному провайдеру и записана в журнал. Удерживается {formatMoney(held, currency)}. Оставьте сумму
              пустой, чтобы {op === "release" ? "выплатить" : "вернуть"} весь остаток.
            </DialogDescription>
          </DialogHeader>
          <Field id="op-amount" label={`Сумма, ${currency}`} hint="Частичная операция — остаток продолжит удерживаться">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={held}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field id="op-reason" label="Основание" required>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="Решение по спору, акт, соглашение сторон"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOp(null)}>
              Отмена
            </Button>
            <Button
              className={cn(op === "refund" && "bg-destructive text-white")}
              disabled={reason.trim().length < 5 || (amount !== "" && !(Number(amount) > 0 && Number(amount) <= held))}
              loading={pending}
              onClick={submit}
            >
              {op === "release" ? "Выплатить" : "Вернуть"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
