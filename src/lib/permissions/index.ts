/**
 * Единый слой разрешений CargoFlow.
 * Файл не зависит от сервера — используется и в UI (для UX), и на backend (для безопасности).
 * Источник истины для авторизации — всегда backend (services), UI лишь скрывает недоступные действия.
 */
import type { CompanyType, MemberRole } from "@/generated/prisma/enums";

export const Permission = {
  // Грузы
  LOAD_VIEW_OWN: "LOAD_VIEW_OWN",
  LOAD_CREATE: "LOAD_CREATE",
  LOAD_EDIT: "LOAD_EDIT",
  LOAD_PUBLISH: "LOAD_PUBLISH",
  LOAD_CANCEL: "LOAD_CANCEL",
  LOAD_ANSWER_QUESTION: "LOAD_ANSWER_QUESTION",
  MARKETPLACE_VIEW: "MARKETPLACE_VIEW",
  LOAD_ASK_QUESTION: "LOAD_ASK_QUESTION",
  // Ставки
  BID_CREATE: "BID_CREATE",
  BID_WITHDRAW: "BID_WITHDRAW",
  BID_VIEW: "BID_VIEW",
  BID_ACCEPT: "BID_ACCEPT",
  BID_REJECT: "BID_REJECT",
  BID_COUNTER: "BID_COUNTER",
  // Заказы
  ORDER_VIEW: "ORDER_VIEW",
  ORDER_STATUS_UPDATE: "ORDER_STATUS_UPDATE",
  ORDER_ASSIGN_VEHICLE: "ORDER_ASSIGN_VEHICLE",
  ORDER_ASSIGN_DRIVER: "ORDER_ASSIGN_DRIVER",
  ORDER_CONFIRM_DELIVERY: "ORDER_CONFIRM_DELIVERY",
  ORDER_CANCEL: "ORDER_CANCEL",
  // Договоры
  CONTRACT_VIEW: "CONTRACT_VIEW",
  CONTRACT_SIGN: "CONTRACT_SIGN",
  // Документы
  DOCUMENT_VIEW: "DOCUMENT_VIEW",
  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
  DOCUMENT_DELETE: "DOCUMENT_DELETE",
  // Трекинг и чат
  TRACKING_VIEW: "TRACKING_VIEW",
  TRACKING_UPDATE: "TRACKING_UPDATE",
  CHAT_VIEW: "CHAT_VIEW",
  CHAT_SEND: "CHAT_SEND",
  // Финансы
  PAYMENT_VIEW: "PAYMENT_VIEW",
  PAYMENT_EDIT: "PAYMENT_EDIT",
  // Безопасная сделка: оформление заказчиком (обеспечение оплаты)
  SECURE_DEAL_INITIATE: "SECURE_DEAL_INITIATE",
  // Следующий рейс
  NEXT_LOAD_VIEW: "NEXT_LOAD_VIEW",
  NEXT_LOAD_PLAN: "NEXT_LOAD_PLAN",
  // Топливо (Fleet Fuel Control)
  FUEL_VIEW: "FUEL_VIEW",
  FUEL_MANAGE: "FUEL_MANAGE",
  FUEL_FINANCE_VIEW: "FUEL_FINANCE_VIEW",
  FUEL_INVESTIGATE: "FUEL_INVESTIGATE",
  FUEL_DRIVER: "FUEL_DRIVER",
  // Отзывы и споры
  REVIEW_CREATE: "REVIEW_CREATE",
  DISPUTE_CREATE: "DISPUTE_CREATE",
  // Компания
  COMPANY_VIEW: "COMPANY_VIEW",
  COMPANY_MANAGE: "COMPANY_MANAGE",
  COMPANY_MEMBERS_MANAGE: "COMPANY_MEMBERS_MANAGE",
  VEHICLE_VIEW: "VEHICLE_VIEW",
  VEHICLE_MANAGE: "VEHICLE_MANAGE",
  DRIVER_VIEW: "DRIVER_VIEW",
  DRIVER_MANAGE: "DRIVER_MANAGE",
  CARRIER_DIRECTORY_VIEW: "CARRIER_DIRECTORY_VIEW",
  // Водитель
  DRIVER_TRIP_VIEW: "DRIVER_TRIP_VIEW",
  // Администрирование
  ADMIN_USERS: "ADMIN_USERS",
  ADMIN_COMPANIES: "ADMIN_COMPANIES",
  ADMIN_ORDERS: "ADMIN_ORDERS",
  ADMIN_AUDIT: "ADMIN_AUDIT",
  ADMIN_DISPUTES: "ADMIN_DISPUTES",
  ADMIN_VERIFICATION: "ADMIN_VERIFICATION",
  ADMIN_SETTINGS: "ADMIN_SETTINGS",
  ADMIN_PAYMENTS: "ADMIN_PAYMENTS",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

const CUSTOMER_PERMISSIONS: Permission[] = [
  P.LOAD_VIEW_OWN,
  P.LOAD_CREATE,
  P.LOAD_EDIT,
  P.LOAD_PUBLISH,
  P.LOAD_CANCEL,
  P.LOAD_ANSWER_QUESTION,
  P.BID_VIEW,
  P.BID_ACCEPT,
  P.BID_REJECT,
  P.BID_COUNTER,
  P.ORDER_VIEW,
  P.ORDER_CONFIRM_DELIVERY,
  P.ORDER_CANCEL,
  P.CONTRACT_VIEW,
  P.CONTRACT_SIGN,
  P.DOCUMENT_VIEW,
  P.DOCUMENT_UPLOAD,
  P.DOCUMENT_DELETE,
  P.TRACKING_VIEW,
  P.CHAT_VIEW,
  P.CHAT_SEND,
  P.PAYMENT_VIEW,
  P.PAYMENT_EDIT,
  P.SECURE_DEAL_INITIATE,
  P.REVIEW_CREATE,
  P.DISPUTE_CREATE,
  P.COMPANY_VIEW,
  P.COMPANY_MANAGE,
  P.COMPANY_MEMBERS_MANAGE,
  P.CARRIER_DIRECTORY_VIEW,
];

const CARRIER_DISPATCHER_PERMISSIONS: Permission[] = [
  P.MARKETPLACE_VIEW,
  P.LOAD_ASK_QUESTION,
  P.BID_CREATE,
  P.BID_WITHDRAW,
  P.ORDER_VIEW,
  P.ORDER_STATUS_UPDATE,
  P.ORDER_ASSIGN_VEHICLE,
  P.ORDER_ASSIGN_DRIVER,
  P.CONTRACT_VIEW,
  P.DOCUMENT_VIEW,
  P.DOCUMENT_UPLOAD,
  P.DOCUMENT_DELETE,
  P.TRACKING_VIEW,
  P.TRACKING_UPDATE,
  P.CHAT_VIEW,
  P.CHAT_SEND,
  P.PAYMENT_VIEW,
  P.REVIEW_CREATE,
  P.DISPUTE_CREATE,
  P.COMPANY_VIEW,
  P.VEHICLE_VIEW,
  P.VEHICLE_MANAGE,
  P.DRIVER_VIEW,
  P.DRIVER_MANAGE,
  P.NEXT_LOAD_VIEW,
  P.NEXT_LOAD_PLAN,
  P.FUEL_VIEW,
  P.FUEL_INVESTIGATE,
];

export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  SHIPPER: CUSTOMER_PERMISSIONS,
  FORWARDER: [...CUSTOMER_PERMISSIONS, P.MARKETPLACE_VIEW],
  CARRIER_ADMIN: [
    ...CARRIER_DISPATCHER_PERMISSIONS,
    P.CONTRACT_SIGN,
    P.ORDER_CANCEL,
    P.PAYMENT_EDIT,
    // Владелец автопарка: карты, лимиты, нормы, топливный счёт
    P.FUEL_MANAGE,
    P.FUEL_FINANCE_VIEW,
    P.COMPANY_MANAGE,
    P.COMPANY_MEMBERS_MANAGE,
  ],
  CARRIER_DISPATCHER: CARRIER_DISPATCHER_PERMISSIONS,
  DRIVER: [
    P.DRIVER_TRIP_VIEW,
    // Водитель может указать, куда планирует ехать после доставки (только для своего автомобиля)
    P.NEXT_LOAD_PLAN,
    // Своя машина и своя топливная карта — без финансов компании
    P.FUEL_DRIVER,
    P.ORDER_STATUS_UPDATE,
    P.TRACKING_UPDATE,
    P.TRACKING_VIEW,
    P.DOCUMENT_VIEW,
    P.DOCUMENT_UPLOAD,
    P.CHAT_VIEW,
    P.CHAT_SEND,
  ],
};

export const ADMIN_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/** Какие роли участников допустимы для каждого типа компании. */
export const ROLES_BY_COMPANY_TYPE: Record<CompanyType, MemberRole[]> = {
  SHIPPER: ["SHIPPER"],
  FORWARDER: ["FORWARDER"],
  CARRIER: ["CARRIER_ADMIN", "CARRIER_DISPATCHER", "DRIVER"],
};

export function permissionsForRole(role: MemberRole | null | undefined, isPlatformAdmin = false): Set<Permission> {
  if (isPlatformAdmin) return new Set(ADMIN_PERMISSIONS);
  if (!role) return new Set();
  return new Set(ROLE_PERMISSIONS[role]);
}

export function roleHasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const isCustomerRole = (role: MemberRole | null | undefined) => role === "SHIPPER" || role === "FORWARDER";
export const isCarrierRole = (role: MemberRole | null | undefined) => role === "CARRIER_ADMIN" || role === "CARRIER_DISPATCHER";
export const isDriverRole = (role: MemberRole | null | undefined) => role === "DRIVER";
