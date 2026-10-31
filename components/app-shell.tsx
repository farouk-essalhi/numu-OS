"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartPie, House, Plus, SquareKanban, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { useNumu } from "@/lib/store";
import { NewDeliverableSheet } from "./new-deliverable-sheet";

const TABS = [
  { href: "/", label: "My work", icon: House },
  { href: "/pulse", label: "Pulse", icon: ChartPie },
  { href: "/board", label: "Board", icon: SquareKanban },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { role, isDemo } = useNumu();
  const [newOpen, setNewOpen] = useState(false);
  const canCreate = role !== "creator";
  // The board uses the full width on desktop (partners plan from a laptop).
  const wide = usePathname().startsWith("/board");

  return (
    <>
      {isDemo ? (
        <div className="bg-primary py-1 text-center text-[11px] font-medium tracking-wide text-primary-ink/80">
          DEMO DATA · fictional clients
        </div>
      ) : null}
      <main
        className={cn(
          "mx-auto w-full max-w-[480px] px-4 pt-[env(safe-area-inset-top)] pb-36 md:max-w-3xl",
          wide && "md:max-w-none md:px-8",
        )}
      >
        {children}
      </main>
      <BottomNav canCreate={canCreate} onNew={() => setNewOpen(true)} />
      {canCreate ? <NewDeliverableSheet open={newOpen} onOpenChange={setNewOpen} /> : null}
    </>
  );
}

function BottomNav({ canCreate, onNew }: { canCreate: boolean; onNew: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-1 rounded-full bg-[var(--nav)] p-1.5 shadow-float ring-1 ring-line backdrop-blur-xl">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "grid size-12 place-items-center rounded-full transition",
              isActive(href) ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-[21px]" strokeWidth={isActive(href) ? 2.2 : 1.8} />
          </Link>
        ))}
      </div>
      {canCreate ? (
        <button
          type="button"
          onClick={onNew}
          aria-label="New deliverable"
          className="pill-primary grid size-[60px] place-items-center rounded-full shadow-float transition active:scale-95"
        >
          <Plus className="size-6" strokeWidth={2} />
        </button>
      ) : null}
    </nav>
  );
}

/** Static first paint while the browser-only app loads. */
export function ShellSkeleton() {
  return (
    <div aria-busy className="mx-auto w-full max-w-[480px] px-4 pt-6 md:max-w-3xl">
      <div className="h-8 w-48 animate-pulse rounded-full bg-inset" />
      <div className="mt-3 h-4 w-32 animate-pulse rounded-full bg-inset" />
      <div className="mt-6 h-12 animate-pulse rounded-full bg-surface" />
      <div className="mt-5 h-56 animate-pulse rounded-[30px] bg-surface" />
      <div className="mt-5 h-28 animate-pulse rounded-[26px] bg-surface" />
    </div>
  );
}
