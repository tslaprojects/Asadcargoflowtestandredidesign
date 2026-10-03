"use client";
import { ShieldCheck } from "lucide-react";
import * as React from "react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

export function RequestVerificationButton({ companyId, disabledReason }: { companyId: string; disabledReason?: string }) {
  const { run, pending } = useAction();
  const [comment, setComment] = React.useState("");
  if (disabledReason) return <p className="text-muted-foreground text-body">{disabledReason}</p>;
  return (
    <div className="space-y-3">
      <Field id="ver-comment" label="Комментарий для проверяющего (необязательно)">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </Field>
      <Button
        loading={pending}
        loadingText="Отправляем..."
        onClick={() =>
          run(() => api(`/api/companies/${companyId}/verification`, { body: { comment } }), { success: "Заявка на проверку отправлена" })
        }
      >
        <ShieldCheck /> Запросить проверку
      </Button>
    </div>
  );
}
