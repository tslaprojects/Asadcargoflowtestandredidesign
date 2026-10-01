"use client";
import { DropdownMenu as DM } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const DropdownMenu = DM.Root;
const DropdownMenuTrigger = DM.Trigger;
const DropdownMenuGroup = DM.Group;

function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          "border-border bg-card data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out z-50 min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg border p-1 text-sm shadow-md",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}
function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "data-[highlighted]:bg-muted [&_svg]:text-muted-foreground relative flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-100 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("text-muted-foreground px-2 py-1.5 text-xs font-medium", className)} {...props} />;
}
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("bg-border -mx-1 my-1 h-px", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
