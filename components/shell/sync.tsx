"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { useNumu } from "@/lib/store";

/** A clock that ticks every `ms`, for "2 min ago" labels. */
function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** "Synced just now" + refresh, in the top bar. */
export function SyncButton() {
  const { sync, refresh, isDemo } = useNumu();
  const now = useTick(30_000);
  const label = `${isDemo ? "Refreshed" : "Synced"} ${ago(sync.at, Math.max(now, sync.at))}`;
  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={sync.busy}
      title={`${label}. Click to load the latest.`}
      aria-label={`${label}. Refresh`}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-muted transition-colors hover:bg-surface-3 hover:text-ink md:h-9"
    >
      <RefreshCw className={cn("size-4", sync.busy && "animate-spin")} />
      <span className="hidden xl:inline">{sync.busy ? "Syncing…" : label}</span>
    </button>
  );
}

const PULL_TRIGGER = 64;

/**
 * Pull down from the top of the page to load the latest (phones). The
 * browser's own pull-to-refresh, which reloads the whole page, is turned off
 * in globals.css. Skipped while a card is being dragged or a panel is open.
 */
export function PullToRefresh() {
  const { refresh } = useNumu();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (
        window.scrollY > 0 ||
        e.touches.length !== 1 ||
        document.body.classList.contains("is-dragging") ||
        target?.closest("[data-vaul-drawer], [role=dialog], .board-card")
      ) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        start.current = null;
        current.current = 0;
        setPull(0);
        return;
      }
      current.current = Math.min(110, dy * 0.5);
      setPull(current.current);
    };
    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      const pulled = current.current;
      current.current = 0;
      if (pulled < PULL_TRIGGER) {
        setPull(0);
        return;
      }
      setBusy(true);
      setPull(PULL_TRIGGER);
      navigator.vibrate?.(8);
      const minDelay = new Promise((r) => setTimeout(r, 600));
      await Promise.all([refresh(), minDelay]);
      setBusy(false);
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh]);

  if (pull <= 0 && !busy) return null;
  const progress = Math.min(1, pull / PULL_TRIGGER);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center md:hidden"
      style={{ transform: `translateY(${pull * 0.6}px)`, transition: busy || pull === 0 ? "transform 200ms ease-out" : undefined }}
    >
      <span
        className="grid size-9 place-items-center rounded-full border border-line bg-surface shadow-md"
        style={{ opacity: Math.max(0.3, progress) }}
      >
        <RefreshCw
          className={cn("size-4 text-ink-2", busy && "animate-spin")}
          style={busy ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </span>
      <span className="sr-only">{busy ? "Loading the latest" : progress >= 1 ? "Release to refresh" : "Pull to refresh"}</span>
    </div>
  );
}
