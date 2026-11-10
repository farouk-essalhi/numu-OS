"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpDown, Check, ChevronDown, ChevronRight, Hourglass, Lock, RotateCcw, TriangleAlert } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { daysBetween, formatHours, formatRelative, formatShort } from "@/lib/dates";
import { cn, firstName, PLATFORM_LABEL } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { taskHref } from "@/lib/routes";
import type { BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableStatus, IsoDate } from "@/lib/types";
import { canMove, flowFor, isDone, isTaskType, nextStatus, STATUS_META, statusIndex, type MoveResult } from "@/lib/workflow";
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
  // Subtasks say what they're part of; big tasks say how far along they are.
  if (row.parent) return `↳ ${row.parent.title}`;
  const base = [row.type.name_en, row.platform ? PLATFORM_LABEL[row.platform] : null].filter(Boolean).join(" · ");
  return row.progress.total ? `${base} · ${row.progress.done}/${row.progress.total} subtasks` : base;
}

// ---------------------------------------------------------------------------
// Moving work: with "Undo", and ticking tasks off
// ---------------------------------------------------------------------------

/**
 * Move a card and offer to take it back. No "Undo" where taking it back isn't
 * a clean reversal: into or out of Client review (that counts revisions) and
 * Posted (that stamps the date).
 */
export function useMove() {
  const { me, move, notify } = useNumu();
  return useCallback(
    (row: BoardRow, to: DeliverableStatus): MoveResult => {
      const from = row.status;
      const r = move(row.id, to);
      if (!r.ok) return r;
      const clean = ![from, to].includes("client_review") && ![from, to].includes("posted") && canMove(me, to, from, row.deliverable_type).ok;
      if (clean) {
        notify(to === "done" ? "Done. Nice" : `Moved to ${STATUS_META[to].en}`, "success", {
          label: "Undo",
          run: () => {
            const back = move(row.id, from);
            if (!back.ok) notify(back.reason, "error");
          },
        });
      }
      return r;
    },
    [me, move, notify],
  );
}

/** Tick a task off (or reopen it). A big task waits for its subtasks. */
export function useToggleDone() {
  const { notify } = useNumu();
  const moveIt = useMove();
  return useCallback(
    (row: BoardRow): boolean => {
      const to: DeliverableStatus = row.status === "done" ? "planned" : "done";
      const open = row.subtasks.filter((s) => !isDone(s.status)).length;
      if (to === "done" && open) {
        notify(`${open} of its subtasks ${open === 1 ? "is" : "are"} still open`, "error", { label: "Open", href: taskHref(row.id) });
        return false;
      }
      const r = moveIt(row, to);
      if (!r.ok) notify(r.reason, "error");
      return r.ok;
    },
    [moveIt, notify],
  );
}

/** The round tick in front of a task. Content deliverables don't get one: they move through their steps. */
export function TaskTick({ row, className, onDone }: { row: BoardRow; className?: string; onDone?: (done: boolean) => void }) {
  const toggle = useToggleDone();
  const done = row.status === "done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen ${row.title}` : `Mark ${row.title} done`}
      title={done ? "Done. Click to reopen" : "Mark done"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (toggle(row)) onDone?.(!done);
      }}
      className={cn(
        "group/tick relative grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150 before:absolute before:-inset-2",
        done ? "border-[var(--good)] bg-[var(--good)] text-white" : "border-line-strong bg-surface text-ink-2 hover:border-[var(--good)]",
        className,
      )}
    >
      <Check className={cn("size-3", !done && "opacity-0 transition-opacity group-hover/tick:opacity-50")} strokeWidth={3} />
    </button>
  );
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
  const { me, notify } = useNumu();
  const moveIt = useMove();
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
        className="group/status relative inline-flex shrink-0 items-center rounded-md outline-offset-2"
      >
        <StatusPill status={row.status} className="pr-6 group-hover/status:border-line-strong group-hover/status:bg-surface-2" />
        <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-faint transition-colors group-hover/status:text-ink-2" aria-hidden />
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
                        const r = moveIt(row, s);
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
// Table (desktop) or cards (phone), optionally in groups
// ---------------------------------------------------------------------------

/** Selecting rows (e.g. to delete them): the chosen ids and how to change them. */
export interface Selection {
  ids: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
}

/** A titled section of a list ("Late", "This week", a status, a person). */
export interface RowGroup {
  key: string;
  title: string;
  rows: BoardRow[];
  /** A dot in this colour before the title (statuses). */
  color?: string;
  avatar?: string;
  tone?: "critical";
  /** Starts folded (e.g. Done). */
  collapsed?: boolean;
  /** Shown instead of rows when the group is empty; without it an empty group is hidden. */
  empty?: string;
}

type SortKey = "title" | "client" | "owner" | "status" | "due" | "post";

