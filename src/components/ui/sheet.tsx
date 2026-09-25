"use client";
import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right" | "bottom" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
      <SheetPrimitive.Content
        className={cn(
          "bg-card fixed z-50 flex flex-col shadow-xl outline-none",
          side === "right" && "inset-y-0 right-0 h-full w-full max-w-md border-l",
          side === "left" && "inset-y-0 left-0 h-full w-72 border-r",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-md p-1.5" aria-label="Закрыть">
          <X className="size-4" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-border flex flex-col gap-1 border-b p-4 pr-12", className)} {...props} />;
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-base font-semibold", className)} {...props} />;
}
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger };
