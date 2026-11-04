"use client";

import { LoaderCircle, Trash2, X } from "lucide-react";
import { useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { Button, IconButton } from "./ui";

/** A panel for a form: slides in from the right on desktop, up from the bottom on phones. */
export function Sheet({
  open,
  onOpenChange,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Drawer.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-lg outline-none",
            desktop
              ? cn("inset-y-2 right-2 rounded-xl border border-line", wide ? "w-[520px]" : "w-[440px]")
              : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line",
          )}
        >
          {!desktop ? <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" /> : null}
          {open ? children : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The inside of a Sheet: title bar, scrolling fields, and a footer with
 * save (and optionally delete, which asks twice).
 */
export function SheetForm({
  title,
  description,
  onClose,
  onSubmit,
  onDelete,
  deleteLabel = "Delete",
  submitLabel = "Save",
  saving,
  error,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  submitLabel?: string;
  saving?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <Drawer.Title className="text-[16px] font-semibold">{title}</Drawer.Title>
          {description ? <Drawer.Description className="mt-0.5 text-[12.5px] text-muted">{description}</Drawer.Description> : null}
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {children}
        {error ? (
          <p role="alert" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-critical">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {onDelete ? (
          confirm ? (
            <Button variant="ghost" className="text-critical hover:text-critical" onClick={onDelete} disabled={saving}>
              <Trash2 /> Sure? {deleteLabel}
            </Button>
          ) : (
            <Button variant="ghost" className="text-muted" onClick={() => setConfirm(true)} disabled={saving}>
              <Trash2 /> {deleteLabel}
            </Button>
          )
        ) : null}
        <span className="flex-1" />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

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