const sortValue = (r: BoardRow, key: SortKey): string | number => {
  switch (key) {
    case "title": return r.title;
    case "client": return r.client.name_en;
    case "owner": return r.owner?.full_name ?? "~";
    case "status": return statusIndex(r.status);
    case "post": return r.post_date ?? "9999";
    default: return r.due_date;
  }
};

export function DeliverableTable({
  rows,
  groups,
  today,
  showClient = true,
  showOwner = true,
  quickMove = false,
  empty = "Nothing here.",
  selection,
  limit,
}: {
  /** A flat list… */
  rows?: BoardRow[];
  /** …or titled groups, each of which folds. */
  groups?: RowGroup[];
  today: IsoDate;
  showClient?: boolean;
  showOwner?: boolean;
  quickMove?: boolean;
  empty?: string;
  /** When set, rows show checkboxes and a click selects instead of opening. */
  selection?: Selection;
  /** How many rows to draw before "Show more" (per group). */
  limit?: number;
}) {
  const router = useRouter();
  // One layout is drawn, not both: half the work on every change.
  const desktop = useMediaQuery("(min-width: 768px)");
  const [sort, setSort] = useState<Sort>({ key: "due", dir: 1 });
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, number>>({});

  const grouped = Boolean(groups);
  const step = limit ?? (grouped ? (desktop ? 25 : 8) : desktop ? 100 : 30);

  const sections = useMemo(() => {
    const list: RowGroup[] = groups ?? [{ key: "all", title: "", rows: rows ?? [] }];
    return list
      .filter((g) => g.rows.length > 0 || g.empty)
      .map((g) => ({
        ...g,
        rows: [...g.rows].sort((a, b) => {
          const x = sortValue(a, sort.key);
          const y = sortValue(b, sort.key);
          return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.due_date.localeCompare(b.due_date);
        }),
      }));
  }, [groups, rows, sort]);

  const total = sections.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0 && !sections.some((g) => g.empty)) return <Empty>{empty}</Empty>;

  const isFolded = (g: RowGroup) => folded[g.key] ?? Boolean(g.collapsed);
  // A few rows past the limit are simply shown: "Show 2 more" is a wasted tap.
  const cut = (g: RowGroup) => {
    const n = more[g.key] ?? step;
    return g.rows.length - n <= 3 ? g.rows.length : n;
  };
  const shownOf = (g: RowGroup) => (isFolded(g) ? [] : g.rows.slice(0, cut(g)));
  const restOf = (g: RowGroup) => (isFolded(g) ? 0 : g.rows.length - cut(g));
  const showMore = (g: RowGroup) => setMore((m) => ({ ...m, [g.key]: (m[g.key] ?? step) + (grouped ? 50 : 100) }));
  const fold = (g: RowGroup) => setFolded((f) => ({ ...f, [g.key]: !isFolded(g) }));

  const allIds = sections.flatMap((g) => g.rows.map((r) => r.id));
  const allOn = Boolean(selection) && allIds.length > 0 && allIds.every((id) => selection!.ids.has(id));
  const open = (id: string) => (selection ? selection.toggle(id) : router.push(taskHref(id)));
  const th = { sort, setSort };
  const colCount = 5 + (showClient ? 1 : 0) + (showOwner ? 1 : 0) + 1;

  const groupLabel = (g: RowGroup): ReactNode => (
    <>
      {isFolded(g) ? <ChevronRight className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
      {g.color ? <span className="size-2 rounded-full" style={{ background: g.color }} /> : null}
      {g.avatar ? <Avatar name={g.avatar} size={20} /> : null}
      <span className={cn("font-semibold", g.tone === "critical" && g.rows.length > 0 && "text-critical")}>{g.title}</span>
      <span className="font-normal text-muted num">{g.rows.length}</span>
    </>
  );

  if (desktop) {
    return (
      // `relative` keeps the screen-reader-only labels inside the scrolling area
      // (otherwise they widen the whole page on narrow screens).
      <div className="scroll-thin relative overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead className="border-b border-line bg-surface-2 text-[12px] text-muted">
            <tr>
              <th scope="col" className="w-10 py-2.5 pl-4 sm:pl-5">
                {selection ? (
                  <SelectBox checked={allOn} label={allOn ? "Unselect all" : "Select all"} onChange={() => selection.setMany(allIds, !allOn)} />
                ) : (
                  <span className="sr-only">Done</span>
                )}
              </th>
              <SortHeader {...th} k="title" className="pl-1">Task</SortHeader>
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
          {sections.map((g) => (
            <tbody key={g.key} className="divide-y divide-line border-b border-line last:border-b-0">
              {grouped ? (
                <tr className="bg-surface-2/60">
                  <th colSpan={colCount} scope="rowgroup" className="p-0 text-left">
                    <button
                      type="button"
                      onClick={() => fold(g)}
                      aria-expanded={!isFolded(g)}
                      className="flex h-9 w-full items-center gap-2 px-4 text-[12.5px] hover:bg-surface-2 sm:px-5"
                    >
                      {groupLabel(g)}
                    </button>
                  </th>
                </tr>
              ) : null}
              {!isFolded(g) && g.rows.length === 0 && g.empty ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-4 text-[13px] text-muted">
                    {g.empty}
                  </td>
                </tr>
              ) : null}
              {shownOf(g).map((r) => {
                const task = isTaskType(r.deliverable_type);
                const done = isDone(r.status);
                return (
                  <tr
                    key={r.id}
                    onClick={() => open(r.id)}
                    aria-selected={selection ? selection.ids.has(r.id) : undefined}
                    className={cn("cursor-pointer transition-colors hover:bg-surface-2", selection?.ids.has(r.id) && "bg-surface-2")}
                  >
                    <td className="py-2.5 pl-4 sm:pl-5">
                      {selection ? (
                        <SelectBox checked={selection.ids.has(r.id)} label={`Select ${r.title}`} onChange={() => selection.toggle(r.id)} />
                      ) : task ? (
                        <TaskTick row={r} />
                      ) : (
                        <span className="grid size-5 place-items-center" title={STATUS_META[r.status].en}>
                          <span className="size-2 rounded-full" style={{ background: STATUS_META[r.status].color }} />
                        </span>
                      )}
                    </td>
                    <td className="max-w-[300px] py-2.5 pr-3 pl-1">
                      {selection ? (
                        <span className="block truncate font-medium text-ink">{r.title}</span>
                      ) : (
                        <Link
                          href={taskHref(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={cn("block truncate font-medium hover:underline", task && done ? "text-muted line-through decoration-line-strong" : "text-ink")}
                        >
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
                );
              })}
              {restOf(g) > 0 ? (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <ShowMore count={restOf(g)} onClick={() => showMore(g)} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          ))}
        </table>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {sections.map((g) => (
        <Fragment key={g.key}>
          {grouped ? (
            <button
              type="button"
              onClick={() => fold(g)}
              aria-expanded={!isFolded(g)}
              className="flex h-11 w-full items-center gap-2 bg-surface-2/60 px-4 text-[13px] active:bg-surface-2"
            >
              {groupLabel(g)}
            </button>
          ) : null}
          {!isFolded(g) && g.rows.length === 0 && g.empty ? <p className="px-4 py-4 text-[13px] text-muted">{g.empty}</p> : null}
          {shownOf(g).length ? (
            <ul className="divide-y divide-line">
              {shownOf(g).map((r) => {
                const task = isTaskType(r.deliverable_type);
                const done = isDone(r.status);
                return (
                  <li key={r.id}>
                    <Link
                      href={taskHref(r.id)}
                      onClick={(e) => {
                        if (!selection) return;
                        e.preventDefault();
                        selection.toggle(r.id);
                      }}
                      className={cn("flex items-start gap-3 px-4 py-3 active:bg-surface-2", selection?.ids.has(r.id) && "bg-surface-2")}
                    >
                      {selection ? (
                        <SelectBox checked={selection.ids.has(r.id)} label={`Select ${r.title}`} onChange={() => selection.toggle(r.id)} className="mt-0.5" />
                      ) : task ? (
                        <TaskTick row={r} className="mt-0.5" />
                      ) : (
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center" aria-hidden>
                          <span className="size-2 rounded-full" style={{ background: STATUS_META[r.status].color }} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={cn("truncate text-[14px] font-medium", task && done && "text-muted line-through decoration-line-strong")}>{r.title}</p>
                            <p className="truncate text-[12.5px] text-muted">
                              {showClient ? `${r.client.name_en} · ` : ""}
                              {typeLine(r)}
                            </p>
                          </div>
                          {showOwner && r.owner ? <Avatar name={r.owner.full_name} size={24} /> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {selection ? <StatusPill status={r.status} /> : <StatusMenu row={r} />}
                          <span className={cn("text-[12.5px] num", r.flags.overdue ? "font-medium text-critical" : "text-muted")}>
                            Due {formatRelative(r.due_date, today)}
                          </span>
                          <FlagPills row={r} today={today} />
                          {quickMove && !selection ? <QuickMove row={r} /> : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {restOf(g) > 0 ? <ShowMore count={restOf(g)} onClick={() => showMore(g)} /> : null}
        </Fragment>
      ))}
    </div>
  );
}

function ShowMore({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-10 w-full items-center justify-center gap-1.5 text-[12.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
      Show {count} more
      <ChevronDown className="size-3.5" />
    </button>
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

/** One-click "move to the next step" for content in My work. */
export function QuickMove({ row }: { row: BoardRow }) {
  const { me } = useNumu();
  const moveIt = useMove();
  const [error, setError] = useState<string | null>(null);
  // Tasks are ticked off instead (the round tick in front of them).
  const next = isTaskType(row.deliverable_type) ? null : nextStatus(row.deliverable_type, row.status);
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
        const r = moveIt(row, next);
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
