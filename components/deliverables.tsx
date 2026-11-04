"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpDown, Check, Hourglass, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { daysBetween, formatHours, formatRelative, formatShort } from "@/lib/dates";
import { cn, firstName, PLATFORM_LABEL } from "@/lib/format";
import type { BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableStatus, IsoDate } from "@/lib/types";
import { canMove, flowFor, nextStatus, STATUS_META, statusIndex } from "@/lib/workflow";
import { Avatar, Empty, Pill, StatusPill } from "./ui";

export function FlagPills({ row, today }: { row: BoardRow; today: IsoDate }) {
  return (
    <>
      {row.flags.overdue ? (
        <Pill tone="critical" icon={<TriangleAlert />}>
          {(() => {
            const ref = row.status === "approved" || row.status === "scheduled" ? row.post_date ?? row.due_date : row.due_date;
            const d = daysBetween(ref, today);
            return d > 0 ? `${d}d late` : "Late";
          })()}
        </Pill>
      ) : null}
      {row.flags.waitingOnClient && row.flags.waitingHours ? (
        <Pill tone="serious" icon={<Hourglass />}>
          {formatHours(row.flags.waitingHours)} with client
        </Pill>
      ) : null}
      {row.flags.manyRevisions ? (
        <Pill tone="warning" icon={<RotateCcw />}>
          {row.revision_count} revisions
        </Pill>
      ) : null}
    </>
  );
}

