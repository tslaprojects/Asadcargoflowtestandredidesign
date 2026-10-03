"use client";
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer hairline border-input bg-card shadow-control data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground grid size-[1.125rem] shrink-0 place-items-center rounded-[0.3125rem] transition-colors duration-(--duration-micro) disabled:cursor-not-allowed disabled:opacity-40 lg:size-3.5 lg:rounded-[0.25rem]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="data-[state=checked]:animate-check-pop grid place-items-center">
        <Check className="size-3.5 [stroke-width:3] lg:size-2.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
