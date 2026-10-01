import {
  Building2,
  ClipboardList,
  FileText,
  FolderOpen,
  Fuel,
  Gauge,
  History,
  LayoutDashboard,
  MessageSquare,
  Package,
  PackagePlus,
  Route,
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

/** Cookie со свёрнутым/развёрнутым сайдбаром (читается сервером — без сдвига раскладки). */
export const SIDEBAR_COOKIE = "cf_sidebar";

export type NavKind = "customer" | "forwarder" | "carrier" | "driver" | "admin" | "none";
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Пункт нижнего меню на мобильном (не более 4 + «Меню»). */
  primary?: boolean;
  /** Короткая подпись для нижнего меню (≤ 10 символов). */
  short?: string;
  badge?: "messages";
  /** Группа в сайдбаре; пункты без группы — основные рабочие разделы. */
  section?: string;
};

const DOCS = "Документы и финансы";
const FLEET = "Автопарк";
const SETTINGS = "Компания";

/** Навигация по ролям (спецификация §68): сверху — ежедневная работа, ниже — справочные разделы. */
export function navItems(kind: NavKind): NavItem[] {
  switch (kind) {
    case "customer":
      return [
        { href: "/dashboard", label: t("nav.dashboard"), short: "Главная", icon: LayoutDashboard, primary: true },
        { href: "/loads", label: t("nav.myLoads"), short: "Грузы", icon: Package, primary: true },
        { href: "/orders", label: t("nav.myOrders"), short: "Перевозки", icon: Truck, primary: true },
        { href: "/loads/new", label: t("nav.createLoad"), icon: PackagePlus },
        { href: "/messages", label: t("nav.messages"), short: "Чаты", icon: MessageSquare, primary: true, badge: "messages" },
        { href: "/documents", label: t("nav.documents"), icon: FolderOpen, section: DOCS },
        { href: "/finance", label: t("nav.finance"), icon: Wallet, section: DOCS },
        { href: "/company", label: t("nav.company"), icon: Building2, section: SETTINGS },
      ];
    case "forwarder":
      return [
        { href: "/dashboard", label: t("nav.dashboard"), short: "Главная", icon: LayoutDashboard, primary: true },
        { href: "/loads", label: t("nav.loads"), short: "Грузы", icon: Package, primary: true },
        { href: "/orders", label: t("nav.orders"), short: "Перевозки", icon: Truck, primary: true },
        { href: "/marketplace", label: t("nav.marketplace"), icon: Search },
        { href: "/messages", label: t("nav.messages"), short: "Чаты", icon: MessageSquare, primary: true, badge: "messages" },
        { href: "/carriers", label: t("nav.carriers"), icon: Users, section: "Партнёры" },
        { href: "/documents", label: t("nav.documents"), icon: FolderOpen, section: DOCS },
        { href: "/finance", label: t("nav.finance"), icon: Wallet, section: DOCS },
        { href: "/company", label: t("nav.company"), icon: Building2, section: SETTINGS },
      ];
    case "carrier":
      return [
        { href: "/dashboard", label: t("nav.dashboard"), short: "Главная", icon: LayoutDashboard, primary: true },
        { href: "/marketplace", label: t("nav.marketplace"), short: "Биржа", icon: Search, primary: true },
        { href: "/orders", label: t("nav.myOrders"), short: "Перевозки", icon: Truck, primary: true },
        { href: "/next-load", label: t("nav.nextLoad"), icon: Route },
        { href: "/messages", label: t("nav.messages"), short: "Чаты", icon: MessageSquare, primary: true, badge: "messages" },
        { href: "/vehicles", label: t("nav.vehicles"), icon: ClipboardList, section: FLEET },
        { href: "/drivers", label: t("nav.drivers"), icon: Users, section: FLEET },
        { href: "/fuel", label: t("nav.fuel"), icon: Fuel, section: FLEET },
        { href: "/documents", label: t("nav.documents"), icon: FolderOpen, section: DOCS },
        { href: "/finance", label: t("nav.finance"), icon: Wallet, section: DOCS },
        { href: "/company", label: t("nav.company"), icon: Building2, section: SETTINGS },
      ];
    case "driver":
      return [
        { href: "/driver", label: t("nav.myTrip"), short: "Рейс", icon: Truck, primary: true },
        { href: "/driver/fuel", label: t("nav.fuel"), short: "Топливо", icon: Fuel, primary: true },
        { href: "/driver/history", label: t("nav.history"), short: "История", icon: History, primary: true },
        { href: "/driver/profile", label: t("nav.profile"), short: "Профиль", icon: User, primary: true },
      ];
    case "admin":
      return [
        { href: "/admin", label: t("nav.adminDashboard"), short: "Обзор", icon: Gauge, primary: true },
        { href: "/admin/orders", label: t("nav.adminOrders"), short: "Перевозки", icon: Truck, primary: true },
        { href: "/admin/loads", label: t("nav.adminLoads"), icon: Package },
        { href: "/admin/disputes", label: t("nav.adminDisputes"), short: "Споры", icon: Scale, primary: true },
        { href: "/admin/payments", label: t("nav.adminPayments"), icon: Wallet },
        {
          href: "/admin/verification",
          label: t("nav.adminVerification"),
          short: "Проверка",
          icon: ShieldCheck,
          primary: true,
          section: "Проверки",
        },
        { href: "/admin/documents", label: t("nav.adminDocuments"), icon: FileText, section: "Проверки" },
        { href: "/admin/fuel", label: t("nav.adminFuel"), icon: Fuel, section: "Проверки" },
        { href: "/admin/users", label: t("nav.adminUsers"), icon: Users, section: "Управление" },
        { href: "/admin/companies", label: t("nav.adminCompanies"), icon: Building2, section: "Управление" },
        { href: "/admin/audit", label: t("nav.adminAudit"), icon: ScrollText, section: "Управление" },
        { href: "/admin/settings", label: t("nav.adminSettings"), icon: Settings, section: "Управление" },
      ];
    default:
      return [{ href: "/company/new", label: "Создать компанию", short: "Компания", icon: Building2, primary: true }];
  }
}
