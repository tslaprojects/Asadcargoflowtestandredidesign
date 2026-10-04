import * as React from "react";
import { cn } from "@/lib/utils";

/** Сгруппированный блок на сером фоне, как в iOS Settings: без рамки и тени. */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("bg-card text-card-foreground rounded-lg", className)} {...props} />;
}
/** Интерактивный блок (ссылка/кнопка): подсветка фона при наведении и нажатии. */
const cardInteractive = "transition-colors duration-(--duration-micro) hover:bg-surface-secondary active:bg-muted";
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-0.5 px-4 pt-3.5 pb-2", className)} {...props} />;
}
/** Заголовок блока — h2 (не пропускает уровень после h1 страницы). */
function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-headline", className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-subheadline", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("hairline-t flex items-center gap-2 px-4 py-2.5", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, cardInteractive, CardTitle };
