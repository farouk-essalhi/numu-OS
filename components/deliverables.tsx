"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpDown, Check, ChevronDown, Hourglass, Lock, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
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
// Status menu: change a status right from a list
// ---------------------------------------------------------------------------

/**
 * The status pill as a button: opens a small menu with the steps this type
 * can take. Steps you can't take (sign-off, "tasks are to do or done") are
 * shown greyed with the reason. Rendered in a portal so tables don't clip it.
 */
export function StatusMenu({ row }: { row: BoardRow }) {
  const { me, move, notify } = useNumu();
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const open = at !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const flow = flowFor(row.deliverable_type);
  const steps = flow.includes(row.status) ? flow : [...flow, row.status].sort((a, b) => statusIndex(a) - statusIndex(b));

  function toggle(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) return setAt(null);
    const r = btn.current!.getBoundingClientRect();
    const up = r.bottom + 320 > window.innerHeight;
    setAt({ x: Math.min(r.left, window.innerWidth - 236), y: up ? r.top - 6 : r.bottom + 6, up });
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change status"
        className="group/status inline-flex items-center rounded-md outline-offset-2"
      >
        <StatusPill status={row.status} className="pr-1.5 group-hover/status:border-line-strong group-hover/status:bg-surface-2" />
        <ChevronDown className="-ml-5 size-3 text-faint opacity-0 transition-opacity group-hover/status:opacity-100" aria-hidden />
      </button>
      {open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close"
                className="fixed inset-0 z-[70] cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  setAt(null);
                }}
              />
              <div
                role="menu"
                className="toast-in fixed z-[71] w-[228px] rounded-xl border border-line bg-surface p-1 shadow-lg"
                style={{ left: at.x, top: at.up ? undefined : at.y, bottom: at.up ? window.innerHeight - at.y : undefined }}
                onClick={(e) => e.stopPropagation()}
              >
                {steps.map((s) => {
                  const check = s === row.status ? null : canMove(me, row.status, s, row.deliverable_type);
                  const blocked = check && !check.ok ? check.reason : null;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="menuitem"
                      disabled={s === row.status || Boolean(blocked)}
                      title={blocked ?? undefined}
                      onClick={() => {
                        setAt(null);
                        const r = move(row.id, s);
                        if (!r.ok) notify(r.reason, "error");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]",
                        s === row.status ? "bg-surface-3 font-medium" : blocked ? "cursor-not-allowed text-faint" : "hover:bg-surface-2",
                      )}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_META[s].color, opacity: blocked ? 0.4 : 1 }} />
                      <span className="flex-1">{STATUS_META[s].en}</span>
                      {s === row.status ? <Check className="size-3.5" /> : blocked ? <Lock className="size-3" /> : null}
                    </button>
                  );
                })}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Table (desktop) + cards (phone)
// ---------------------------------------------------------------------------

/** Selecting rows (e.g. to delete them): the chosen ids and how to change them. */
export interface Selection {
  ids: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
}

type SortKey = "title" | "client" | "owner" | "status" | "due" | "post";

export function DeliverableTable({
  rows,
  today,
  showClient = true,
  showOwner = true,
  quickMove = false,
  empty = "Nothing here.",
  selection,
}: {
  rows: BoardRow[];
  today: IsoDate;
  showClient?: boolean;
  showOwner?: boolean;
  quickMove?: boolean;
  empty?: string;
  /** When set, rows show checkboxes and a click selects instead of opening. */
  selection?: Selection;
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
  const allOn = Boolean(selection) && sorted.every((r) => selection!.ids.has(r.id));
  const open = (id: string) => (selection ? selection.toggle(id) : router.push(`/deliverables/${id}`));
  return (
    <>
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead className="border-b border-line bg-surface-2 text-[12px] text-muted">
            <tr>
              {selection ? (
                <th scope="col" className="w-10 py-2.5 pl-4 sm:pl-5">
                  <SelectBox
                    checked={allOn}
                    label={allOn ? "Unselect all" : "Select all"}
                    onChange={() => selection.setMany(sorted.map((r) => r.id), !allOn)}
                  />
                </th>
              ) : null}
              <SortHeader {...th} k="title" className={selection ? "pl-2" : "pl-4 sm:pl-5"}>Task</SortHeader>
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
                onClick={() => open(r.id)}
                aria-selected={selection ? selection.ids.has(r.id) : undefined}
                className={cn("cursor-pointer transition-colors hover:bg-surface-2", selection?.ids.has(r.id) && "bg-surface-2")}
              >
                {selection ? (
                  <td className="py-2.5 pl-4 sm:pl-5">
                    <SelectBox checked={selection.ids.has(r.id)} label={`Select ${r.title}`} onChange={() => selection.toggle(r.id)} />
                  </td>
                ) : null}
                <td className={cn("max-w-[280px] py-2.5 pr-3", selection ? "pl-2" : "pl-4 sm:pl-5")}>
                  {selection ? (
                    <span className="block truncate font-medium text-ink">{r.title}</span>
                  ) : (
                    <Link href={`/deliverables/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:underline">
                      {r.title}
                    </Link>
                  )}
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
                <td className="px-3">{selection ? <StatusPill status={r.status} /> : <StatusMenu row={r} />}</td>
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
            <Link
              href={`/deliverables/${r.id}`}
              onClick={(e) => {
                if (!selection) return;
                e.preventDefault();
                selection.toggle(r.id);
              }}
              className={cn("block px-4 py-3 active:bg-surface-2", selection?.ids.has(r.id) && "bg-surface-2")}
            >
              <div className="flex items-start justify-between gap-3">
                {selection ? (
                  <SelectBox checked={selection.ids.has(r.id)} label={`Select ${r.title}`} onChange={() => selection.toggle(r.id)} className="mt-0.5" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{r.title}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {showClient ? `${r.client.name_en} · ` : ""}
                    {typeLine(r)}
                  </p>
                </div>
                {showOwner && r.owner ? <Avatar name={r.owner.full_name} size={24} /> : null}
              </div>
              <div className={cn("mt-2 flex flex-wrap items-center gap-1.5", selection && "pl-8")}>
                {selection ? <StatusPill status={r.status} /> : <StatusMenu row={r} />}
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

/** A round checkbox used for selecting tasks. */
export function SelectBox({ checked, onChange, label, className }: { checked: boolean; onChange: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-150",
        checked ? "scale-105 border-primary bg-primary text-primary-ink" : "border-line-strong bg-surface hover:border-ink-2",
        className,
      )}
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}

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
