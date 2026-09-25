import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "border-input bg-card placeholder:text-muted-foreground/70 focus-visible:outline-ring aria-[invalid=true]:border-destructive flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "border-input bg-card placeholder:text-muted-foreground/70 focus-visible:outline-ring aria-[invalid=true]:border-destructive flex min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "border-input bg-card focus-visible:outline-ring aria-[invalid=true]:border-destructive bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6474%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] flex h-9 w-full appearance-none rounded-md border bg-[length:12px] bg-[right_0.6rem_center] bg-no-repeat px-3 py-1 pr-8 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export { Input, NativeSelect, Textarea };