function typeLine(row: BoardRow) {
  return [row.type.name_en, row.platform ? PLATFORM_LABEL[row.platform] : null].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Table (desktop) + cards (phone)
// ---------------------------------------------------------------------------

type SortKey = "title" | "client" | "owner" | "status" | "due" | "post";

export function DeliverableTable({
  rows,
  today,
  showClient = true,
  showOwner = true,
  quickMove = false,
  empty = "Nothing here.",
}: {
  rows: BoardRow[];
  today: IsoDate;
  showClient?: boolean;
  showOwner?: boolean;
  quickMove?: boolean;
  empty?: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>({ key: "due", dir: 1 });

  const sorted = useMemo(() => {
    const val = (r: BoardRow): string | number => {
      switch (sort.key) {
        case "title": return r.title;
        case "client": return r.client.name_en;
        case "owner": return r.owner?.full_name ?? "~";
        case "status": return statusIndex(r.status);
        case "post": return r.post_date ?? "9999";
        default: return r.due_date;
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.due_date.localeCompare(b.due_date);
    });
  }, [rows, sort]);

  if (rows.length === 0) return <Empty>{empty}</Empty>;

  const th = { sort, setSort };
  return (
    <>
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead className="border-b border-line bg-surface-2 text-[12px] text-muted">
            <tr>
              <SortHeader {...th} k="title" className="pl-4 sm:pl-5">Deliverable</SortHeader>
              {showClient ? <SortHeader {...th} k="client">Client</SortHeader> : null}
              {showOwner ? <SortHeader {...th} k="owner">Owner</SortHeader> : null}
              <SortHeader {...th} k="status">Status</SortHeader>
              <SortHeader {...th} k="due">Due</SortHeader>
              <SortHeader {...th} k="post">Goes live</SortHeader>
              <th scope="col" className="px-3 py-2.5 pr-4 text-right font-medium sm:pr-5">
                <span className="sr-only">Flags and actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/deliverables/${r.id}`)}
                className="cursor-pointer transition-colors hover:bg-surface-2"
              >
                <td className="max-w-[280px] py-2.5 pr-3 pl-4 sm:pl-5">
                  <Link href={`/deliverables/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:underline">
                    {r.title}
                  </Link>
                  <span className="block truncate text-[12px] text-muted">
                    {typeLine(r)}
                    {r.project_id ? " · Campaign" : r.retainer_id && !r.scope_line_id ? " · Extra" : ""}
                  </span>
                </td>
                {showClient ? <td className="max-w-[180px] truncate px-3 text-ink-2">{r.client.name_en}</td> : null}
                {showOwner ? (
                  <td className="px-3">
                    {r.owner ? (
                      <span className="inline-flex items-center gap-2 text-ink-2">
                        <Avatar name={r.owner.full_name} size={22} />
                        {firstName(r.owner.full_name)}
                      </span>
                    ) : (
                      <span className="text-muted">Unassigned</span>
                    )}
                  </td>
                ) : null}
                <td className="px-3">
                  <StatusPill status={r.status} />
                </td>
                <td className={cn("px-3 whitespace-nowrap num", r.flags.overdue ? "font-medium text-critical" : "text-ink-2")}>
                  {formatRelative(r.due_date, today)}
                </td>
                <td className="px-3 whitespace-nowrap text-ink-2 num">{r.post_date ? formatShort(r.post_date) : <span className="text-faint">–</span>}</td>
                <td className="py-2 pr-4 pl-3 sm:pr-5">
                  <div className="flex items-center justify-end gap-1.5">
                    <FlagPills row={r} today={today} />
                    {quickMove ? <QuickMove row={r} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {sorted.map((r) => (
          <li key={r.id}>
            <Link href={`/deliverables/${r.id}`} className="block px-4 py-3 active:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{r.title}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {showClient ? `${r.client.name_en} · ` : ""}
                    {typeLine(r)}
                  </p>
                </div>
                {showOwner && r.owner ? <Avatar name={r.owner.full_name} size={24} /> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill status={r.status} />
                <span className={cn("text-[12.5px] num", r.flags.overdue ? "font-medium text-critical" : "text-muted")}>
                  Due {formatRelative(r.due_date, today)}
                </span>
                <FlagPills row={r} today={today} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

type Sort = { key: SortKey; dir: 1 | -1 };

function SortHeader({
  k,
  children,
  className,
  sort,
  setSort,
}: {
  k: SortKey;
  children: string;
  className?: string;
  sort: Sort;
  setSort: (fn: (s: Sort) => Sort) => void;
}) {
  return (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cn("px-3 py-2.5 text-left font-medium", className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}
        className={cn("inline-flex items-center gap-1 hover:text-ink", sort.key === k && "text-ink")}
      >
        {children}
        <ArrowUpDown className="size-3 opacity-60" />
      </button>
    </th>
  );
}

/** One-click "move to the next step" for rows in My work. */
export function QuickMove({ row }: { row: BoardRow }) {
  const { role, move } = useNumu();
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(row.deliverable_type, row.status);
  if (!next) return null;
  const check = canMove(role, row.status, next);
  if (!check.ok) return null;
  return (
    <button
      type="button"
      title={error ?? `Move to ${STATUS_META[next].en}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const r = move(row.id, next);
        if (!r.ok) setError(r.reason);
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[12px] font-medium text-ink-2 shadow-sm hover:bg-surface-2 hover:text-ink",
        error && "border-critical text-critical",
      )}
    >
      {STATUS_META[next].en}
      <ArrowRight className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------

export interface BoardColumn {
  key: string;
  title: string;
  color?: string;
  avatar?: string;
  rows: BoardRow[];
}

const COLUMN_LIMIT = 10;

export function KanbanBoard({ columns, today, hideClient }: { columns: BoardColumn[]; today: IsoDate; hideClient?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (columns.length === 0) return <Empty>No deliverables match these filters.</Empty>;
  return (
    <div className="scroll-thin -mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 md:snap-none">
      {columns.map((col) => {
        const points = col.rows.reduce((n, r) => n + r.effort_points, 0);
        const shown = expanded.has(col.key) ? col.rows : col.rows.slice(0, COLUMN_LIMIT);
        return (
          <section key={col.key} className="flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl border border-line bg-surface-2 sm:w-[280px]">
            <header className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                {col.color ? <span className="size-2 rounded-full" style={{ background: col.color }} /> : null}
                {col.avatar ? <Avatar name={col.avatar} size={20} /> : null}
                <span className="truncate text-[13px] font-semibold">{col.title}</span>
                <span className="text-[12px] text-muted num">{col.rows.length}</span>
              </span>
              <span className="shrink-0 text-[11.5px] text-muted num">{points} pts</span>
            </header>
            <div className="space-y-2 px-2 pb-2">
              {shown.map((r) => (
                <Link
                  key={r.id}
                  href={`/deliverables/${r.id}`}
                  className="block rounded-lg border border-line bg-surface p-3 shadow-sm transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-[13px] leading-snug font-medium">{r.title}</p>
                    {r.owner ? <Avatar name={r.owner.full_name} size={22} /> : null}
                  </div>
                  <p className="mt-1 truncate text-[12px] text-muted">{hideClient ? STATUS_META[r.status].en : r.client.name_en}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={cn("text-[12px] num", r.flags.overdue ? "font-medium text-critical" : "text-muted")}>
                      {formatRelative(r.due_date, today)}
                    </span>
                    <FlagPills row={r} today={today} />
                  </div>
                </Link>
              ))}
              {col.rows.length === 0 ? <p className="px-2 py-5 text-center text-[12px] text-faint">Empty</p> : null}
              {col.rows.length > COLUMN_LIMIT && !expanded.has(col.key) ? (
                <button
                  type="button"
                  onClick={() => setExpanded((p) => new Set(p).add(col.key))}
                  className="w-full rounded-lg py-2 text-[12.5px] font-medium text-muted hover:bg-surface-3 hover:text-ink"
                >
                  Show {col.rows.length - COLUMN_LIMIT} more
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

export function StatusStepper({ status, type }: { status: DeliverableStatus; type: BoardRow["deliverable_type"] }) {
  const flow = flowFor(type);
  const steps = flow.includes(status) ? flow : [...flow, status].sort((a, b) => statusIndex(a) - statusIndex(b));
  const current = steps.indexOf(status);
  return (
    <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto" aria-label="Workflow">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] whitespace-nowrap",
                now ? "bg-primary font-medium text-primary-ink" : done ? "bg-surface-3 text-ink-2" : "text-faint",
              )}
              aria-current={now ? "step" : undefined}
            >
              {done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full" style={{ background: now ? "currentColor" : STATUS_META[s].color }} />}
              {STATUS_META[s].en}
            </span>
            {i < steps.length - 1 ? <span className="h-px w-3 bg-line-strong" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
