"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightLeft, Check, Gavel, MessageCircleQuestion, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FormError } from "@/components/common/field";
import { CompanyBadge, MoneyDisplay } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { api, ApiError, errorMessage, newIdempotencyKey } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate, formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { CURRENCIES, priceDeltaPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────── Предложить цену (перевозчик) ───────────

const bidForm = z.object({
  amount: z.string().refine((v) => Number(v) > 0, "Цена должна быть больше 0"),
  currency: z.enum(["USD", "CNY", "KZT", "RUB"]),
  comment: z.string().max(1000).optional(),
  readyDate: z.string().optional(),
  terms: z.string().max(1000).optional(),
  validUntil: z.string().optional(),
});

export function BidDialog({ loadId, currency, targetPrice }: { loadId: string; currency: string; targetPrice: number | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState(newIdempotencyKey);
  const form = useForm<z.infer<typeof bidForm>>({
    resolver: zodResolver(bidForm),
    defaultValues: {
      amount: targetPrice ? String(targetPrice) : "",
      currency: currency as "USD",
      comment: "",
      readyDate: "",
      terms: "",
      validUntil: "",
    },
  });
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api(`/api/loads/${loadId}/bids`, {
        body: {
          amount: Number(v.amount),
          currency,
          comment: v.comment,
          terms: v.terms,
          readyDate: v.readyDate || null,
          validUntil: v.validUntil ? new Date(`${v.validUntil}T23:59:00`).toISOString() : null,
        },
        idempotencyKey: key,
      });
      toast.success("Предложение отправлено");
      setOpen(false);
      setKey(newIdempotencyKey());
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) form.setError(k as "amount", { message: m[0] });
      setError(errorMessage(e));
      setKey(newIdempotencyKey());
    }
  });
  const e = form.formState.errors;
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} data-testid="open-bid-dialog">
        <Gavel /> Предложить цену
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Предложить цену</DialogTitle>
            <DialogDescription>Заказчик получит уведомление и сможет принять предложение или предложить другую цену.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <FormError message={error} />
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <Field id="bid-amount" label="Цена" error={e.amount?.message} required>
                <Input type="number" inputMode="decimal" min={0} step="any" {...form.register("amount")} />
              </Field>
              <Field id="bid-currency" label="Валюта" required>
                {/* Валюта сделки — валюта груза */}
                <NativeSelect disabled {...form.register("currency")}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field id="bid-comment" label="Комментарий">
              <Textarea rows={2} placeholder="Опыт на направлении, тип машины…" {...form.register("comment")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="bid-ready" label="Дата готовности">
                <Input type="date" {...form.register("readyDate")} />
              </Field>
              <Field id="bid-valid" label="Предложение действует до">
                <Input type="date" {...form.register("validUntil")} />
              </Field>
            </div>
            <Field id="bid-terms" label="Дополнительные условия">
              <Textarea rows={2} placeholder="Условия оплаты, простоя…" {...form.register("terms")} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting} loadingText="Отправляем...">
                Отправить предложение
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Задать вопрос (перевозчик) ───────────

export function AskQuestionDialog({ loadId }: { loadId: string }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const { run, pending } = useAction();
  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
        <MessageCircleQuestion /> Задать вопрос
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Вопрос по грузу</DialogTitle>
            <DialogDescription>Ответ заказчика увидят все перевозчики, работающие с грузом.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Вопрос" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={pending}
              loadingText="Отправляем..."
              disabled={text.trim().length < 3}
              onClick={() =>
                run(() => api(`/api/loads/${loadId}/questions`, { body: { question: text } }), {
                  success: "Вопрос отправлен заказчику",
                  onSuccess: () => {
                    setOpen(false);
                    setText("");
                  },
                })
              }
            >
              Отправить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AnswerQuestionForm({ questionId }: { questionId: string }) {
  const [text, setText] = React.useState("");
  const { run, pending } = useAction();
  return (
    <div className="mt-2 flex gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваш ответ" aria-label="Ответ на вопрос" maxLength={2000} />
      <Button
        size="sm"
        className="h-9"
        disabled={!text.trim()}
        loading={pending}
        loadingText="..."
        onClick={() => run(() => api(`/api/questions/${questionId}/answer`, { body: { answer: text } }), { success: "Ответ опубликован" })}
      >
        Ответить
      </Button>
    </div>
  );
}

// ─────────── Карточка ставки ───────────

export type BidView = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  comment: string | null;
  terms: string | null;
  readyDate: Date | string | null;
  validUntil: Date | string | null;
  counterAmount: number | null;
  awaitingSide: "CUSTOMER" | "CARRIER";
  createdAt: Date | string;
  carrier: { id: string; legalName: string; verificationStatus: string; country: string };
  createdBy: { firstName: string; lastName: string };
  messages: {
    id: string;
    side: "CUSTOMER" | "CARRIER";
    type: string;
    amount: number | null;
    currency: string | null;
    message: string | null;
    createdAt: Date | string;
    author: { firstName: string; lastName: string };
    company: { legalName: string };
  }[];
};

