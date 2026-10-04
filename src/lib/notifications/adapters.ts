import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";

export type OutboundNotification = {
  userId: string;
  email?: string | null;
  phone?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/** Канал доставки уведомлений. In-app уведомления пишутся в БД сервисом напрямую. */
export interface NotificationAdapter {
  readonly channel: "email" | "telegram" | "whatsapp";
  isEnabled(): boolean;
  send(n: OutboundNotification): Promise<void>;
}

/**
 * Секреты в ссылках (токены сброса пароля и приглашений) никогда не пишутся в лог в production:
 * доступ к логам не должен давать доступ к учётным записям.
 */
export function redactSecrets(text: string): string {
  if (process.env.NODE_ENV !== "production") return text;
  return text.replace(/([?&]token=)[^&\s]+/gi, "$1[REDACTED]").replace(/(\/invite\/)[A-Za-z0-9_-]+/g, "$1[REDACTED]");
}

function maskEmail(email: string): string {
  if (process.env.NODE_ENV !== "production") return email;
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
}

/** Email: в разработке пишет письмо в лог сервера. Для production подключите SMTP/API-провайдер, реализовав send(). */
export class EmailNotificationAdapter implements NotificationAdapter {
  readonly channel = "email" as const;
  isEnabled() {
    return (process.env.EMAIL_DRIVER ?? "log") === "log";
  }
  async send(n: OutboundNotification) {
    if (!n.email) return;
    const url = n.link ? `${process.env.APP_URL ?? ""}${n.link}` : "";
    logger.info("email.dev", {
      to: maskEmail(n.email),
      subject: `CargoFlow: ${n.title}`,
      text: redactSecrets(`${n.body ?? ""} ${url}`.trim()),
    });
  }
}

/** Telegram-бот: архитектурная точка расширения. Работает только при наличии TELEGRAM_BOT_TOKEN и привязке chat_id. */
export class TelegramNotificationAdapter implements NotificationAdapter {
  readonly channel = "telegram" as const;
  isEnabled() {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }
  async send(n: OutboundNotification) {
    // Привязка chat_id к пользователю не входит в MVP — канал не отправляет сообщения.
    logger.debug("telegram.skip", { userId: n.userId, type: n.type });
  }
}

/** WhatsApp Business API: архитектурная точка расширения (не требуется для локального запуска). */
export class WhatsAppNotificationAdapter implements NotificationAdapter {
  readonly channel = "whatsapp" as const;
  isEnabled() {
    return Boolean(process.env.WHATSAPP_API_TOKEN);
  }
  async send(n: OutboundNotification) {
    logger.debug("whatsapp.skip", { userId: n.userId, type: n.type });
  }
}

export const externalAdapters: NotificationAdapter[] = [
  new EmailNotificationAdapter(),
  new TelegramNotificationAdapter(),
  new WhatsAppNotificationAdapter(),
];

/** Прямая отправка email (сброс пароля, приглашения). */
export async function sendEmail(to: string, subject: string, text: string) {
  if ((process.env.EMAIL_DRIVER ?? "log") !== "log") {
    logger.warn("email.disabled", { subject, reason: "EMAIL_DRIVER не поддерживает отправку — письмо не отправлено" });
    return;
  }
  logger.info("email.dev", { to: maskEmail(to), subject, text: redactSecrets(text) });
}
