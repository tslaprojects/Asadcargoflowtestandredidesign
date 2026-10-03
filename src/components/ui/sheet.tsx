"use client";
import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

/**
 * Выезжающая панель: справа — инспектор macOS, слева — меню, снизу — шит iOS с «ручкой».
 */
function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right" | "bottom" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out fixed inset-0 z-50" />
      <SheetPrimitive.Content
        className={cn(
          "bg-elevated shadow-dialog fixed z-50 flex flex-col will-change-transform outline-none",
          side === "right" &&
            "data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right inset-y-0 right-0 h-full w-full max-w-md pt-[env(safe-area-inset-top)]",
          side === "left" &&
            "data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left inset-y-0 left-0 h-full w-[18rem] max-w-[85vw] pt-[env(safe-area-inset-top)]",
          side === "bottom" &&
            "data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl pt-2 pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        {...props}
      >
        {side === "bottom" && <div aria-hidden className="bg-fill mx-auto mb-1 h-[5px] w-9 shrink-0 rounded-full" />}
        {children}
        <SheetPrimitive.Close
          className={cn(
            "bg-fill-tertiary text-muted-foreground hover:bg-fill-secondary hover:text-foreground absolute right-3.5 grid size-7 place-items-center rounded-full transition-colors duration-(--duration-micro)",
            side === "bottom" ? "top-4" : "top-[calc(env(safe-area-inset-top)+0.875rem)]",
          )}
          aria-label="Закрыть"
        >
          <X className="size-3.5 [stroke-width:2.5]" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("hairline-b flex flex-col gap-0.5 px-4 pt-3.5 pr-14 pb-3", className)} {...props} />;
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-title3", className)} {...props} />;
}
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-muted-foreground text-subheadline", className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger };
