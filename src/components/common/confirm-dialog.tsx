"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";

/**
 * Подтверждение операции, как alert macOS: что произойдёт, можно ли отменить, «Отмена» и действие справа.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  consequences,
  irreversible,
  confirmLabel = t("common.confirm"),
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
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {consequences && consequences.length > 0 && (
          <ul className="text-subheadline text-muted-foreground marker:text-tertiary-foreground list-disc space-y-1 pl-5">
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        {irreversible && <p className="text-subheadline text-danger font-medium">{t("common.irreversible")}</p>}
        {withReason && (
          <div className="space-y-1.5">
            <Label htmlFor={id} className="text-subheadline font-medium">
              {reasonLabel}
              {!reasonRequired && <span className="text-muted-foreground font-normal"> ({t("common.optional")})</span>}
            </Label>
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {t("common.cancel")}
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
