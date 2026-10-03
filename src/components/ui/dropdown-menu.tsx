"use client";
import { DropdownMenu as DM } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const DropdownMenu = DM.Root;
const DropdownMenuTrigger = DM.Trigger;
const DropdownMenuGroup = DM.Group;

/** Меню macOS: полупрозрачный материал, выделенный пункт — заливка акцентом и белый текст. */
function DropdownMenuContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          "material-menu shadow-menu text-body data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out z-50 min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md p-[5px]",
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
        "data-[highlighted]:bg-selection data-[highlighted]:text-selection-foreground [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-selection-foreground relative flex min-h-11 items-center gap-2 rounded-xs px-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 lg:min-h-6 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("text-section px-2 pt-1.5 pb-1", className)} {...props} />;
}
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("bg-border mx-2 my-[5px] h-px", className)} {...props} />;
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
