import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileSignature,
  Flag,
  Loader,
  MapPin,
  PackageCheck,
  PauseCircle,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { label, type EnumName } from "@/lib/i18n";
import { ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";
import { cn } from "@/lib/utils";

type Cfg = { tone: BadgeTone; icon: LucideIcon };

/**
 * Единый реестр визуального оформления статусов.
 * Семантика: success — завершено, warning — требует действия, info — в процессе,
 * danger — ошибка/спор/отмена, neutral — не начато. Текст метки всегда отображается.
 */
const STATUS_STYLES: Record<string, Record<string, Cfg>> = {
  OrderStatus: {
    DRAFT: { tone: "neutral", icon: CircleDashed },
    PUBLISHED: { tone: "info", icon: CircleDot },
    CARRIER_SELECTION: { tone: "warning", icon: Clock },
    CARRIER_SELECTED: { tone: "info", icon: CheckCircle2 },
    CONTRACT_PENDING: { tone: "warning", icon: FileSignature },
    CONTRACT_SIGNED: { tone: "warning", icon: FileSignature },
    VEHICLE_ASSIGNED: { tone: "warning", icon: Truck },
    DRIVER_ASSIGNED: { tone: "info", icon: User },
    WAITING_FOR_LOADING: { tone: "info", icon: Clock },
    AT_LOADING: { tone: "info", icon: MapPin },
    LOADED: { tone: "info", icon: PackageCheck },
    IN_TRANSIT: { tone: "info", icon: Truck },
    AT_BORDER: { tone: "info", icon: Flag },
    CUSTOMS: { tone: "info", icon: ShieldQuestion },
    BORDER_CLEARED: { tone: "info", icon: ShieldCheck },
    AT_DELIVERY: { tone: "info", icon: MapPin },
    DELIVERED: { tone: "warning", icon: PackageCheck },
    CLOSED: { tone: "success", icon: CheckCircle2 },
    CANCELLED: { tone: "danger", icon: Ban },
    DISPUTED: { tone: "danger", icon: AlertTriangle },
    ON_HOLD: { tone: "danger", icon: PauseCircle },
  },
  LoadStatus: {
    DRAFT: { tone: "neutral", icon: CircleDashed },
    PUBLISHED: { tone: "info", icon: CircleDot },
    BIDDING: { tone: "warning", icon: Loader },
    CARRIER_SELECTED: { tone: "success", icon: CheckCircle2 },
    CANCELLED: { tone: "danger", icon: Ban },
    CONVERTED_TO_ORDER: { tone: "success", icon: Truck },
  },
  BidStatus: {
    PENDING: { tone: "warning", icon: Clock },
    ACCEPTED: { tone: "success", icon: CheckCircle2 },
    REJECTED: { tone: "danger", icon: Ban },
    WITHDRAWN: { tone: "neutral", icon: Ban },
    EXPIRED: { tone: "neutral", icon: Clock },
  },
  ContractStatus: {
    DRAFT: { tone: "neutral", icon: CircleDashed },
    PENDING_SIGNATURES: { tone: "warning", icon: FileSignature },
    PARTIALLY_SIGNED: { tone: "warning", icon: FileSignature },
    SIGNED: { tone: "success", icon: CheckCircle2 },
    CANCELLED: { tone: "danger", icon: Ban },
  },
  VerificationStatus: {
    UNVERIFIED: { tone: "neutral", icon: ShieldQuestion },
    PENDING: { tone: "warning", icon: Clock },
    VERIFIED: { tone: "success", icon: ShieldCheck },
    REJECTED: { tone: "danger", icon: ShieldX },
    SUSPENDED: { tone: "danger", icon: Ban },
  },
  VerificationRequestStatus: {
    PENDING: { tone: "warning", icon: Clock },
    APPROVED: { tone: "success", icon: CheckCircle2 },
    REJECTED: { tone: "danger", icon: ShieldX },
    CHANGES_REQUESTED: { tone: "warning", icon: AlertTriangle },
  },
  PaymentStatus: {
    PLANNED: { tone: "neutral", icon: Clock },
    INVOICED: { tone: "warning", icon: FileSignature },
    PAID: { tone: "success", icon: CheckCircle2 },
    CANCELLED: { tone: "danger", icon: Ban },
  },
  DisputeStatus: {
    OPEN: { tone: "danger", icon: AlertTriangle },
    IN_REVIEW: { tone: "warning", icon: Loader },
    RESOLVED: { tone: "success", icon: CheckCircle2 },
    REJECTED: { tone: "neutral", icon: Ban },
  },
  VehicleStatus: {
    AVAILABLE: { tone: "success", icon: CheckCircle2 },
    ASSIGNED: { tone: "info", icon: Truck },
    INACTIVE: { tone: "neutral", icon: Ban },
    MAINTENANCE: { tone: "warning", icon: AlertTriangle },
  },
  DriverStatus: {
    ACTIVE: { tone: "success", icon: CheckCircle2 },
    INACTIVE: { tone: "neutral", icon: Ban },
    SUSPENDED: { tone: "danger", icon: Ban },
  },
  UserStatus: {
    ACTIVE: { tone: "success", icon: CheckCircle2 },
    BLOCKED: { tone: "danger", icon: Ban },
  },
  MemberStatus: {
    ACTIVE: { tone: "success", icon: CheckCircle2 },
    DISABLED: { tone: "neutral", icon: Ban },
  },
  InviteStatus: {
    PENDING: { tone: "warning", icon: Clock },
    ACCEPTED: { tone: "success", icon: CheckCircle2 },
    REVOKED: { tone: "neutral", icon: Ban },
    EXPIRED: { tone: "neutral", icon: Clock },
  },
};

export type StatusKind =
  | "OrderStatus"
  | "LoadStatus"
  | "BidStatus"
  | "ContractStatus"
  | "VerificationStatus"
  | "VerificationRequestStatus"
  | "PaymentStatus"
  | "DisputeStatus"
  | "VehicleStatus"
  | "DriverStatus"
  | "UserStatus"
  | "MemberStatus"
  | "InviteStatus";

export function statusTone(kind: StatusKind, value: string): BadgeTone {
  return STATUS_STYLES[kind]?.[value]?.tone ?? "neutral";
}

export function statusLabel(kind: StatusKind, value: string): string {
  if (kind === "OrderStatus") return ORDER_STATUS_LABELS[value as keyof typeof ORDER_STATUS_LABELS] ?? value;
  return label(kind as EnumName, value);
}

export function StatusBadge({
  kind,
  value,
  className,
  size = "sm",
  hideIcon,
}: {
  kind: StatusKind;
  value: string | null | undefined;
  className?: string;
  size?: "sm" | "lg";
  hideIcon?: boolean;
}) {
  if (!value) return null;
  const cfg = STATUS_STYLES[kind]?.[value] ?? { tone: "neutral" as const, icon: CircleDot };
  const Icon = cfg.icon;
  return (
    <Badge tone={cfg.tone} className={cn(size === "lg" && "px-3 py-1 text-sm [&_svg]:size-4", className)} data-status={value}>
      {!hideIcon && <Icon aria-hidden />}
      {statusLabel(kind, value)}
    </Badge>
  );
}
