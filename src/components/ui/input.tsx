import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "border-input bg-card placeholder:text-muted-foreground/70 hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-ring/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 flex h-10 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[border-color,box-shadow] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm",
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
      "border-input bg-card placeholder:text-muted-foreground/70 hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-ring/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 flex min-h-20 w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
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
      "border-input bg-card hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-ring/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6474%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] flex h-10 w-full appearance-none rounded-md border bg-[length:12px] bg-[right_0.6rem_center] bg-no-repeat px-3 py-1 pr-8 text-base shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export { Input, NativeSelect, Textarea };