function NegotiationHistory({ messages }: { messages: BidView["messages"] }) {
  return (
    <ol className="space-y-2 border-l-2 pl-3" aria-label="История переговоров">
      {messages.map((m) => (
        <li key={m.id} className="text-body">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-medium", m.side === "CUSTOMER" ? "text-link" : "text-foreground")}>
              {m.side === "CUSTOMER" ? "Заказчик" : "Перевозчик"}
            </span>
            <span className="text-muted-foreground text-footnote">{label("BidMessageType", m.type)}</span>
            {m.amount !== null && m.currency && (
              <MoneyDisplay amount={m.amount} currency={m.currency} className={m.type === "COUNTER" ? "text-link" : ""} />
            )}
            <span className="text-muted-foreground text-footnote">{formatDateTime(m.createdAt)}</span>
          </div>
          {m.message && <p className="text-muted-foreground">{m.message}</p>}
        </li>
      ))}
    </ol>
  );
}

export function BidCard({
  bid,
  perspective,
  targetPrice,
  rating,
  canAct,
}: {
  bid: BidView;
  perspective: "owner" | "carrier";
  targetPrice: number | null;
  rating?: { average: number | null; count: number };
  canAct: boolean;
}) {
  const { run, pending } = useAction();
  const [counterOpen, setCounterOpen] = React.useState(false);
  const [proposeOpen, setProposeOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [message, setMessage] = React.useState("");
  const delta = priceDeltaPercent(bid.amount, targetPrice);
  const active = bid.status === "PENDING";
  const [showHistory, setShowHistory] = React.useState(perspective === "carrier");

  const counterSubmit = (url: string, body: object, success: string, close: () => void) =>
    run((key) => api(url, { body, idempotencyKey: key }), {
      success,
      onSuccess: () => {
        close();
        setAmount("");
        setMessage("");
      },
    });

  return (
    <div className={cn("bg-card rounded-lg p-4", bid.status === "ACCEPTED" ? "border-success-border" : "")} data-testid="bid-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CompanyBadge id={bid.carrier.id} name={bid.carrier.legalName} verification={bid.carrier.verificationStatus} rating={rating} />
          <p className="text-muted-foreground text-footnote">
            {bid.createdBy.firstName} {bid.createdBy.lastName} · {formatDateTime(bid.createdAt)}
            {bid.readyDate && ` · готов с ${formatDate(bid.readyDate)}`}
            {bid.validUntil && ` · действует до ${formatDate(bid.validUntil)}`}
          </p>
        </div>
        <div className="text-right">
          <MoneyDisplay amount={bid.amount} currency={bid.currency} className="text-title2" />
          {delta !== null && (
            <p className={cn("text-footnote", delta > 0 ? "text-warning" : "text-success")}>
              {delta > 0 ? "+" : ""}
              {delta}% к целевой цене
            </p>
          )}
          <div className="mt-1">
            <StatusBadge kind="BidStatus" value={bid.status} />
          </div>
        </div>
      </div>
      {bid.comment && <p className="text-body mt-2">{bid.comment}</p>}
      {bid.terms && <p className="text-muted-foreground text-body mt-1">Условия: {bid.terms}</p>}
      {active && bid.counterAmount !== null && (
        <div className="bg-info-bg text-info text-body mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2">
          <ArrowRightLeft className="size-4" aria-hidden />
          Встречное предложение заказчика: <MoneyDisplay amount={bid.counterAmount} currency={bid.currency} />
          <Badge tone="warning">{bid.awaitingSide === "CARRIER" ? "ожидает ответа перевозчика" : "ожидает заказчика"}</Badge>
        </div>
      )}

      {bid.messages.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="text-link text-footnote hover:underline"
            onClick={() => setShowHistory((s) => !s)}
            aria-expanded={showHistory}
          >
            {showHistory ? "Скрыть историю переговоров" : `История переговоров (${bid.messages.length})`}
          </button>
          {showHistory && (
            <div className="mt-2">
              <NegotiationHistory messages={bid.messages} />
            </div>
          )}
        </div>
      )}

      {active && canAct && perspective === "owner" && (
        <div className="hairline-t mt-4 flex flex-wrap gap-2 pt-3">
          <ConfirmDialog
            title="Принять предложение?"
            description={
              <>
                {bid.carrier.legalName} · <MoneyDisplay amount={bid.amount} currency={bid.currency} />
              </>
            }
            consequences={[
              "Будет создана перевозка и договор на согласованную сумму.",
              "Остальные активные предложения будут отклонены автоматически.",
              "Груз будет снят с биржи.",
            ]}
            irreversible
            confirmLabel="Принять предложение"
            pendingLabel="Оформляем сделку..."
            onConfirm={async () => {
              const r = await run<{ orderId: string }>(
                (key) =>
                  api(`/api/bids/${bid.id}/accept`, {
                    body: { expectedAmount: bid.amount, expectedCurrency: bid.currency },
                    idempotencyKey: key,
                  }),
                {
                  success: (d) => `Предложение принято. Создана перевозка — подпишите договор.${d ? "" : ""}`,
                  refresh: false,
                  onSuccess: (d) => {
                    window.location.assign(`/orders/${d.orderId}?tab=contract`);
                  },
                },
              );
              return r !== undefined;
            }}
            trigger={
              <Button variant="success" data-testid="accept-bid">
                <Check /> Принять предложение
              </Button>
            }
          />
          <Button variant="outline" onClick={() => setCounterOpen(true)}>
            <ArrowRightLeft /> Предложить другую цену
          </Button>
          <ConfirmDialog
            title="Отклонить предложение?"
            description={`Перевозчик ${bid.carrier.legalName} получит уведомление.`}
            irreversible
            destructive
            withReason
            reasonLabel="Причина (увидит перевозчик)"
            confirmLabel="Отклонить"
            pendingLabel="Отклоняем..."
            onConfirm={async (reason) => {
              const r = await run((key) => api(`/api/bids/${bid.id}/reject`, { body: { reason }, idempotencyKey: key }), {
                success: "Предложение отклонено",
              });
              return r !== undefined;
            }}
            trigger={
              <Button variant="ghost" className="text-danger">
                <X /> Отклонить
              </Button>
            }
          />
        </div>
      )}

      {active && canAct && perspective === "carrier" && (
        <div className="hairline-t mt-4 flex flex-wrap gap-2 pt-3">
          {bid.counterAmount !== null && bid.awaitingSide === "CARRIER" && (
            <>
              <Button
                variant="success"
                loading={pending}
                loadingText="Отправляем..."
                onClick={() =>
                  run((key) => api(`/api/bids/${bid.id}/respond`, { body: { action: "agree" }, idempotencyKey: key }), {
                    success: "Вы согласились с ценой заказчика",
                  })
                }
              >
                <Check /> Согласиться на {bid.counterAmount.toLocaleString("ru-RU")} {bid.currency}
              </Button>
              <Button variant="outline" onClick={() => setProposeOpen(true)}>
                <ArrowRightLeft /> Предложить свою цену
              </Button>
            </>
          )}
          <ConfirmDialog
            title="Отозвать предложение?"
            description="Заказчик больше не сможет его принять. Вы сможете отправить новое предложение."
            destructive
            confirmLabel="Отозвать"
            onConfirm={async () => {
              const r = await run((key) => api(`/api/bids/${bid.id}/withdraw`, { method: "POST", idempotencyKey: key }), {
                success: "Предложение отозвано",
              });
              return r !== undefined;
            }}
            trigger={
              <Button variant="ghost" className="text-danger">
                Отозвать предложение
              </Button>
            }
          />
        </div>
      )}

      {[
        {
          open: counterOpen,
          setOpen: setCounterOpen,
          title: "Предложить другую цену",
          url: `/api/bids/${bid.id}/counter`,
          success: "Встречное предложение отправлено",
          body: () => ({ amount: Number(amount), message }),
        },
        {
          open: proposeOpen,
          setOpen: setProposeOpen,
          title: "Предложить свою цену",
          url: `/api/bids/${bid.id}/respond`,
          success: "Новая цена отправлена заказчику",
          body: () => ({ action: "propose", amount: Number(amount), message }),
        },
      ].map((d) => (
        <Dialog key={d.title} open={d.open} onOpenChange={d.setOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{d.title}</DialogTitle>
              <DialogDescription>
                Текущее предложение: {bid.amount.toLocaleString("ru-RU")} {bid.currency}. История переговоров сохраняется.
              </DialogDescription>
            </DialogHeader>
            <Field id={`${d.title}-amount`} label={`Цена, ${bid.currency}`} required>
              <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field id={`${d.title}-msg`} label="Комментарий">
              <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => d.setOpen(false)}>
                Отмена
              </Button>
              <Button
                disabled={!(Number(amount) > 0)}
                loading={pending}
                loadingText="Отправляем..."
                onClick={() => counterSubmit(d.url, d.body(), d.success, () => d.setOpen(false))}
              >
                Отправить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
