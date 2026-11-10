"use client";

// Small, dependency-free charts that follow the data-viz rules in CLAUDE.md:
// thin marks (<= 24px), 4px rounded data ends on a square baseline, a 2px
// surface gap between stacked segments, hairline recessive grid, a legend for
// two or more series, hover/focus tooltips, and a hidden table for screen readers.

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/format";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2", className)}>
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      role="status"
      style={style}
      className={cn(
        "pointer-events-none absolute z-20 min-w-[132px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const step = n <= 10 ? 2 : n <= 20 ? 5 : n <= 50 ? 10 : 20;
  return Math.ceil(n / step) * step;
}

/** Stacked columns over time (e.g. deliverables due per working day by stage). */
export function StackedColumns({
  data,
  series,
  height = 220,
  marker,
  title,
}: {
  data: { key: string; label: string; tooltipTitle: string; values: Record<string, number> }[];
  series: Series[];
  /** Pixels, or "fill" to take the height of the card it sits in. */
  height?: number | "fill";
  marker?: string;
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fill = height === "fill";
  const totals = data.map((d) => series.reduce((n, s) => n + (d.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [0, max / 2, max];
  const every = data.length > 16 ? 3 : data.length > 8 ? 2 : 1;

  return (
    <div className={cn("relative", fill && "flex min-h-[240px] flex-1 flex-col")}>
      <div className={cn("flex", fill && "min-h-0 flex-1")} style={fill ? undefined : { height }}>
        <div className="relative mr-2 w-6 shrink-0 text-right text-[11px] text-muted num">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t" style={{ top: `${100 - (t / max) * 100}%`, borderColor: t === 0 ? "var(--axis)" : "var(--grid)" }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.key}
                tabIndex={0}
                aria-label={`${d.tooltipTitle}: ${totals[i]}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={cn("relative flex h-full flex-1 items-end justify-center outline-none", hover === i && "bg-surface-3/60")}
              >
                {marker === d.key ? <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-ink/40" /> : null}
                <div className="relative flex w-[min(24px,70%)] flex-col-reverse gap-[2px]" style={{ height: `${(totals[i] / max) * 100}%` }}>
                  {series.map((s, si) => {
                    const v = d.values[s.key] ?? 0;
                    if (!v) return null;
                    const isTop = series.slice(si + 1).every((x) => !(d.values[x.key] ?? 0));
                    return (
                      <div
                        key={s.key}
                        className={isTop ? "rounded-t-[4px]" : ""}
                        style={{ flexGrow: v, flexBasis: 0, background: s.color, minHeight: 2 }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {hover !== null ? (
            <Tooltip
              className="top-1 -translate-x-1/2"
              style={{ left: `${Math.min(85, Math.max(15, ((hover + 0.5) / data.length) * 100))}%` }}
            >
              <p className="mb-1 font-medium text-ink">{data[hover].tooltipTitle}</p>
              {[...series].reverse().map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="font-medium text-ink num">{data[hover].values[s.key] ?? 0}</span>
                </p>
              ))}
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className="mt-2 ml-8 flex text-[11px] text-muted">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 text-center num">
            {i % every === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Day</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th>{d.tooltipTitle}</th>
              {series.map((s) => (
                <td key={s.key}>{d.values[s.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ring chart with a total in the middle. Pair it with a legend table. */
export function Donut({
  segments,
  total,
  label,
  size = 168,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  total: number;
  label: string;
  size?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  const lengths = segments.map((s) => (total ? (s.value / total) * c : 0));
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  const active = segments.find((s) => s.key === hover);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const dash = Math.max(0, lengths[i] - gap);
          if (s.value <= 0) return null;
          return (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.key ? stroke + 4 : stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offsets[i]}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              className="transition-[stroke-width]"
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[26px] leading-none font-semibold tracking-[-0.02em] num">{active ? active.value : total}</p>
          <p className="mt-1 text-[12px] text-muted">{active ? active.label : label}</p>
        </div>
      </div>
    </div>
  );
}

/** Thin bars for a KPI card (one series, no legend; the card title names it). */
export function Sparkbars({ values, labels, className }: { values: number[]; labels?: string[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-10 items-end gap-[3px]", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          title={labels ? `${labels[i]}: ${v}` : String(v)}
          className="w-[5px] rounded-t-[2px]"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i === values.length - 1 ? "var(--ink)" : "var(--line-strong)" }}
        />
      ))}
    </div>
  );
}

/** Single-series columns with the latest value labelled on its cap. */
export function Columns({
  data,
  max = 100,
  height = 140,
  format = (v: number) => String(v),
  title,
}: {
  data: { key: string; label: string; value: number | null; tooltip: string }[];
  max?: number;
  height?: number;
  format?: (v: number) => string;
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative">
      <div className="relative flex items-end gap-2 border-b" style={{ height, borderColor: "var(--axis)" }}>
        {[0.5, 1].map((t) => (
          <div key={t} className="absolute inset-x-0 border-t" style={{ bottom: `${t * 100}%`, borderColor: "var(--grid)" }} />
        ))}
        {data.map((d, i) => {
          const last = i === data.length - 1;
          return (
            <div
              key={d.key}
              tabIndex={0}
              aria-label={d.tooltip}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex h-full flex-1 flex-col items-center justify-end outline-none"
            >
              {d.value !== null && (last || hover === i) ? (
                <span className="mb-1 text-[11px] font-medium text-ink num">{format(d.value)}</span>
              ) : null}
              <div
                className="w-[min(24px,80%)] rounded-t-[4px]"
                style={{
                  height: d.value === null ? 2 : `${Math.max(2, (d.value / max) * 85)}%`,
                  background: d.value === null ? "var(--line)" : last ? "var(--series-1)" : "color-mix(in oklab, var(--series-1) 45%, var(--chart-surface))",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 text-[11px] text-muted">
        {data.map((d) => (
          <span key={d.key} className="flex-1 truncate text-center num">
            {d.label}
          </span>
        ))}
      </div>
      {hover !== null ? (
        <Tooltip className="top-0 left-1/2 -translate-x-1/2">
          <p className="text-ink">{data[hover].tooltip}</p>
        </Tooltip>
      ) : null}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th>{d.label}</th>
              <td>{d.value === null ? "none" : format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Days × weeks grid, one hue light -> dark for magnitude. */
export function Heatmap({
  cells,
  title,
  cell = 14,
  dayLabels = true,
}: {
  cells: { day: string; count: number; tooltip: string }[];
  title: string;
  cell?: number;
  dayLabels?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = Math.ceil(cells.length / 7);
  const max = Math.max(1, ...cells.map((c) => c.count));
  const step = (n: number) => (n < 0 ? "transparent" : n === 0 ? "var(--seq-0)" : `var(--seq-${Math.min(4, Math.ceil((n / max) * 4))})`);
  return (
    <div className="relative flex gap-2">
      {dayLabels ? (
        <div className="grid shrink-0 text-[10.5px] text-muted" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gap: 3 }}>
          {["Sun", "", "Tue", "", "Thu", "", "Sat"].map((d, i) => (
            <span key={i} className="leading-none" style={{ lineHeight: `${cell}px` }}>
              {d}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className="grid grid-flow-col"
        style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, gap: 3 }}
      >
        {cells.map((c, i) => (
          <span
            key={c.day}
            tabIndex={c.count >= 0 ? 0 : -1}
            aria-label={c.tooltip}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className={cn("rounded-[3px] outline-none", c.count < 0 && "border border-dashed border-line", hover === i && "ring-2 ring-ink/50")}
            style={{ background: step(c.count) }}
          />
        ))}
      </div>
      {hover !== null && cells[hover].count >= 0 ? (
        <Tooltip className="-top-10 right-0">
          <p className="text-ink">{cells[hover].tooltip}</p>
        </Tooltip>
      ) : null}
      <span className="sr-only">{title}</span>
    </div>
  );
}

export function HeatScale() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
      Less
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="size-2.5 rounded-[2px]" style={{ background: `var(--seq-${i})` }} />
      ))}
      More
    </span>
  );
}

/** Tick meter (booked vs available). Over capacity switches to the serious status colour. */
export function TickMeter({ value, max, ticks = 30 }: { value: number; max: number; ticks?: number }) {
  const filled = max ? Math.round((Math.min(value, max) / max) * ticks) : 0;
  const over = value > max;
  return (
    <div className="flex h-5 items-stretch gap-[2px]" aria-hidden>
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1.5px]"
          style={{ background: i < filled ? (over ? "var(--serious)" : "var(--series-1)") : "var(--surface-3)" }}
        />
      ))}
    </div>
  );
}
