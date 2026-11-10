"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/format";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export const control =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink shadow-sm outline-none placeholder:text-faint focus:border-focus focus:ring-2 focus:ring-focus/20 disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "h-auto min-h-[76px] py-2 leading-relaxed", className)} {...props} />;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ...props
}: Omit<ComponentProps<"select">, "onChange" | "value"> & {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cn(control, className)} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
      <span>
        <span className="block text-[13.5px]">{label}</span>
        {hint ? <span className="block text-[12px] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** "18,000" or "18000.50" -> minor units (fils); null when it isn't a number. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function moneyText(minor: number | null | undefined): string {
  if (minor == null) return "";
  const whole = minor / 100;
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(2);
}

/** Trimmed text, or null when empty. */
export const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Light check that a link is a web address. */
export function badUrl(s: string): boolean {
  return Boolean(s.trim()) && !/^https?:\/\/\S+$/i.test(s.trim());
}
