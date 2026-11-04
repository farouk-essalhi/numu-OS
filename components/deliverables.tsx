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
  const { me, move } = useNumu();
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(row.deliverable_type, row.status);
  if (!next) return null;
  const check = canMove(me, row.status, next, row.deliverable_type);
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
