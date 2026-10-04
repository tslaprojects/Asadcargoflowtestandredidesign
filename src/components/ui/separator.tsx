import { cn } from "@/lib/utils";

function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("bg-border shrink-0", orientation === "horizontal" ? "h-(--hairline) w-full" : "h-full w-(--hairline)", className)}
    />
  );
}

export { Separator };
