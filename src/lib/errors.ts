export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  BID_ALREADY_EXISTS: "BID_ALREADY_EXISTS",
  BID_ALREADY_ACCEPTED: "BID_ALREADY_ACCEPTED",
  LOAD_ALREADY_CONVERTED: "LOAD_ALREADY_CONVERTED",
  VEHICLE_UNAVAILABLE: "VEHICLE_UNAVAILABLE",
  DRIVER_UNAVAILABLE: "DRIVER_UNAVAILABLE",
  CONTRACT_ALREADY_SIGNED: "CONTRACT_ALREADY_SIGNED",
  DOCUMENT_NOT_ALLOWED: "DOCUMENT_NOT_ALLOWED",
  DELIVERY_NOT_ALLOWED: "DELIVERY_NOT_ALLOWED",
  ORDER_ALREADY_CLOSED: "ORDER_ALREADY_CLOSED",
  DUPLICATE_ACTION: "DUPLICATE_ACTION",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const defaultStatus: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INVALID_STATE_TRANSITION: 409,
  BID_ALREADY_EXISTS: 409,
  BID_ALREADY_ACCEPTED: 409,
  LOAD_ALREADY_CONVERTED: 409,
  VEHICLE_UNAVAILABLE: 409,
  DRIVER_UNAVAILABLE: 409,
  CONTRACT_ALREADY_SIGNED: 409,
  DOCUMENT_NOT_ALLOWED: 422,
  DELIVERY_NOT_ALLOWED: 409,
  ORDER_ALREADY_CLOSED: 409,
  DUPLICATE_ACTION: 409,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export type FieldErrors = Record<string, string[]>;

/** Ожидаемая бизнес-ошибка. message — понятный пользователю текст на русском. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, message: string, opts?: { status?: number; fields?: FieldErrors }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = opts?.status ?? defaultStatus[code];
    this.fields = opts?.fields;
  }
}

export const errors = {
  unauthorized: (m = "Требуется вход в систему.") => new AppError("UNAUTHORIZED", m),
  forbidden: (m = "У вас нет доступа к этому действию.") => new AppError("FORBIDDEN", m),
  notFound: (m = "Объект не найден.") => new AppError("NOT_FOUND", m),
  validation: (m = "Проверьте правильность заполнения полей.", fields?: FieldErrors) => new AppError("VALIDATION_ERROR", m, { fields }),
  transition: (m: string) => new AppError("INVALID_STATE_TRANSITION", m),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
