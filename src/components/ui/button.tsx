import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Кнопки macOS/iOS: заливка акцентом — только главное действие, второстепенные — серая заливка без рамки.
 * Нажатие затемняет кнопку, а не уменьшает её. На касаниях высота ≥ 44 px, на десктопе — плотнее.
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-body font-medium transition-[background-color,color,filter,opacity] duration-(--duration-micro) disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-progress [&_svg]:size-[1.125em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:brightness-90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:brightness-90",
        outline: "bg-card text-foreground shadow-control hover:bg-surface-secondary active:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-fill",
        ghost: "text-foreground hover:bg-fill-quaternary active:bg-fill-tertiary",
        link: "text-link underline-offset-2 hover:underline",
        success: "bg-success-solid text-white hover:bg-success-solid-hover active:brightness-90",
      },
      size: {
        default: "h-11 px-4 lg:h-8 lg:px-3",
        sm: "h-9 px-3 text-callout lg:h-7 lg:px-2.5",
        lg: "h-12 px-5 text-headline lg:h-10 lg:px-4",
        xl: "h-14 rounded-xl px-6 text-title3 font-semibold [&_svg]:size-5",
        icon: "size-11 lg:size-8",
        "icon-sm": "size-9 lg:size-7",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0 lg:h-auto lg:px-0" }],
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {loadingText ?? children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
