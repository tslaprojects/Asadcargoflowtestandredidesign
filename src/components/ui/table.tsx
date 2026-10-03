import * as React from "react";
import { cn } from "@/lib/utils";

/** Таблица в духе Finder: подписи колонок обычным регистром, «зебра» вместо линий между строками. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("text-body w-full caption-bottom", className)} {...props} />
    </div>
  );
}
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:hairline-b [&_tr]:bg-transparent", className)} {...props} />;
}
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:nth-child(even)]:bg-fill-quaternary", className)} {...props} />;
}
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("hover:!bg-fill-tertiary transition-colors duration-(--duration-micro)", className)} {...props} />;
}
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("text-muted-foreground text-footnote h-8 px-3 text-left align-middle font-medium whitespace-nowrap", className)}
      {...props}
    />
  );
}
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-2 align-middle lg:py-1.5", className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
