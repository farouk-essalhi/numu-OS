"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/format";
import { STATUS_META } from "@/lib/workflow";
import type { DeliverableStatus } from "@/lib/types";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[26px] bg-surface shadow-card", className)} {...props} />;
}

type IconButtonProps = { label: string; children: ReactNode; className?: string } & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
);

export function IconButton({ label, children, className, href, onClick }: IconButtonProps) {
  const classes = cn(
    "grid size-10 shrink-0 place-items-center rounded-full bg-raised text-ink-2 shadow-card transition active:scale-95",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

export function PrimaryButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "pill-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function SecondaryButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-raised px-6 text-[15px] font-medium text-ink shadow-card transition active:scale-[0.98] disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  back,
  actions,
  subtitle,
}: {
  title: string;
  back?: boolean;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  const router = useRouter();
  if (back) {
    return (
      <header className="flex items-center justify-between gap-3 pt-3 pb-4">
        <IconButton label="Back" onClick={() => router.back()}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="truncate text-[17px] font-semibold">{title}</h1>
        <div className="flex min-w-10 justify-end gap-2">{actions}</div>
      </header>
    );
  }
  return (
    <header className="flex items-start justify-between gap-3 pt-4 pb-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2 pt-1">{actions}</div>
    </header>
  );
}

export function SectionHeader({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="mt-7 mb-3 flex items-baseline justify-between">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      {href ? (
        <Link href={href} className="text-[14px] text-muted hover:text-ink">
          {action ?? "See all"}
        </Link>
      ) : null}
    </div>
  );
}

const AVATAR_TINTS = ["#ead9c8", "#d6e4cc", "#ddd6f1", "#f2d6c2", "#d2e1ec", "#efe0b4", "#e6d0dc"];

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      title={name}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-[#2b2a27] ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), background: AVATAR_TINTS[h % AVATAR_TINTS.length] }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, size = 26 }: { names: string[]; size?: number }) {
  return (
    <span className="flex -space-x-2">
      {names.map((n) => (
        <Avatar key={n} name={n} size={size} />
      ))}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex rounded-full bg-inset p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 flex-1 rounded-full px-3 text-[14px] transition",
            value === o.value ? "bg-raised font-medium text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className, tone }: { value: number; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-inset", className)}>
      <div
        className={cn("h-full rounded-full", tone ? "" : "bg-primary")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }}
      />
    </div>
  );
}

export function StatusText({ status, className }: { status: DeliverableStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn(`tone-${meta.tone} inline-flex items-center gap-1.5 text-[13px] text-muted`, className)}>
      <span className="size-1.5 rounded-full" style={{ background: "var(--tone)" }} />
      {meta.en}
    </span>
  );
}

export function StatusBadge({ status }: { status: DeliverableStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`tone-${meta.tone} inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink`}
      style={{ background: "color-mix(in oklab, var(--tone) 18%, var(--raised))" }}
    >
      <span className="size-1.5 rounded-full" style={{ background: "var(--tone)" }} />
      {meta.en}
    </span>
  );
}

export function Chip({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "danger" | "accent"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
        tone === "danger" && "bg-danger/12 text-danger",
        tone === "accent" && "bg-accent/14 text-accent",
        tone === "muted" && "bg-inset text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The grey grouped rows from the "New task" sheet. */
export function InsetGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-line overflow-hidden rounded-[20px] bg-inset", className)}>{children}</div>;
}

export function InsetRow({
  icon,
  label,
  children,
  href,
  chevron,
}: {
  icon?: ReactNode;
  label: string;
  children?: ReactNode;
  href?: string;
  chevron?: boolean;
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-3 text-[15px] text-muted">
        {icon ? <span className="text-muted [&>svg]:size-[18px]">{icon}</span> : null}
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[15px] text-ink">
        {children}
        {chevron || href ? <ChevronRight className="size-4 shrink-0 text-faint" /> : null}
      </span>
    </>
  );
  const classes = "relative flex min-h-[52px] items-center justify-between gap-3 px-4";
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[22px] border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted">{children}</p>;
}
