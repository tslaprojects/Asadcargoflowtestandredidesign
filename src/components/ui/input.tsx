import * as React from "react";
import { cn } from "@/lib/utils";

/** Поле macOS: белое, тонкая граница, кольцо фокуса снаружи. 16 px на телефоне — без автозума iOS. */
const field =
  "hairline w-full min-w-0 rounded-sm border-input bg-card text-base text-foreground transition-[border-color] duration-(--duration-micro) disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:outline-danger/55 lg:text-body";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      field,
      "file:text-callout flex h-11 px-3 file:mr-2 file:border-0 file:bg-transparent file:font-medium lg:h-[1.875rem] lg:px-2.5",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "flex min-h-20 px-3 py-2 lg:px-2.5 lg:py-1.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

/** Нативный список с двойной стрелкой, как всплывающая кнопка macOS. */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      field,
      "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238e8e93%22 stroke-width=%222.25%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m7 15 5 5 5-5%22/><path d=%22m7 9 5-5 5 5%22/></svg>')] flex h-11 appearance-none bg-[length:0.75rem] bg-[right_0.55rem_center] bg-no-repeat pr-8 pl-3 lg:h-[1.875rem] lg:pl-2.5",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export { Input, NativeSelect, Textarea };
