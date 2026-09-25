import { cn } from "@/lib/utils";

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("bg-muted h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}
