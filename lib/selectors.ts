// Derived views over the dataset: what each screen reads. Pure functions so
// they work the same over demo data and, later, rows from Supabase. BoardRow
// matches the deliverable_board view (names + status_changed_at + flags).

import { addDays, daysBetween, isWorkingDay, qatarDate, weekDays, weekStart } from "./dates";
import { percent } from "./format";
import { flagsFor, isDone, isOnTime, isWithTeam, statusChangedAt, type Flags } from "./workflow";
import type {
  AccessLevel,
  Client,
  Dataset,
  Deliverable,
  DeliverableType,
  IsoDate,
  StatusEvent,
  TeamMember,
} from "./types";

export interface BoardRow extends Deliverable {
  client: Client;
  type: DeliverableType;
  owner: TeamMember | null;
  statusSince: string | null;
  flags: Flags;
  /** Its subtasks, in their order (empty for most work). */
  subtasks: BoardRow[];
  /** The task this is a subtask of. */
  parent: { id: string; title: string } | null;
  /** Subtask counts: done, total and late. */
  progress: { done: number; total: number; late: number };
}

/** A task with subtasks: its effort lives in the subtasks, so capacity counts those instead. */
export function countsForCapacity(r: BoardRow): boolean {
  return r.subtasks.length === 0;
}

export function eventsByDeliverable(events: StatusEvent[]): Map<string, StatusEvent[]> {
  const map = new Map<string, StatusEvent[]>();
  for (const e of events) {
    const list = map.get(e.deliverable_id);
    if (list) list.push(e);
    else map.set(e.deliverable_id, [e]);
  }
  return map;
}

export function boardRows(data: Dataset, today: IsoDate, now: Date): BoardRow[] {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const types = new Map(data.deliverableTypes.map((t) => [t.code, t]));
  const team = new Map(data.team.map((t) => [t.id, t]));
  const events = eventsByDeliverable(data.statusEvents);
  const titles = new Map(data.deliverables.map((d) => [d.id, d.title]));
  const rows: BoardRow[] = data.deliverables.map((d) => {
    const statusSince = statusChangedAt(events.get(d.id) ?? []);
    return {
      ...d,
      client: clients.get(d.client_id)!,
      type: types.get(d.deliverable_type)!,
      owner: d.owner_id ? team.get(d.owner_id) ?? null : null,
      statusSince,
      flags: flagsFor(d, statusSince, today, now),
      subtasks: [],
      parent: d.parent_id && titles.has(d.parent_id) ? { id: d.parent_id, title: titles.get(d.parent_id)! } : null,
      progress: { done: 0, total: 0, late: 0 },
    };
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const parent = r.parent_id ? byId.get(r.parent_id) : null;
    if (!parent) continue;
    parent.subtasks.push(r);
    parent.progress.total += 1;
    if (isDone(r.status)) parent.progress.done += 1;
    if (r.flags.overdue) parent.progress.late += 1;
  }
  for (const r of rows) {
    if (r.subtasks.length > 1) r.subtasks.sort((a, b) => a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at));
  }
  return rows;
}

const byDue = (a: BoardRow, b: BoardRow) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title);

/** Clients this person runs (partners: all of them). */
export function ledClientIds(data: Dataset, meId: string, role: AccessLevel): Set<string> {
  if (role === "partner") return new Set(data.clients.map((c) => c.id));
  return new Set(data.clients.filter((c) => c.account_lead_id === meId).map((c) => c.id));
}

/**
 * The week people plan around. Qatar's weekend is Friday-Saturday, so on the
 * weekend "this week" means the one starting on Sunday.
 */
export function planningWeek(today: IsoDate): { days: IsoDate[]; label: "This week" | "Next week" } {
  if (isWorkingDay(today)) return { days: weekDays(today), label: "This week" };
  return { days: weekDays(addDays(weekStart(today), 7)), label: "Next week" };
}

