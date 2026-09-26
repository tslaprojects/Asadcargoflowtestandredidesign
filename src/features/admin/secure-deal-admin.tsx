"use client";
import { Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

type JobResult = { checked: number; confirmed: number; released: number; skipped: { order: string; reason: string }[] };

/** Ручной запуск обработки истёкших сроков проверки (в production — по расписанию, см. README). */
export function RunTimeoutsButton() {
  const { run, pending } = useAction();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() =>
        run(() => api<JobResult>("/api/admin/jobs/secure-deal", { method: "POST" }), {
          onSuccess: (r) => {
            toast.success(`Проверено: ${r.checked}, подтверждено автоматически: ${r.confirmed}, выплат запрошено: ${r.released}`);
            if (r.skipped.length) toast.info(r.skipped.map((s) => `${s.order}: ${s.reason}`).join("\n"));
          },
        })
      }
    >
      <Timer /> Обработать истёкшие сроки
    </Button>
  );
}
