"use client";
import { Pencil, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

export function LoadOwnerActions({ loadId, status, pendingBids }: { loadId: string; status: string; pendingBids: number }) {
  const { run, pending } = useAction();
  const editable = status === "DRAFT" || status === "PUBLISHED";
  const cancellable = ["DRAFT", "PUBLISHED", "BIDDING"].includes(status);
  return (
    <>
      {editable ? (
        <Button asChild variant="outline">
          <Link href={`/loads/${loadId}/edit`}>
            <Pencil /> Редактировать
          </Link>
        </Button>
      ) : (
        status === "BIDDING" && (
          <Tooltip content="По грузу уже есть предложения — редактирование недоступно. Отмените груз и создайте новый.">
            <span tabIndex={0}>
              <Button variant="outline" disabled>
                <Pencil /> Редактировать
              </Button>
            </span>
          </Tooltip>
        )
      )}
      {status === "DRAFT" && (
        <Button
          loading={pending}
          loadingText="Публикуем..."
          onClick={() =>
            run((key) => api(`/api/loads/${loadId}/publish`, { method: "POST", idempotencyKey: key }), { success: "Груз опубликован" })
          }
        >
          <Send /> Опубликовать груз
        </Button>
      )}
      {cancellable && (
        <ConfirmDialog
          title="Отменить груз?"
          description="Груз будет снят с биржи."
          consequences={
            pendingBids > 0 ? [`Активные предложения (${pendingBids}) будут отклонены, перевозчики получат уведомление.`] : undefined
          }
          irreversible
          destructive
          withReason
          confirmLabel="Отменить груз"
          pendingLabel="Отменяем..."
          onConfirm={async (reason) => {
            const r = await run((key) => api(`/api/loads/${loadId}/cancel`, { body: { reason }, idempotencyKey: key }), {
              success: "Груз отменён",
            });
            return r !== undefined;
          }}
          trigger={
            <Button variant="ghost" className="text-danger">
              <XCircle /> Отменить
            </Button>
          }
        />
      )}
    </>
  );
}
