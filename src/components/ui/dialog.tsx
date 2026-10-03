"use client";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/** Окно поверх содержимого, как alert/sheet macOS: без рамки, мягкая тень, лёгкое затемнение фона. */
function DialogContent({
  className,
  children,
  size = "md",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out fixed inset-0 z-50" />
      <DialogPrimitive.Content
        className={cn(
          "bg-elevated shadow-dialog data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-xl p-5 outline-none",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-md",
          size === "lg" && "max-w-2xl",
          size === "xl" && "max-w-4xl",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="bg-fill-tertiary text-muted-foreground hover:bg-fill-secondary hover:text-foreground absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-full transition-colors duration-(--duration-micro) lg:size-6"
          aria-label="Закрыть"
        >
          <X className="size-3.5 [stroke-width:2.5]" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 pr-8", className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end", className)} {...props} />;
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-title3", className)} {...props} />;
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-muted-foreground text-subheadline", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
