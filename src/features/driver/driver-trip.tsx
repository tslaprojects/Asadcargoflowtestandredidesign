"use client";
import { CheckCircle2, LocateFixed, MapPin, MessageSquare, Phone, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, errorMessage } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDateTime, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { driverNextStep, type DriverStep } from "@/lib/state-machine/order-state-machine";
import type { OrderStatus } from "@/generated/prisma/enums";
import { DocumentUploader } from "@/features/documents/document-uploader";
import { currentPosition, DeliverDialog } from "@/features/orders/order-actions";
import { ChatPanel } from "@/features/chat/chat-panel";

type Props = {
  orderId: string;
  status: OrderStatus;
  lastLocationAt: string | null;
  documents: { id: string; type: string; filename: string; createdAt: string }[];
  carrierPhone: string | null;
};

/** Мобильный экран водителя: одна большая кнопка, соответствующая текущему статусу. */
/** Быстрые действия водителя, как кнопки под карточкой в Картах: значок акцентом и подпись под ним. */
const QUICK =
  "bg-card text-link hover:bg-surface-secondary active:bg-muted text-footnote h-[4.5rem] flex-col gap-1.5 rounded-xl font-medium lg:h-[4.5rem] [&_svg]:size-5";

export function DriverTripActions({ orderId, status, lastLocationAt, documents, carrierPhone }: Props) {
  const router = useRouter();
  const step: DriverStep = driverNextStep(status);
  const { run, pending } = useAction();
  const [locating, setLocating] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);

  const sendLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const pos = await currentPosition(10_000);
      if (pos.latitude === undefined) {
        toast.error("Не удалось получить местоположение. Разрешите доступ к геолокации в браузере.");
        return;
      }
      await api(`/api/orders/${orderId}/tracking`, {
        body: { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy ?? null },
      });
      toast.success("Местоположение отправлено");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  const transition = (to: OrderStatus, text: string) => (
    <ConfirmDialog
      key={to}
      title={`${text}?`}
      description="Статус рейса изменится, диспетчер и заказчик получат уведомление. Мы приложим ваше местоположение, если оно доступно."
      withReason
      reasonLabel="Комментарий"
      confirmLabel="Подтвердить"
      pendingLabel="Отправляем..."
      onConfirm={async (comment) => {
        const coords = await currentPosition();
        const r = await run(
          (key) => api(`/api/orders/${orderId}/status`, { body: { status: to, comment, ...coords }, idempotencyKey: key }),
          { success: "Статус перевозки обновлён" },
        );
        return r !== undefined;
      }}
      trigger={
        <Button size="xl" className="w-full" data-testid={`driver-action-${to}`}>
          {text}
        </Button>
      }
    />
  );

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl p-4">
        <p className="text-section">Следующее действие</p>
        <p className="mt-1 mb-3.5">{step.hint}</p>
        <div className="space-y-2">
          {step.primary?.kind === "transition" &&
            (step.primary.to === "DELIVERED" ? (
              <DeliverDialog orderId={orderId} size="xl" className="w-full" />
            ) : (
              transition(step.primary.to, step.primary.label)
            ))}
          {step.primary?.kind === "location" && (
            <Button
              size="xl"
              className="w-full"
              onClick={sendLocation}
              loading={locating}
              loadingText="Определяем..."
              data-testid="driver-send-location"
            >
              <LocateFixed /> {step.primary.label}
            </Button>
          )}
          {step.secondary.map((s) => (
            <ConfirmDialog
              key={s.to}
              title={`${s.label}?`}
              withReason
              reasonLabel="Комментарий"
              confirmLabel="Подтвердить"
              pendingLabel="Отправляем..."
              onConfirm={async (comment) => {
                const coords = await currentPosition();
                const r = await run(
                  (key) => api(`/api/orders/${orderId}/status`, { body: { status: s.to, comment, ...coords }, idempotencyKey: key }),
                  { success: "Статус перевозки обновлён" },
                );
                return r !== undefined;
              }}
              trigger={
                <Button size="lg" variant="secondary" className="h-12 w-full" disabled={pending} data-testid={`driver-action-${s.to}`}>
                  <MapPin /> {s.label}
                </Button>
              }
            />
          ))}
          {step.primary?.kind === "transition" && status !== "WAITING_FOR_LOADING" && (
            <Button
              size="lg"
              variant="ghost"
              className="text-link w-full"
              onClick={sendLocation}
              loading={locating}
              loadingText="Определяем..."
            >
              <LocateFixed /> Обновить местоположение
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-footnote mt-3 text-center">
          {lastLocationAt ? `Последнее местоположение: ${formatRelative(lastLocationAt)}` : "Местоположение ещё не отправлялось"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" className={QUICK} onClick={() => setUploadOpen(true)}>
          <Upload /> Фото / документ
        </Button>
        <Button variant="ghost" className={QUICK} onClick={() => setChatOpen(true)}>
          <MessageSquare /> Сообщение
        </Button>
        {carrierPhone ? (
          <Button asChild variant="ghost" className={QUICK}>
            <a href={`tel:${carrierPhone}`}>
              <Phone /> Диспетчер
            </a>
          </Button>
        ) : (
          <Button variant="ghost" className={QUICK} disabled>
            <Phone /> Нет телефона
          </Button>
        )}
      </div>

      {documents.length > 0 && (
        <div className="bg-card rounded-xl px-4 py-3">
          <p className="text-section mb-2">Загруженные документы</p>
          <ul className="space-y-1.5">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <CheckCircle2 className="text-success size-4" aria-hidden />
                <a
                  href={`/api/documents/${d.id}/download?inline=1`}
                  className="text-link truncate hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label("DocumentType", d.type)} — {d.filename}
                </a>
                <span className="text-muted-foreground text-footnote ml-auto shrink-0">{formatDateTime(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Sheet open={uploadOpen} onOpenChange={setUploadOpen}>
        <SheetContent side="bottom" className="p-4">
          <SheetHeader className="px-0">
            <SheetTitle>Фото или документ</SheetTitle>
          </SheetHeader>
          <div className="pt-4">
            <DocumentUploader
              url={`/api/orders/${orderId}/documents`}
              types={["CARGO_PHOTO", "SEAL_PHOTO", "CMR", "PROOF_OF_DELIVERY", "DRIVER_DOCUMENT", "VEHICLE_DOCUMENT", "OTHER"]}
              compact
              capture
              onUploaded={() => setUploadOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="bottom" className="h-[90dvh] p-3">
          <SheetHeader className="px-1">
            <SheetTitle>Чат перевозки</SheetTitle>
          </SheetHeader>
          <ChatPanel orderId={orderId} canSend className="mt-2 h-full max-h-none flex-1 border-0" />
        </SheetContent>
      </Sheet>
      <p className="text-center">
        <Link href={`/orders/${orderId}`} className="text-link text-body hover:underline">
          Подробнее о рейсе
        </Link>
      </p>
      <span className="sr-only">
        Текущий статус: <StatusBadge kind="OrderStatus" value={status} />
      </span>
    </div>
  );
}
