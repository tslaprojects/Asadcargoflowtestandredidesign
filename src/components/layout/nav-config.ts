import {
  Building2,
  ClipboardList,
  FileText,
  FolderOpen,
  Gauge,
  History,
  LayoutDashboard,
  MessageSquare,
  Package,
  PackagePlus,
  Scale,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/lib/i18n";

export type NavKind = "customer" | "forwarder" | "carrier" | "driver" | "admin" | "none";
export type NavItem = { href: string; label: string; icon: LucideIcon; primary?: boolean; badge?: "messages" };

/** Навигация по ролям (спецификация §68). */
export function navItems(kind: NavKind): NavItem[] {
  switch (kind) {
    case "customer":
      return [
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, primary: true },
        { href: "/loads", label: t("nav.myLoads"), icon: Package, primary: true },
        { href: "/orders", label: t("nav.myOrders"), icon: Truck, primary: true },
        { href: "/loads/new", label: t("nav.createLoad"), icon: PackagePlus, primary: true },
        { href: "/documents", label: t("nav.documents"), icon: FolderOpen },
        { href: "/messages", label: t("nav.messages"), icon: MessageSquare, primary: true, badge: "messages" },
        { href: "/finance", label: t("nav.finance"), icon: Wallet },
        { href: "/company", label: t("nav.company"), icon: Building2 },
      ];
    case "forwarder":
      return [
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, primary: true },
        { href: "/loads", label: t("nav.loads"), icon: Package, primary: true },
        { href: "/orders", label: t("nav.orders"), icon: Truck, primary: true },
        { href: "/carriers", label: t("nav.carriers"), icon: Users },
        { href: "/marketplace", label: t("nav.marketplace"), icon: Search },
        { href: "/documents", label: t("nav.documents"), icon: FolderOpen },
        { href: "/messages", label: t("nav.messages"), icon: MessageSquare, primary: true, badge: "messages" },
        { href: "/finance", label: t("nav.finance"), icon: Wallet, primary: true },
        { href: "/company", label: t("nav.company"), icon: Building2 },
      ];
    case "carrier":
      return [
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, primary: true },
        { href: "/marketplace", label: t("nav.marketplace"), icon: Search, primary: true },
        { href: "/orders", label: t("nav.myOrders"), icon: Truck, primary: true },
        { href: "/vehicles", label: t("nav.vehicles"), icon: ClipboardList },
        { href: "/drivers", label: t("nav.drivers"), icon: Users },
        { href: "/documents", label: t("nav.documents"), icon: FolderOpen },
        { href: "/messages", label: t("nav.messages"), icon: MessageSquare, primary: true, badge: "messages" },
        { href: "/finance", label: t("nav.finance"), icon: Wallet, primary: true },
        { href: "/company", label: t("nav.company"), icon: Building2 },
      ];
    case "driver":
      return [
        { href: "/driver", label: t("nav.myTrip"), icon: Truck, primary: true },
        { href: "/driver/history", label: t("nav.history"), icon: History, primary: true },
        { href: "/driver/profile", label: t("nav.profile"), icon: User, primary: true },
      ];
    case "admin":
      return [
        { href: "/admin", label: t("nav.adminDashboard"), icon: Gauge, primary: true },
        { href: "/admin/users", label: t("nav.adminUsers"), icon: Users, primary: true },
        { href: "/admin/companies", label: t("nav.adminCompanies"), icon: Building2, primary: true },
        { href: "/admin/loads", label: t("nav.adminLoads"), icon: Package },
        { href: "/admin/orders", label: t("nav.adminOrders"), icon: Truck, primary: true },
        { href: "/admin/disputes", label: t("nav.adminDisputes"), icon: Scale },
        { href: "/admin/documents", label: t("nav.adminDocuments"), icon: FileText },
        { href: "/admin/verification", label: t("nav.adminVerification"), icon: ShieldCheck },
        { href: "/admin/audit", label: t("nav.adminAudit"), icon: ScrollText },
        { href: "/admin/settings", label: t("nav.adminSettings"), icon: Settings },
      ];
    default:
      return [{ href: "/company/new", label: "Создать компанию", icon: Building2, primary: true }];
  }
}
