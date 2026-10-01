import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-border bg-card text-card-foreground rounded-lg border shadow-xs", className)} {...props} />;
}
/** Интерактивная карточка (ссылка/кнопка): рамка и тень усиливаются при наведении, без «прыжков» раскладки. */
const cardInteractive =
  "transition-[border-color,box-shadow] duration-200 ease-out hover:border-border-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-4 pt-4 pb-3 sm:px-5", className)} {...props} />;
}
/** Заголовок панели — h2 (не пропускает уровень после h1 страницы), визуально — роль text-h3. */
function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-h3", className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4 sm:px-5", className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-border flex items-center gap-2 border-t px-4 py-3 sm:px-5", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, cardInteractive, CardTitle };
