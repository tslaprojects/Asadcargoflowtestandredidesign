import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        info: "border-info-border bg-info-bg text-info",
        delayed: "border-delayed-border bg-delayed-bg text-delayed",
        danger: "border-danger-border bg-danger-bg text-danger",
        neutral: "border-neutral-border bg-neutral-bg text-neutral",
        outline: "border-border bg-card text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
