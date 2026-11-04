"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronDown, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/format";
import type { DeliverableStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/workflow";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const buttonClasses = (variant: Variant, size: Size, className?: string) =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-4",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[13px]",
    variant === "primary" && "bg-primary text-primary-ink shadow-sm hover:opacity-90",
    variant === "secondary" && "border border-line bg-surface text-ink shadow-sm hover:bg-surface-2",
    variant === "ghost" && "text-ink-2 hover:bg-surface-3 hover:text-ink",
    className,
  );

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink [&>svg]:size-[18px]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface shadow-sm", className)} {...props} />;
}

export function CardHeader({
  title,
  icon,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink [&>svg]:size-4 [&>svg]:text-muted">
          {icon}
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </header>
  );
}

export function CardLink({ href, children = "View all" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted hover:bg-surface-3 hover:text-ink">
      {children}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[24px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pills, badges, status
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "info";

export function Pill({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  const color =
    tone === "good"
      ? "var(--good-ink)"
      : tone === "warning"
        ? "var(--warning-ink)"
        : tone === "serious"
          ? "var(--serious-ink)"
          : tone === "critical"
            ? "var(--critical-ink)"
            : tone === "info"
              ? "var(--series-1)"
              : "var(--ink-2)";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium whitespace-nowrap [&>svg]:size-3.5",
        className,
      )}
      style={{
        color,
        background: tone === "neutral" ? "var(--surface-3)" : `color-mix(in oklab, ${color} 11%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusPill({ status, className }: { status: DeliverableStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px] font-medium whitespace-nowrap text-ink-2",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: meta.color }} />
      {meta.en}
    </span>
  );
}

export const TONE_ICON: Record<"good" | "serious" | "critical" | "warning", ReactNode> = {
  good: <CircleCheck />,
  warning: <CircleAlert />,
  serious: <CircleAlert />,
  critical: <TriangleAlert />,
};

export function CountBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold num",
        tone === "brand" ? "bg-brand text-white" : "bg-surface-3 text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

/** ▲ 12% vs last week. `goodWhen` says which direction is good news. */
export function Delta({
  value,
  goodWhen = "up",
  suffix = "%",
  label,
}: {
  value: number | null;
  goodWhen?: "up" | "down" | "neither";
  suffix?: string;
  label?: string;
}) {
  if (value === null) return <span className="text-[12.5px] text-muted">{label ? `– ${label}` : "–"}</span>;
  const good = value === 0 || goodWhen === "neither" ? null : (value > 0) === (goodWhen === "up");
  const color = good === null ? "var(--muted)" : good ? "var(--good-ink)" : "var(--critical-ink)";
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
      <span className="inline-flex items-center gap-0.5 font-medium num" style={{ color }}>
        {value > 0 ? <ArrowUpRight className="size-3.5" /> : value < 0 ? <ArrowDownRight className="size-3.5" /> : null}
        {Math.abs(value)}
        {suffix}
      </span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const AVATAR_TINTS = ["#e7dccf", "#d5e3d0", "#dcd8ef", "#f0d9c8", "#d1e0ea", "#ece2bd", "#e6d2dc"];

export function Avatar({ name, size = 24, className, square }: { name: string; size?: number; className?: string; square?: boolean }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      title={name}
      className={cn(
        "inline-grid shrink-0 place-items-center font-semibold text-[#2b2a27] ring-2 ring-surface",
        square ? "rounded-lg" : "rounded-full",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)), background: AVATAR_TINTS[h % AVATAR_TINTS.length] }}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("no-scrollbar flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-2.5 text-[13.5px] transition-colors",
              active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <CountBadge>{t.count}</CountBadge> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex h-9 items-center gap-0.5 rounded-lg border border-line bg-surface-3 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors [&>svg]:size-4",
            value === o.value ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A native select styled as a filter button (keyboard and phone friendly). */
export function SelectFilter({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <label
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface pr-2 pl-3 text-[13px] shadow-sm hover:bg-surface-2",
        value ? "text-ink" : "text-muted",
        className,
      )}
    >
      <span className="text-muted">{label}</span>
      {value ? <span className="max-w-[140px] truncate font-medium">{current?.label}</span> : null}
      <ChevronDown className="size-3.5 text-faint" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color ?? "var(--ink)" }} />
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("px-4 py-8 text-center text-[13px] text-muted", className)}>{children}</p>;
}