export interface MyWork {
  weekLabel: "This week" | "Next week";
  open: BoardRow[];
  overdue: BoardRow[];
  thisWeek: BoardRow[];
  later: BoardRow[];
  nextDue: BoardRow | null;
  /** Internal review on clients I lead: waiting for my sign-off. */
  signOff: BoardRow[];
  /** In Client review on clients I lead. */
  waitingOnClient: BoardRow[];
  week: { day: IsoDate; total: number; done: number }[];
  weekTotal: number;
  weekDone: number;
}

export function myWork(rows: BoardRow[], data: Dataset, meId: string, role: AccessLevel, today: IsoDate): MyWork {
  const mine = rows.filter((r) => r.owner_id === meId);
  const open = mine.filter((r) => isWithTeam(r.status) || r.flags.overdue).sort(byDue);
  const { days, label } = planningWeek(today);
  const weekEnd = days[6];
  const led = role === "creator" ? new Set<string>() : ledClientIds(data, meId, role);

  const week = days.map((day) => {
    const due = mine.filter((r) => r.due_date === day);
    return { day, total: due.length, done: due.filter((r) => !isWithTeam(r.status)).length };
  });

  return {
    weekLabel: label,
    open,
    overdue: open.filter((r) => r.flags.overdue),
    thisWeek: open.filter((r) => !r.flags.overdue && r.due_date <= weekEnd),
    later: open.filter((r) => r.due_date > weekEnd),
    nextDue: open.find((r) => r.due_date >= today) ?? open[0] ?? null,
    signOff: rows.filter((r) => r.status === "internal_review" && led.has(r.client_id)).sort(byDue),
    waitingOnClient: rows
      .filter((r) => r.status === "client_review" && led.has(r.client_id))
      .sort((a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? "")),
    week,
    weekTotal: week.reduce((n, d) => n + d.total, 0),
    weekDone: week.reduce((n, d) => n + d.done, 0),
  };
}

export interface ClientMonth {
  client: Client;
  rows: BoardRow[];
  total: number;
  posted: number;
  done: number;
  waiting: number;
  overdue: number;
  extras: number;
  nextDue: BoardRow | null;
  byType: { code: string; name: string; total: number; done: number }[];
}

/**
 * A client's month. `rows` holds everything (deliverables and tasks); the
 * counts are content only, so tasks don't change delivery numbers.
 */
export function clientMonth(rows: BoardRow[], client: Client, month: IsoDate, today: IsoDate): ClientMonth {
  const all = rows.filter((r) => r.client_id === client.id && r.month === month).sort(byDue);
  const list = all.filter((r) => r.type.is_content);
  const types = new Map<string, { code: string; name: string; total: number; done: number }>();
  for (const r of list) {
    const t = types.get(r.deliverable_type) ?? { code: r.deliverable_type, name: r.type.name_en, total: 0, done: 0 };
    t.total += 1;
    if (isDone(r.status)) t.done += 1;
    types.set(r.deliverable_type, t);
  }
  return {
    client,
    rows: all,
    total: list.length,
    posted: list.filter((r) => r.status === "posted").length,
    done: list.filter((r) => isDone(r.status)).length,
    waiting: list.filter((r) => r.status === "client_review").length,
    overdue: list.filter((r) => r.flags.overdue).length,
    extras: list.filter((r) => r.retainer_id && !r.scope_line_id).length,
    nextDue: all.find((r) => isWithTeam(r.status) && r.due_date >= today) ?? null,
    byType: [...types.values()],
  };
}

export type Range = "week" | "month";

export interface Pulse {
  from: IsoDate;
  to: IsoDate;
  posted: number;
  onTimePct: number | null;
  prevOnTimePct: number | null;
  avgApprovalHours: number | null;
  avgRevisions: number | null;
  heat: { day: IsoDate; count: number }[];
  byClient: { client: Client; total: number; done: number }[];
  capacity: { member: TeamMember; booked: number; available: number }[];
}

