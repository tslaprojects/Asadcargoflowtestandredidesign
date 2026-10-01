"use client";
import { Plus } from "lucide-react";
import * as React from "react";
import { Field } from "@/components/common/field";
import { MoneyDisplay } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import type { FinanceSummary } from "@/lib/money";

type Payment = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: Date | string | null;
  dueDate: Date | string | null;
  note: string | null;
  createdAt: Date | string;
};

export function FinancePanel({
  orderId,
  summary,
  payments,
  canEdit,
  canConfirmPaid = false,
  closedOrCancelled,
  secureDeal = false,
}: {
  orderId: string;
  summary: FinanceSummary;
  payments: Payment[];
  canEdit: boolean;
  /** Подтвердить получение оплаты может получатель (перевозчик) или администратор */
  canConfirmPaid?: boolean;
  closedOrCancelled: boolean;
  /** Расчёты ведутся через безопасную сделку — ручной учёт скрыт */
  secureDeal?: boolean;
}) {
  const { run, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ type: "PREPAYMENT", amount: "", status: "PLANNED", dueDate: "", note: "" });

  const create = () =>
    run(
      (key) =>
        api(`/api/orders/${orderId}/payments`, {
          body: { ...form, amount: Number(form.amount), currency: summary.currency, dueDate: form.dueDate || null },
          idempotencyKey: key,
        }),
      { success: "Платёж добавлен", onSuccess: () => setOpen(false) },
    );

  const tiles = secureDeal
    ? [
        { label: "Стоимость", value: summary.total },
        { label: "Обеспечено (удерживается)", value: summary.secured },
        { label: "Выплачено перевозчику", value: summary.paid },
        { label: "Не выплачено", value: summary.outstanding },
      ]
    : [
        { label: "Стоимость", value: summary.total },
        { label: "Предоплата", value: summary.prepaymentPlanned },
        { label: "Оплачено", value: summary.paid },
        { label: "Остаток", value: summary.outstanding },
      ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="finance-summary">
        {tiles.map((t) => (
          <div key={t.label} className="border-border bg-card rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">{t.label}</p>
            <MoneyDisplay amount={t.value} currency={summary.currency} className="text-xl" />
          </div>
        ))}
      </div>
      {summary.mismatchedCurrency && <p className="text-warning text-sm">Есть платежи в другой валюте — они не учитываются в сводке.</p>}
      {!secureDeal && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Платежи</CardTitle>
            <div className="flex flex-wrap gap-2">
              {canEdit && !closedOrCancelled && (
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus /> Добавить платёж
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">Платежей пока нет. Зафиксируйте предоплату и окончательный расчёт.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Срок / оплачен</TableHead>
                    <TableHead>Комментарий</TableHead>
                    {canEdit && <TableHead className="text-right">Действия</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{label("PaymentType", p.type)}</TableCell>
                      <TableCell>
                        <MoneyDisplay amount={p.amount} currency={p.currency} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="PaymentStatus" value={p.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.paidAt ? `оплачен ${formatDate(p.paidAt)}` : p.dueDate ? `до ${formatDate(p.dueDate)}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-64 truncate">{p.note ?? "—"}</TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          {p.status !== "PAID" && p.status !== "CANCELLED" && (
                            <div className="flex justify-end gap-1">
                              {p.status === "PLANNED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending}
                                  onClick={() =>
                                    run(() => api(`/api/payments/${p.id}`, { method: "PATCH", body: { status: "INVOICED" } }), {
                                      success: "Счёт выставлен",
                                    })
                                  }
                                >
                                  Счёт выставлен
                                </Button>
                              )}
                              {canConfirmPaid && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onClick={() =>
                                    run(() => api(`/api/payments/${p.id}`, { method: "PATCH", body: { status: "PAID" } }), {
                                      success: "Платёж отмечен оплаченным",
                                    })
                                  }
                                >
                                  Оплачено
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                disabled={pending}
                                onClick={() =>
                                  run(() => api(`/api/payments/${p.id}`, { method: "PATCH", body: { status: "CANCELLED" } }), {
                                    success: "Платёж отменён",
                                  })
                                }
                              >
                                Отменить
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              CargoFlow фиксирует финансовые договорённости, но не проводит платежи. Согласованная стоимость после подписания договора
              меняется только через администратора.
            </p>
          </CardContent>
        </Card>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Добавить платёж</DialogTitle>
            <DialogDescription>
              Валюта сделки: {summary.currency}. Остаток: {summary.outstanding.toLocaleString("ru-RU")}
            </DialogDescription>
          </DialogHeader>
          <Field id="p-type" label="Тип">
            <NativeSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {enumOptions("PaymentType").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="p-amount" label={`Сумма, ${summary.currency}`} required>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field id="p-status" label="Статус">
            <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="PLANNED">Запланирован</option>
              <option value="INVOICED">Выставлен счёт</option>
              {canConfirmPaid && <option value="PAID">Оплачен</option>}
            </NativeSelect>
          </Field>
          <Field id="p-due" label="Срок оплаты">
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field id="p-note" label="Комментарий">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button disabled={!(Number(form.amount) > 0)} loading={pending} loadingText="Сохраняем..." onClick={create}>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
