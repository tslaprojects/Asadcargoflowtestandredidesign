"use client";
import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-foreground text-sm leading-none font-medium peer-disabled:opacity-60", className)}
      {...props}
    />
  );
}

export { Label };
