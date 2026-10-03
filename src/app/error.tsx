"use client";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error boundary: без stack trace, с понятным сообщением и повтором. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("ui.error", { digest: error.digest });
  }, [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div role="alert" className="max-w-md text-center">
        <AlertTriangle className="text-warning mx-auto size-10" aria-hidden />
        <h1 className="text-title2 mt-3 font-semibold">Что-то пошло не так</h1>
        <p className="text-muted-foreground text-body mt-2">
          Не удалось загрузить страницу. Попробуйте ещё раз — если ошибка повторится, обратитесь в поддержку.
        </p>
        {error.digest && <p className="text-muted-foreground text-footnote mt-1 font-mono">Код: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Повторить</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            На главную
          </Button>
        </div>
      </div>
    </div>
  );
}
