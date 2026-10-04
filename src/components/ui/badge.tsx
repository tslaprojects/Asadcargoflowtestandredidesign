import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Тонированная метка: мягкий фон своего тона, без рамки и без «таблетки». */
const badgeVariants = cva(
  "text-footnote inline-flex h-5 items-center gap-1 rounded-xs px-1.5 font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "bg-success-bg text-success",
        warning: "bg-warning-bg text-warning",
        info: "bg-info-bg text-info",
        delayed: "bg-delayed-bg text-delayed",
        danger: "bg-danger-bg text-danger",
        neutral: "bg-neutral-bg text-neutral",
        outline: "hairline border-border-strong text-muted-foreground",
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
