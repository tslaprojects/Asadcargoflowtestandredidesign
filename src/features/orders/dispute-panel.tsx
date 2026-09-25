"use client";
import * as React from "react";
import { Field } from "@/components/common/field";
import { EmptyState } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { OpenDisputeDialog } from "./order-actions";

type Dispute = {
  id: string;
  reason: string;
  description: string;
  status: string;
  resolution: string | null;
  resolvedAt: Date | string | null;
  createdAt: Date | string;
  openedByUserId: string;
  comments: { id: string; authorUserId: string; message: string; createdAt: Date | string }[];
};

export function DisputePanel({
  orderId,
  disputes,
  userNames,
  isAdmin,
  canOpen,
  canComment,
}: {
  orderId: string;
  disputes: Dispute[];
  userNames: Record<string, string>;
  isAdmin: boolean;
  canOpen: boolean;
  canComment: boolean;
}) {
  const { run, pending } = useAction();
  const [comment, setComment] = React.useState("");
  const [resolution, setResolution] = React.useState("");
  const [outcome, setOutcome] = React.useState("RESUME");

  if (disputes.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          title="Споров по перевозке нет"
          description="Если возникла проблема (задержка, повреждение, документы, оплата) — откройте спор, администратор CargoFlow рассмотрит его."
          className="py-10"
        />
        {canOpen && <OpenDisputeDialog orderId={orderId} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canOpen && !disputes.some((d) => d.status === "OPEN" || d.status === "IN_REVIEW") && <OpenDisputeDialog orderId={orderId} />}
      {disputes.map((d) => {
        const active = d.status === "OPEN" || d.status === "IN_REVIEW";
        return (
          <Card key={d.id}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Спор: {label("DisputeReason", d.reason)}</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Открыл {userNames[d.openedByUserId] ?? "участник"} · {formatDateTime(d.createdAt)}
                </p>
              </div>
              <StatusBadge kind="DisputeStatus" value={d.status} size="lg" />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">{d.description}</p>
              {d.resolution && (
                <div className="bg-success-bg rounded-lg p-3 text-sm">
                  <p className="text-success font-medium">Решение администратора</p>
                  <p>{d.resolution}</p>
                  {d.resolvedAt && <p className="text-muted-foreground text-xs">{formatDateTime(d.resolvedAt)}</p>}
                </div>
              )}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Комментарии</h4>
                {d.comments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Комментариев нет.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.comments.map((c) => (
                      <li key={c.id} className="border-border rounded-lg border p-2 text-sm">
                        <p className="text-muted-foreground text-xs">
                          {userNames[c.authorUserId] ?? "Участник"} · {formatDateTime(c.createdAt)}
                        </p>
                        <p className="whitespace-pre-wrap">{c.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {active && canComment && (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Написать комментарий"
                    aria-label="Комментарий к спору"
                    maxLength={4000}
                  />
                  <Button
                    size="sm"
                    disabled={!comment.trim()}
                    loading={pending}
                    onClick={() =>
                      run(() => api(`/api/disputes/${d.id}/comments`, { body: { message: comment } }), {
                        success: "Комментарий добавлен",
                        onSuccess: () => setComment(""),
                      })
                    }
                  >
                    Отправить комментарий
                  </Button>
                </div>
              )}
              {active && isAdmin && (
                <div className="border-warning-border bg-warning-bg/50 space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">Решение администратора</p>
                  {d.status === "OPEN" && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={pending}
                      onClick={() =>
                        run(() => api(`/api/disputes/${d.id}`, { method: "PATCH", body: { status: "IN_REVIEW" } }), {
                          success: "Спор взят в работу",
                        })
                      }
                    >
                      Взять на рассмотрение
                    </Button>
                  )}
                  <Field id={`res-${d.id}`} label="Решение" required>
                    <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={4000} />
                  </Field>
                  <Field id={`out-${d.id}`} label="Что сделать с перевозкой">
                    <NativeSelect value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                      <option value="RESUME">Возобновить с прежнего этапа</option>
                      <option value="CLOSE">Закрыть перевозку</option>
                      <option value="CANCEL">Отменить перевозку</option>
                    </NativeSelect>
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={!resolution.trim()}
                      loading={pending}
                      onClick={() =>
                        run(
                          () =>
                            api(`/api/disputes/${d.id}`, {
                              method: "PATCH",
                              body: { status: "RESOLVED", resolution, orderOutcome: outcome },
                            }),
                          { success: "Спор закрыт" },
                        )
                      }
                    >
                      Решить спор
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!resolution.trim()}
                      loading={pending}
                      onClick={() =>
                        run(
                          () =>
                            api(`/api/disputes/${d.id}`, {
                              method: "PATCH",
                              body: { status: "REJECTED", resolution, orderOutcome: outcome },
                            }),
                          { success: "Спор отклонён" },
                        )
                      }
                    >
                      Отклонить спор
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
