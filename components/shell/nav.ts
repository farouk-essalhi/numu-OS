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
  /** Other pages that belong under this item (its detail page). */
  also?: string[];
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
      { href: "/deliverables", label: "Tasks", icon: SquareKanban, also: ["/task"] },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Clients",
    items: [
      { href: "/clients", label: "Clients", icon: Building2, also: ["/client"] },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, leadsOnly: true },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Bottom tab bar on phones. */
export const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/my-work", label: "My work", icon: ListChecks, badge: "mine" },
  { href: "/deliverables", label: "Board", icon: SquareKanban, also: ["/task"] },
  { href: "/approvals", label: "Approvals", icon: CircleCheckBig, badge: "approvals" },
];

export function isActive(pathname: string, item: Pick<NavItem, "href" | "also">) {
  const at = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return item.href === "/" ? pathname === "/" : at(item.href) || Boolean(item.also?.some(at));
}

export function titleFor(pathname: string): string {
  for (const group of NAV) for (const item of group.items) if (item.href !== "/" && isActive(pathname, item)) return item.label;
  if (pathname.startsWith("/settings")) return "Settings";
  return "Overview";
}