function rangeFor(range: Range, today: IsoDate, back = 0): { from: IsoDate; to: IsoDate } {
  if (range === "week") {
    const from = addDays(weekStart(today), -7 * back);
    return { from, to: addDays(from, 6) };
  }
  const from = addDays(today, -30 * (back + 1) + 1);
  return { from, to: addDays(from, 29) };
}

function onTimeIn(rows: BoardRow[], from: IsoDate, to: IsoDate): { posted: BoardRow[]; pct: number | null } {
  const posted = rows.filter((r) => r.posted_at && qatarDate(r.posted_at) >= from && qatarDate(r.posted_at) <= to);
  if (posted.length === 0) return { posted, pct: null };
  return { posted, pct: percent(posted.filter((r) => isOnTime(r)).length, posted.length) };
}

export function pulse(rows: BoardRow[], data: Dataset, range: Range, today: IsoDate, heatWeeks = 18): Pulse {
  const { from, to } = rangeFor(range, today);
  const prev = rangeFor(range, today, 1);
  const current = onTimeIn(rows, from, to);
  const previous = onTimeIn(rows, prev.from, prev.to);

  // Hours spent in Client review, for items that left it in the range.
  const durations: number[] = [];
  const events = eventsByDeliverable(data.statusEvents);
  for (const list of events.values()) {
    let entered: string | null = null;
    for (const e of [...list].sort((a, b) => a.changed_at.localeCompare(b.changed_at))) {
      if (e.to_status === "client_review") entered = e.changed_at;
      else if (entered && e.from_status === "client_review") {
        const left = qatarDate(e.changed_at);
        if (left >= from && left <= to) {
          durations.push((Date.parse(e.changed_at) - Date.parse(entered)) / 3_600_000);
        }
        entered = null;
      }
    }
  }

  const approved = rows.filter((r) => r.type.is_content && isDone(r.status) && r.due_date >= from && r.due_date <= to);

  // Heatmap: deliverables posted per day, whole weeks ending this week.
  const heatStart = addDays(weekStart(today), -7 * (heatWeeks - 1));
  const counts = new Map<IsoDate, number>();
  for (const r of rows) {
    if (!r.posted_at) continue;
    const day = qatarDate(r.posted_at);
    if (day >= heatStart) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const heat = Array.from({ length: heatWeeks * 7 }, (_, i) => {
    const day = addDays(heatStart, i);
    return { day, count: day > today ? -1 : counts.get(day) ?? 0 };
  });

  const inRange = rows.filter((r) => r.type.is_content && r.due_date >= from && r.due_date <= to);
  const byClient = data.clients
    .map((client) => {
      const list = inRange.filter((r) => r.client_id === client.id);
      return { client, total: list.length, done: list.filter((r) => isDone(r.status)).length };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const thisWeek = weekDays(today);
  const capacity = data.team
    .filter((m) => m.is_active && m.weekly_capacity_points > 0 && m.access_level !== "partner")
    .map((member) => ({
      member,
      booked: rows
        .filter((r) => r.owner_id === member.id && countsForCapacity(r) && r.due_date >= thisWeek[0] && r.due_date <= thisWeek[6])
        .reduce((n, r) => n + r.effort_points, 0),
      available: member.weekly_capacity_points,
    }))
    .sort((a, b) => b.booked / b.available - a.booked / a.available);

  return {
    from,
    to,
    posted: current.posted.length,
    onTimePct: current.pct,
    prevOnTimePct: previous.pct,
    avgApprovalHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    avgRevisions: approved.length ? approved.reduce((n, r) => n + r.revision_count, 0) / approved.length : null,
    heat,
    byClient,
    capacity,
  };
}

/** Deliverables due or going live on a day (for the schedule). */
export function dayPlan(rows: BoardRow[], day: IsoDate) {
  return {
    due: rows.filter((r) => r.due_date === day).sort(byDue),
    live: rows.filter((r) => r.post_date === day && r.due_date !== day).sort(byDue),
  };
}

export function daysOverdue(row: BoardRow, today: IsoDate): number {
  return Math.max(0, daysBetween(row.due_date, today));
}
