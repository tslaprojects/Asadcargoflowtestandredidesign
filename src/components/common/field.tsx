import { AlertCircle } from "lucide-react";
import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Поле формы: подпись, подсказка и текст ошибки, связанные через aria-атрибуты.
 * layout="row" — как в macOS Settings: подпись слева, поле справа (на телефоне — друг под другом).
 */
export function Field({
  id,
  label,
  error,
  hint,
  required,
  className,
  layout = "stack",
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  layout?: "stack" | "row";
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const child = React.cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  });
  const caption = (
    <>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-footnote text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-footnote text-danger animate-rise-in font-medium">
          {error}
        </p>
      )}
    </>
  );
  const labelEl = (
    <Label htmlFor={id} className={cn("text-subheadline font-medium", layout === "row" && "sm:pt-1.5 lg:pt-1")}>
      {label}
      {required && (
        <span className="text-muted-foreground" aria-hidden>
          {" "}
          *
        </span>
      )}
    </Label>
  );
  if (layout === "row")
    return (
      <div className={cn("grid gap-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4", className)}>
        {labelEl}
        <div className="min-w-0 space-y-1">
          {child}
          {caption}
        </div>
      </div>
    );
  return (
    <div className={cn("space-y-1.5", className)}>
      {labelEl}
      {child}
      {caption}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="bg-danger-bg text-danger text-body animate-rise-in flex items-start gap-2 rounded-md px-3 py-2.5">
      <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
