"use client";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage, newIdempotencyKey } from "./api";

type RunOptions<T> = {
  success?: string | ((data: T) => string);
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (e: ApiError | Error) => void;
  refresh?: boolean;
  /** Не показывать toast об ошибке (например, если ошибка выводится в форме). */
  silentError?: boolean;
};

/**
 * Выполнение действия с backend: блокировка повторного клика, один ключ идемпотентности
 * на попытку, понятные сообщения об успехе/ошибке, обновление серверных данных страницы.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const run = useCallback(
    async <T>(fn: (idempotencyKey: string) => Promise<T>, opts: RunOptions<T> = {}): Promise<T | undefined> => {
      if (inflight.current) return undefined;
      inflight.current = true;
      setPending(true);
      const key = newIdempotencyKey();
      try {
        const data = await fn(key);
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(data) : opts.success);
        await opts.onSuccess?.(data);
        if (opts.refresh !== false) router.refresh();
        return data;
      } catch (e) {
        if (!opts.silentError) toast.error(errorMessage(e));
        opts.onError?.(e as Error);
        return undefined;
      } finally {
        inflight.current = false;
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending };
}
