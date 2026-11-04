"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronsLeft,
  LogOut,
  ChevronsRight,
  Hourglass,
  Menu,
  Moon,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { attentionItems } from "@/lib/insights";
import { ledClientIds, myWork } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { applyTheme, readTheme } from "@/lib/theme";
import { NewDeliverableSheet } from "../new-deliverable-sheet";
import { Avatar, Button, CountBadge, IconButton, Kbd } from "../ui";
import { CommandPalette } from "./command-palette";
import { isActive, MOBILE_TABS, NAV, SETTINGS_ITEM, titleFor, type BadgeKey, type NavItem } from "./nav";

const ROLE_LABEL = { partner: "Partner", account_lead: "Account lead", creator: "Creator" } as const;
const COLLAPSE_KEY = "numu.sidebar.collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const { rows, data, me, role, today, isDemo } = useNumu();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const canCreate = role !== "creator";

  const work = useMemo(() => myWork(rows, data, me.id, role, today), [rows, data, me.id, role, today]);
  const badges: Record<BadgeKey, number> = {
    mine: work.overdue.length + work.thisWeek.length,
    approvals: role === "creator" ? 0 : work.signOff.length + work.waitingOnClient.filter((r) => r.flags.waitingOnClient).length,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the phone drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  const sidebarProps = { badges, canCreate, onNew: () => setNewOpen(true), onSearch: () => setPalette(true) };

  return (
    <div className="min-h-dvh">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-sidebar md:flex",
          collapsed ? "w-[68px]" : "w-[68px] lg:w-[248px]",
        )}
      >
        <Sidebar {...sidebarProps} compact={collapsed ? "always" : "below-lg"} onToggle={toggleCollapsed} collapsed={collapsed} />
      </aside>

      {/* Phone drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-line bg-sidebar shadow-lg">
            <Sidebar {...sidebarProps} compact="never" onClose={() => setDrawer(false)} />
          </aside>
        </div>
      ) : null}

      <div className={cn("flex min-h-dvh flex-col", collapsed ? "md:pl-[68px]" : "md:pl-[68px] lg:pl-[248px]")}>
        {isDemo ? (
          <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-center text-[12px] text-muted">
            Demo data: fictional clients, held in this browser. Switch roles in Settings.
          </div>
        ) : null}
        <TopBar
          title={titleFor(pathname)}
          onMenu={() => setDrawer(true)}
          onSearch={() => setPalette(true)}
          onNew={canCreate ? () => setNewOpen(true) : undefined}
          me={me.full_name}
          role={ROLE_LABEL[role]}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-12 lg:px-8 lg:pt-7">{children}</main>
      </div>

      <MobileTabs badges={badges} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {canCreate ? <NewDeliverableSheet open={newOpen} onOpenChange={setNewOpen} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  badges,
  canCreate,
  onNew,
  onSearch,
  compact,
  onToggle,
  collapsed,
  onClose,
}: {
  badges: Record<BadgeKey, number>;
  canCreate: boolean;
  onNew: () => void;
  onSearch: () => void;
  compact: "always" | "below-lg" | "never";
  onToggle?: () => void;
  collapsed?: boolean;
  onClose?: () => void;
}) {
  const { me, role, signedIn, signOut } = useNumu();
  const pathname = usePathname();
  // Labels hide on the icon rail.
  const label = compact === "always" ? "hidden" : compact === "below-lg" ? "hidden lg:inline" : "inline";
  const block = compact === "always" ? "hidden" : compact === "below-lg" ? "hidden lg:block" : "block";
  const flex = compact === "always" ? "hidden" : compact === "below-lg" ? "hidden lg:flex" : "flex";

  const item = (it: NavItem) => {
    if (it.leadsOnly && role === "creator") return null;
    const active = isActive(pathname, it.href);
    const count = it.badge ? badges[it.badge] : 0;
    return (
      <Link
        key={it.href}
        href={it.href}
        title={it.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
          active ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
          compact === "always" && "justify-center",
          compact === "below-lg" && "justify-center lg:justify-start",
        )}
      >
        <it.icon className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-muted group-hover:text-ink")} />
        <span className={cn("flex-1 truncate", label)}>{it.label}</span>
        {count > 0 ? (
          <>
            <span className={label}>
              <CountBadge tone={it.badge === "approvals" ? "brand" : "neutral"}>{count}</CountBadge>
            </span>
            {compact !== "never" ? (
              <span className={cn("absolute top-1.5 right-1.5 size-2 rounded-full bg-brand", compact === "below-lg" && "lg:hidden")} />
            ) : null}
          </>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-3.5">
        <Logo />
        <div className={cn("min-w-0 flex-1 leading-tight", block)}>
          <p className="truncate text-[14px] font-semibold tracking-[-0.01em]">NUMU OS</p>
          <p className="truncate text-[11.5px] text-muted">Content agency · Doha</p>
        </div>
        {onClose ? (
          <IconButton label="Close menu" onClick={onClose} className="ml-auto">
            <X />
          </IconButton>
        ) : null}
      </div>

      <div className="space-y-2 px-3 pt-3">
        <button
          type="button"
          onClick={onSearch}
          title="Search (⌘K)"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-muted shadow-sm hover:text-ink",
            compact === "always" && "justify-center",
            compact === "below-lg" && "justify-center lg:justify-start",
          )}
        >
          <Search className="size-4 shrink-0" />
          <span className={cn("flex-1 text-left", label)}>Search…</span>
          <span className={cn("gap-0.5", flex)}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        {canCreate ? (
          <Button
            variant="primary"
            onClick={onNew}
            title="New deliverable"
            className={cn("w-full", compact !== "never" && "px-0", compact === "below-lg" && "lg:px-3.5")}
          >
            <Plus />
            <span className={label}>New deliverable</span>
          </Button>
        ) : null}
      </div>

      <nav aria-label="Main" className="scroll-thin flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV.map((group, i) => (
          <div key={i} className="space-y-0.5">
            {group.title ? (
              <p className={cn("px-2.5 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase", block)}>{group.title}</p>
            ) : null}
            {group.items.map(item)}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-line p-3">
        {item(SETTINGS_ITEM)}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-lg p-2 hover:bg-surface-3",
            compact === "always" && "justify-center",
            compact === "below-lg" && "justify-center lg:justify-start",
          )}
        >
          <Avatar name={me.full_name} size={30} />
          <span className={cn("min-w-0 flex-1 leading-tight", block)}>
            <span className="block truncate text-[13px] font-medium">{me.full_name}</span>
            <span className="block truncate text-[11.5px] text-muted">{ROLE_LABEL[role]}</span>
          </span>
        </Link>
        {signedIn ? (
          <button
              type="button"
              onClick={() => void signOut()}
              title="Sign out"
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-surface-3 hover:text-ink",
                compact === "always" && "justify-center",
                compact === "below-lg" && "justify-center lg:justify-start",
              )}
            >
              <LogOut className="size-4 shrink-0" />
              <span className={label}>Sign out</span>
            </button>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="hidden h-8 w-full items-center justify-center gap-2 rounded-lg text-[12px] text-muted hover:bg-surface-3 hover:text-ink lg:flex"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            <span className={label}>Collapse</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg bg-primary text-primary-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
        <circle cx="12" cy="12" r="8" fill="var(--brand)" />
        <circle cx="9.5" cy="9.5" r="2.4" fill="#fff" fillOpacity=".9" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  title,
  onMenu,
  onSearch,
  onNew,
  me,
  role,
}: {
  title: string;
  onMenu: () => void;
  onSearch: () => void;
  onNew?: () => void;
  me: string;
  role: string;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <IconButton label="Open menu" onClick={onMenu} className="md:hidden">
        <Menu />
      </IconButton>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
        <span className="hidden text-muted sm:inline">NUMU</span>
        <span className="hidden text-faint sm:inline">/</span>
        <span className="truncate font-medium">{title}</span>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-[260px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-muted shadow-sm hover:text-ink lg:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search deliverables, clients…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <IconButton label="Search" onClick={onSearch} className="lg:hidden">
          <Search />
        </IconButton>
        <ThemeToggle />
        <Notifications />
        {onNew ? (
          <IconButton label="New deliverable" onClick={onNew} className="bg-primary text-primary-ink hover:bg-primary hover:text-primary-ink hover:opacity-90 md:hidden">
            <Plus />
          </IconButton>
        ) : null}
        <Link href="/settings" className="ml-1 hidden items-center gap-2 rounded-lg py-1 pr-2 pl-1 hover:bg-surface-3 sm:flex md:hidden xl:flex" title={`${me} · ${role}`}>
          <Avatar name={me} size={28} />
        </Link>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [theme, setTheme] = useState(readTheme);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  return (
    <IconButton
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </IconButton>
  );
}

function Notifications() {
  const { rows, data, me, role, today } = useNumu();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const led = role === "creator" ? new Set<string>() : ledClientIds(data, me.id, role);
    const mine = rows.filter((r) => r.owner_id === me.id || led.has(r.client_id));
    const signOff =
      role === "creator" ? [] : rows.filter((r) => r.status === "internal_review" && led.has(r.client_id)).map((row) => ({ row, reason: "signoff" as const }));
    return [...signOff, ...attentionItems(mine)].slice(0, 12);
  }, [rows, data, me.id, role]);

  const close = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, close]);

  const icon = { signoff: <PenLine />, overdue: <TriangleAlert />, waiting: <Hourglass />, revisions: <RotateCcw /> };
  const text = { signoff: "Waiting for your sign-off", overdue: "Late", waiting: "With client over 48h", revisions: "2+ revisions" };

  return (
    <div ref={ref} className="relative">
      <IconButton label={`Notifications (${items.length})`} onClick={() => setOpen((o) => !o)}>
        <Bell />
        {items.length > 0 ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand ring-2 ring-bg" /> : null}
      </IconButton>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[13.5px] font-semibold">Needs you</p>
            <span className="text-[12px] text-muted">{items.length} items</span>
          </div>
          <ul className="scroll-thin max-h-[360px] divide-y divide-line overflow-y-auto">
            {items.length === 0 ? <li className="px-4 py-8 text-center text-[13px] text-muted">All clear.</li> : null}
            {items.map(({ row, reason }) => (
              <li key={`${reason}-${row.id}`}>
                <Link href={`/deliverables/${row.id}`} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                  <span
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg [&>svg]:size-4"
                    style={{
                      color: reason === "overdue" ? "var(--critical-ink)" : reason === "signoff" ? "var(--ink-2)" : "var(--serious-ink)",
                      background: "var(--surface-3)",
                    }}
                  >
                    {icon[reason]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{row.title}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {text[reason]} · {row.client.name_en} · due {formatRelative(row.due_date, today)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone tab bar
// ---------------------------------------------------------------------------

function MobileTabs({ badges }: { badges: Record<BadgeKey, number> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {MOBILE_TABS.map((t) => {
        const active = isActive(pathname, t.href);
        const count = t.badge ? badges[t.badge] : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-medium text-ink" : "text-muted")}
          >
            <t.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
            {t.label}
            {count > 0 ? (
              <span className="absolute top-1.5 left-[calc(50%+6px)] grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white num">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
