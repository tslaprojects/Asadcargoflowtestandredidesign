import * as React from "react";
import { cn } from "@/lib/utils";

/** Поле без рамки внутри строки сгруппированной формы. */
export const rowInput =
  "w-full min-w-0 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-tertiary-foreground read-only:text-muted-foreground lg:py-2 lg:text-body";

/** Нативный список внутри строки формы: без рамки, двойная стрелка справа. */
export const rowSelect = cn(
  rowInput,
  "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238e8e93%22 stroke-width=%222.25%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m7 15 5 5 5-5%22/><path d=%22m7 9 5-5 5 5%22/></svg>')] bg-[length:0.75rem] bg-[right_center] bg-no-repeat pr-5",
);

/**
 * Форма, как в iOS Settings и окне Apple ID: заголовок над блоком, строки «подпись — поле»
 * в одном белом блоке с волосяными линиями, пояснение под блоком.
 */
export function FormGroup({
  header,
  footer,
  className,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {header && <p className="text-section mb-1.5 px-4">{header}</p>}
      <div className="bg-card [&>*+*>[data-row-content]]:hairline-t overflow-hidden rounded-lg">{children}</div>
      {footer && <div className="text-footnote text-muted-foreground mt-1.5 px-4">{footer}</div>}
    </div>
  );
}

/** Строка формы: подпись слева, поле справа; ошибка — под строкой, связана через aria-describedby. */
export function FormRow({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const child = React.cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  });
  return (
    <div className="has-[:focus-visible]:bg-accent/60 pl-4 transition-colors duration-(--duration-micro)">
      <div data-row-content className="pr-4">
        <div className="flex items-center gap-3">
          <label htmlFor={id} className={cn("w-28 shrink-0 py-3 lg:w-32 lg:py-2", error && "text-danger")}>
            {label}
          </label>
          <div className="min-w-0 flex-1">{child}</div>
        </div>
        {hint && !error && (
          <p id={`${id}-hint`} className="text-footnote text-muted-foreground -mt-1 pb-2.5 sm:pl-31 lg:pl-35">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-footnote text-danger animate-rise-in -mt-1 pb-2.5 font-medium sm:pl-31 lg:pl-35"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
