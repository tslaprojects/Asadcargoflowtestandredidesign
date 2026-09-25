"use client";
import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Подтверждение опасных операций: что произойдёт, можно ли отменить, кнопки «Отмена / Подтвердить».
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  consequences,
  irreversible,
  confirmLabel = "Подтвердить",
  pendingLabel = "Выполняем...",
  destructive,
  withReason,
  reasonLabel = "Причина",
  reasonRequired,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  consequences?: string[];
  irreversible?: boolean;
  confirmLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
  withReason?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<boolean | void> | boolean | void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const id = React.useId();

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await onConfirm(reason.trim());
      if (res !== false) {
        setOpen(false);
        setReason("");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      {trigger && <span onClick={() => setOpen(true)}>{trigger}</span>}
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="text-destructive size-5" aria-hidden />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {consequences && consequences.length > 0 && (
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        {irreversible && <p className="bg-warning-bg text-warning rounded-md px-3 py-2 text-sm">Это действие нельзя отменить.</p>}
        {withReason && (
          <div className="space-y-1.5">
            <Label htmlFor={id}>
              {reasonLabel}
              {!reasonRequired && <span className="text-muted-foreground font-normal"> (необязательно)</span>}
            </Label>
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Отмена
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={confirm}
            loading={pending}
            loadingText={pendingLabel}
            disabled={withReason && reasonRequired && reason.trim().length < 3}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
