"use client";

// The sliding panel forms open in. Kept apart from the form fields
// (components/forms.tsx) so the panel's code is only downloaded when a panel
// is first needed (see components/lazy.tsx).

import { LoaderCircle, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
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
        if (!saving) onSubmit();
      }}
      // ⌘/Ctrl + Enter saves from any field (Enter alone adds a line in notes).
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
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
