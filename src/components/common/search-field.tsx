import { Search } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Поле поиска macOS/iOS: серая заливка, лупа слева, без рамки. */
export const SearchField = React.forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, ...props }, ref) => (
    <div className={cn("relative min-w-0", wrapperClassName)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 lg:size-3.5"
        aria-hidden
      />
      <input
        ref={ref}
        type="search"
        className={cn(
          "bg-fill-tertiary text-foreground lg:text-body h-11 w-full min-w-0 rounded-md pr-3 pl-8 text-base outline-offset-0 lg:h-7 lg:pl-7 [&::-webkit-search-cancel-button]:opacity-60",
          className,
        )}
        {...props}
      />
    </div>
  ),
);
SearchField.displayName = "SearchField";
