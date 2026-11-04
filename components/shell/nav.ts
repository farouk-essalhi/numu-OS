import {
  BarChart3,
  Building2,
  CalendarDays,
  CircleCheckBig,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Settings,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "mine" | "approvals";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
  /** Hidden for creators (e.g. pages about fees). */
  leadsOnly?: boolean;
}

export const NAV: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/my-work", label: "My work", icon: ListChecks, badge: "mine" },
      { href: "/approvals", label: "Approvals", icon: CircleCheckBig, badge: "approvals" },
    ],
  },
  {
    title: "Production",
    items: [
      { href: "/deliverables", label: "Tasks", icon: SquareKanban },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Clients",
    items: [
      { href: "/clients", label: "Clients", icon: Building2 },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, leadsOnly: true },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/team", label: "Capacity", icon: Users },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Bottom tab bar on phones. */
export const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/my-work", label: "My work", icon: ListChecks, badge: "mine" },
  { href: "/deliverables", label: "Board", icon: SquareKanban },
  { href: "/approvals", label: "Approvals", icon: CircleCheckBig, badge: "approvals" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function titleFor(pathname: string): string {
  for (const group of NAV) for (const item of group.items) if (isActive(pathname, item.href) && item.href !== "/") return item.label;
  if (pathname.startsWith("/settings")) return "Settings";
  return "Overview";
}
