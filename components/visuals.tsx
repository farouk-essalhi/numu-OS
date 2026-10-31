"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { dayNumber, formatShort, weekdayShort } from "@/lib/dates";
import { cn } from "@/lib/format";
import type { DeliverableStatus, IsoDate } from "@/lib/types";
import { STATUSES, STATUS_META, statusIndex } from "@/lib/workflow";

/** The one big number on a screen, in dot-matrix numerals (screenshot 1). */
export function DotNumber({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-dot leading-none font-black tracking-[0.04em] text-ink/85 uppercase", className)}>
      {children}
    </span>
  );
}

/** Posting activity grid (screenshots 2 and 3): weeks across, Sun-Sat down. */
export function Heatmap({
  cells,
  cell = 10,
  gap = 3,
  className,
}: {
  cells: { day: IsoDate; count: number }[];
  cell?: number;
  gap?: number;
  className?: string;
}) {
  const weeks = Math.ceil(cells.length / 7);
  const level = (n: number) => (n < 0 ? "transparent" : n === 0 ? "var(--heat-0)" : n === 1 ? "var(--heat-1)" : n <= 3 ? "var(--heat-2)" : "var(--heat-3)");
  return (
    <div
      role="img"
      aria-label="Deliverables posted per day"
      className={cn("grid grid-flow-col", className)}
      style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, gap }}
    >
      {cells.map((c) => (
        <span
          key={c.day}
          title={c.count >= 0 ? `${formatShort(c.day)}: ${c.count} posted` : undefined}
          className={cn("rounded-[2px]", c.count < 0 && "border border-dashed border-line")}
          style={{ background: level(c.count) }}
        />
      ))}
    </div>
  );
}

export type OrbState = "done" | "today" | "planned" | "late" | "empty";

/** Glass orb for one day of the week tracker (screenshot 1). */
export function Orb({ state, size = 38 }: { state: OrbState; size?: number }) {
  if (state === "empty") {
    return <span className="block rounded-full border-[1.5px] border-dashed border-faint" style={{ width: size, height: size }} />;
  }
  const color = state === "done" ? "orb-green" : state === "planned" ? "orb-lavender" : "orb-amber";
  return (
    <span className={cn("orb relative grid place-items-center rounded-full", color)} style={{ width: size, height: size }}>
      {state === "done" ? <Check className="size-4 text-white drop-shadow" strokeWidth={3} /> : null}
      {state === "today" ? <span className="size-2 rounded-full bg-white/90 shadow" /> : null}
      {state === "late" ? <span className="text-[13px] font-bold text-white drop-shadow">!</span> : null}
    </span>
  );
}

export function WeekOrbs({
  days,
  today,
}: {
  days: { day: IsoDate; total: number; done: number }[];
  today: IsoDate;
}) {
  return (
    <div className="flex justify-between">
      {days.map(({ day, total, done }) => {
        const state: OrbState =
          total === 0 ? "empty" : done === total ? "done" : day === today ? "today" : day < today ? "late" : "planned";
        return (
          <div key={day} className="flex flex-col items-center gap-2">
            <Orb state={state} />
            <span className={cn("text-[12px]", day === today ? "font-semibold text-ink" : "text-muted")}>
              {weekdayShort(day)[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The status ruler (screenshot 1's breathing scale): nine statuses as major
 * ticks with minor ticks between, a marker on the current one.
 */
export function StatusRuler({ status, className }: { status: DeliverableStatus; className?: string }) {
  const current = statusIndex(status);
  const minor = 4;
  const ticks = (STATUSES.length - 1) * (minor + 1) + 1;
  const markerAt = current * (minor + 1);
  return (
    <div className={className}>
      <div className="flex h-7 items-end justify-between" aria-hidden>
        {Array.from({ length: ticks }, (_, i) => {
          const major = i % (minor + 1) === 0;
          const isMarker = i === markerAt;
          return (
            <span
              key={i}
              className={cn(
                "w-px rounded-full",
                isMarker ? "h-7 w-[3px] bg-ink" : major ? "h-4" : "h-2.5",
                !isMarker && (i < markerAt ? "bg-ink/45" : "bg-ink/15"),
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-muted">
        <span>Make</span>
        <span>Review</span>
        <span>Live</span>
      </div>
      <p className="sr-only">
        Status: {STATUS_META[status].en}, step {current + 1} of {STATUSES.length}
      </p>
    </div>
  );
}

/** Mini bar chart for a client card (screenshot 2's project chart). */
export function TypeBars({ bars }: { bars: { name: string; pct: number }[] }) {
  const best = bars.reduce((m, b, i) => (b.pct > bars[m].pct ? i : m), 0);
  return (
    <div className="flex h-[104px] items-end justify-center gap-3 rounded-[18px] bg-inset px-4 pt-3 pb-0">
      {bars.slice(0, 4).map((b, i) => (
        <div key={b.name} className="flex w-9 flex-col items-center gap-1" title={`${b.name}: ${b.pct}% done`}>
          <span className="text-[11px] font-medium text-ink-2">{b.pct}%</span>
          <div className="relative h-[68px] w-full overflow-hidden rounded-t-[8px] bg-raised/60">
            <div
              className={cn("absolute inset-x-0 bottom-0 rounded-t-[8px]", i === best ? "bg-primary" : "hatch bg-raised")}
              style={{ height: `${Math.max(8, b.pct)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DayCircle({ day, selected, today }: { day: IsoDate; selected: boolean; today: boolean }) {
  return (
    <span
      className={cn(
        "grid h-14 w-11 place-items-center rounded-[16px] text-[15px] transition",
        selected ? "bg-raised font-semibold shadow-card" : "text-ink-2",
        today && !selected && "font-semibold text-accent",
      )}
    >
      {dayNumber(day)}
    </span>
  );
}
