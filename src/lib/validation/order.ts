import { z } from "zod";
import { currencySchema, optionalDate, optionalText, requiredText } from "./common";

const ORDER_STATUSES = [
  "WAITING_FOR_LOADING",
  "AT_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CUSTOMS",
  "BORDER_CLEARED",
  "AT_DELIVERY",
  "CANCELLED",
  "ON_HOLD",
] as const;

const coord = (min: number, max: number) =>
  z
    .union([z.null(), z.undefined(), z.coerce.number().min(min).max(max)])
    .optional()
    .transform((v) => (v === undefined ? null : v));

export const locationSchema = z.object({
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  accuracy: z
    .union([z.null(), z.undefined(), z.coerce.number().min(0).max(100_000)])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
});

export const statusChangeSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { message: "Недопустимый статус" }),
    comment: optionalText(1000),
    documentIds: z.array(z.uuid()).max(20).default([]),
  })
  .and(locationSchema.partial());

export const trackingSchema = z.object({
  latitude: z.coerce.number({ message: "Нет координат" }).min(-90).max(90),
  longitude: z.coerce.number({ message: "Нет координат" }).min(-180).max(180),
  accuracy: z
    .union([z.null(), z.undefined(), z.coerce.number().min(0).max(100_000)])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  note: optionalText(500),
  recordedAt: optionalDate,
});

export const assignVehicleSchema = z.object({ vehicleId: z.uuid({ message: "Выберите автомобиль" }) });
export const assignDriverSchema = z.object({ driverId: z.uuid({ message: "Выберите водителя" }) });

export const deliverSchema = z.object({
  comment: optionalText(1000),
  documentIds: z.array(z.uuid()).max(20).default([]),
  latitude: coord(-90, 90).optional(),
  longitude: coord(-180, 180).optional(),
  accuracy: coord(0, 100_000).optional(),
});

export const confirmDeliverySchema = z.object({ comment: optionalText(1000) });

export const signContractSchema = z.object({
  password: z.string().min(1, "Введите пароль для подтверждения личности"),
  agree: z.literal(true, { message: "Подтвердите ознакомление с документом" }),
  documentHash: z.string().length(64, "Некорректный hash документа"),
});

export const chatMessageSchema = z.object({
  message: z.string().trim().max(4000, "Не более 4000 символов").default(""),
  attachmentId: z.uuid().optional().nullable(),
});

export const paymentCreateSchema = z.object({
  type: z.enum(["PREPAYMENT", "FINAL_PAYMENT", "OTHER"]),
  amount: z.coerce.number({ message: "Укажите сумму" }).positive("Сумма должна быть больше 0"),
  currency: currencySchema,
  status: z.enum(["PLANNED", "INVOICED", "PAID"]).default("PLANNED"),
  dueDate: optionalDate,
  paidAt: optionalDate,
  note: optionalText(500),
});

export const paymentUpdateSchema = z.object({
  status: z.enum(["PLANNED", "INVOICED", "PAID", "CANCELLED"]),
  paidAt: optionalDate,
  note: optionalText(500),
});

const score = z
  .union([z.null(), z.undefined(), z.literal(""), z.coerce.number().int().min(1).max(5)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const reviewSchema = z.object({
  rating: z.coerce.number({ message: "Поставьте оценку" }).int().min(1, "Оценка от 1 до 5").max(5, "Оценка от 1 до 5"),
  punctuality: score,
  communication: score,
  documentation: score,
  comment: optionalText(2000),
});

export const disputeCreateSchema = z.object({
  reason: z.enum(["DELAY", "DAMAGE", "MISSING_DOCUMENTS", "CARGO_MISMATCH", "PAYMENT_ISSUE", "OTHER"], {
    message: "Выберите причину",
  }),
  description: requiredText(10, 4000, "Опишите ситуацию (не менее 10 символов)"),
});

export const disputeUpdateSchema = z.object({
  status: z.enum(["IN_REVIEW", "RESOLVED", "REJECTED"]),
  resolution: optionalText(4000),
  /** Как поступить с перевозкой при закрытии спора */
  orderOutcome: z.enum(["RESUME", "CANCEL", "CLOSE"]).default("RESUME"),
});

export const disputeCommentSchema = z.object({ message: requiredText(1, 4000, "Введите комментарий") });

export const orderCancelSchema = z.object({ reason: requiredText(3, 500, "Укажите причину отмены") });

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().optional(),
  group: z.enum(["active", "in_transit", "attention", "completed", "all"]).default("all"),
  carrierId: z.string().optional(),
  shipperId: z.string().optional(),
  client: z.string().trim().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(["updated", "created", "loading", "amount"]).default("updated"),
});

export const priceChangeSchema = z.object({ amount: z.coerce.number().positive(), currency: currencySchema });
