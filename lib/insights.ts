// Dashboard and report numbers. Pure functions over BoardRow / Dataset so they
// work the same on demo data and on Supabase rows. Definitions follow
// docs/schema.md ("Metrics").

import { addDays, monthStart, qatarDate, weekDays, workingDaysOfMonth } from "./dates";
import { percent } from "./format";
import { clientMonth, eventsByDeliverable, planningWeek, type BoardRow, type ClientMonth } from "./selectors";
import type { Client, Dataset, DeliverableStatus, IsoDate, TeamMember } from "./types";
import { isDone, isOnTime, isWithTeam, STATUS_META } from "./workflow";

/** Percent change from a to b; null when there's no base to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface OverviewKpis {
  weekLabel: string;
  due: { value: number; previous: number; byDay: { day: IsoDate; count: number }[] };
  waiting: { value: number; overdue48h: number; longestHours: number | null };
  onTime: { value: number | null; previous: number | null; weekly: { from: IsoDate; pct: number | null; posted: number }[] };
  capacity: { booked: number; available: number; pct: number; previousPct: number };
}

export function overviewKpis(rows: BoardRow[], data: Dataset, today: IsoDate): OverviewKpis {
  const { days, label } = planningWeek(today);
  const prevDays = days.map((d) => addDays(d, -7));
  const inDays = (list: IsoDate[]) => rows.filter((r) => r.due_date >= list[0] && r.due_date <= list[6]);

  const waiting = rows.filter((r) => r.status === "client_review");
  const hours = waiting.map((r) => r.flags.waitingHours ?? 0);

  const weekly = weeklyOnTime(rows, today, 8);
  const last30 = onTimeBetween(rows, addDays(today, -29), today);
  const prev30 = onTimeBetween(rows, addDays(today, -59), addDays(today, -30));

  const cap = capacityWeek(rows, data, days);
  const capPrev = capacityWeek(rows, data, prevDays);
  const sum = (c: CapacityRow[], k: "booked" | "available") => c.reduce((n, x) => n + x[k], 0);

  return {
    weekLabel: label,
    due: {
      value: inDays(days).length,
      previous: inDays(prevDays).length,
      byDay: days.map((day) => ({ day, count: rows.filter((r) => r.due_date === day).length })),
    },
    waiting: {
      value: waiting.length,
      overdue48h: waiting.filter((r) => r.flags.waitingOnClient).length,
      longestHours: hours.length ? Math.max(...hours) : null,
    },
    onTime: { value: last30.pct, previous: prev30.pct, weekly },
    capacity: {
      booked: sum(cap, "booked"),
      available: sum(cap, "available"),
      pct: percent(sum(cap, "booked"), sum(cap, "available")),
      previousPct: percent(sum(capPrev, "booked"), sum(capPrev, "available")),
    },
  };
}

export function onTimeBetween(rows: BoardRow[], from: IsoDate, to: IsoDate) {
  const posted = rows.filter((r) => r.posted_at && qatarDate(r.posted_at) >= from && qatarDate(r.posted_at) <= to);
  return { posted: posted.length, pct: posted.length ? percent(posted.filter((r) => isOnTime(r)).length, posted.length) : null };
}

/** On-time % per Sunday-Saturday week, oldest first, ending with this week. */
export function weeklyOnTime(rows: BoardRow[], today: IsoDate, weeks: number) {
  const thisWeek = weekDays(today)[0];
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(thisWeek, -7 * (weeks - 1 - i));
    const r = onTimeBetween(rows, from, addDays(from, 6));
    return { from, pct: r.pct, posted: r.posted };
  });
}

// ---------------------------------------------------------------------------
// Delivery and stages
// ---------------------------------------------------------------------------

export type Stage = "production" | "review" | "ready" | "live";

export const STAGES: { key: Stage; label: string; statuses: DeliverableStatus[] }[] = [
  { key: "production", label: "In production", statuses: ["planned", "scripting", "shooting", "editing"] },
  { key: "review", label: "In review", statuses: ["internal_review", "client_review"] },
  { key: "ready", label: "Approved", statuses: ["approved", "scheduled"] },
  { key: "live", label: "Live", statuses: ["posted", "done"] },
];

export function stageOf(status: DeliverableStatus): Stage {
  return STAGES.find((s) => s.statuses.includes(status))!.key;
}

/** Deliverables (content, not tasks) due on each working day of the month, split by stage. */
export function deliveryByDay(rows: BoardRow[], month: IsoDate) {
  const days = workingDaysOfMonth(month);
  const content = rows.filter((r) => r.type.is_content);
  return days.map((day) => {
    const due = content.filter((r) => r.due_date === day);
    const counts = { production: 0, review: 0, ready: 0, live: 0 } as Record<Stage, number>;
    for (const r of due) counts[stageOf(r.status)] += 1;
    return { day, ...counts, total: due.length };
  });
}

export function stageMix(rows: BoardRow[], month: IsoDate) {
  const list = rows.filter((r) => r.month === month && r.type.is_content);
  return {
    total: list.length,
    stages: STAGES.map((s) => ({ ...s, count: list.filter((r) => s.statuses.includes(r.status)).length })),
  };
}

export function statusCounts(rows: BoardRow[]) {
  return (Object.keys(STATUS_META) as DeliverableStatus[]).map((s) => ({
    status: s,
    count: rows.filter((r) => r.status === s).length,
  }));
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type Health = "on_track" | "at_risk" | "behind";

export const HEALTH_META: Record<Health, { label: string; tone: "good" | "serious" | "critical" }> = {
  on_track: { label: "On track", tone: "good" },
  at_risk: { label: "At risk", tone: "serious" },
  behind: { label: "Behind", tone: "critical" },
};

export function healthOf(cm: ClientMonth): Health {
  if (cm.overdue >= 2) return "behind";
  if (cm.overdue === 1 || cm.rows.some((r) => r.flags.waitingOnClient)) return "at_risk";
  return "on_track";
}

export interface ClientSummary extends ClientMonth {
  health: Health;
  lead: TeamMember | null;
  feeMinor: number | null;
  currency: string;
}

export function clientSummaries(rows: BoardRow[], data: Dataset, month: IsoDate, today: IsoDate): ClientSummary[] {
  const team = new Map(data.team.map((m) => [m.id, m]));
  return data.clients
    .map((c) => {
      const cm = clientMonth(rows, c, month, today);
      const retainer = data.retainers.find((r) => r.client_id === c.id && r.status === "active");
      return {
        ...cm,
        health: healthOf(cm),
        lead: c.account_lead_id ? team.get(c.account_lead_id) ?? null : null,
        feeMinor: retainer?.monthly_fee_minor ?? null,
        currency: retainer?.currency ?? "QAR",
      };
    })
    .sort((a, b) => {
      const order: Record<Health, number> = { behind: 0, at_risk: 1, on_track: 2 };
      return order[a.health] - order[b.health] || a.client.name_en.localeCompare(b.client.name_en);
    });
}

// ---------------------------------------------------------------------------
// Attention, deadlines, activity
// ---------------------------------------------------------------------------

export type AttentionReason = "overdue" | "waiting" | "revisions";

export interface AttentionItem {
  row: BoardRow;
  reason: AttentionReason;
}

export function attentionItems(rows: BoardRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of rows) {
    if (r.flags.overdue) items.push({ row: r, reason: "overdue" });
    else if (r.flags.waitingOnClient) items.push({ row: r, reason: "waiting" });
    else if (r.flags.manyRevisions && !isDone(r.status)) items.push({ row: r, reason: "revisions" });
  }
  const rank: Record<AttentionReason, number> = { overdue: 0, waiting: 1, revisions: 2 };
  return items.sort((a, b) => rank[a.reason] - rank[b.reason] || a.row.due_date.localeCompare(b.row.due_date));
}

export function upcoming(rows: BoardRow[], today: IsoDate, days = 7): BoardRow[] {
  const end = addDays(today, days);
  return rows
    .filter((r) => isWithTeam(r.status) && r.due_date >= today && r.due_date <= end)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title));
}

export interface ActivityEntry {
  id: string;
  at: string;
  who: string | null;
  row: BoardRow;
  kind: "status" | "comment" | "created";
  toStatus: DeliverableStatus | null;
}

export function activityFeed(data: Dataset, rows: BoardRow[], limit = 8, nowIso?: string): ActivityEntry[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const team = new Map(data.team.map((m) => [m.id, m.full_name]));
  const entries: ActivityEntry[] = [];
  for (const e of data.statusEvents) {
    const row = byId.get(e.deliverable_id);
    if (!row || (!e.from_status && !e.changed_by_team_member_id)) continue; // skip system-created
    if (nowIso && e.changed_at > nowIso) continue;
    entries.push({
      id: `e${e.id}`,
      at: e.changed_at,
      who: e.changed_by_team_member_id ? team.get(e.changed_by_team_member_id) ?? null : null,
      row,
      kind: e.from_status ? "status" : "created",
      toStatus: e.from_status ? e.to_status : null,
    });
  }
  for (const c of data.comments) {
    const row = byId.get(c.deliverable_id);
    if (!row) continue;
    entries.push({
      id: c.id,
      at: c.created_at,
      who: c.author_team_member_id ? team.get(c.author_team_member_id) ?? null : null,
      row,
      kind: "comment",
      toStatus: null,
    });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export interface CapacityRow {
  member: TeamMember;
  booked: number;
  available: number;
  byDay: number[];
  open: number;
  overdue: number;
}

export function capacityWeek(rows: BoardRow[], data: Dataset, days: IsoDate[]): CapacityRow[] {
  return data.team
    .filter((m) => m.is_active && m.weekly_capacity_points > 0 && m.access_level !== "partner")
    .map((member) => {
      const mine = rows.filter((r) => r.owner_id === member.id);
      const week = mine.filter((r) => r.due_date >= days[0] && r.due_date <= days[6]);
      return {
        member,
        booked: week.reduce((n, r) => n + r.effort_points, 0),
        available: member.weekly_capacity_points,
        byDay: days.map((d) => week.filter((r) => r.due_date === d).reduce((n, r) => n + r.effort_points, 0)),
        open: mine.filter((r) => isWithTeam(r.status)).length,
        overdue: mine.filter((r) => r.flags.overdue).length,
      };
    })
    .sort((a, b) => b.booked / b.available - a.booked / a.available);
}

// ---------------------------------------------------------------------------
// Reports per client
// ---------------------------------------------------------------------------

export interface ClientReport {
  client: Client;
  posted: number;
  onTimePct: number | null;
  avgRevisions: number | null;
  avgApprovalHours: number | null;
}

export function approvalHours(data: Dataset, from: IsoDate, to: IsoDate): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [id, list] of eventsByDeliverable(data.statusEvents)) {
    let entered: string | null = null;
    for (const e of [...list].sort((a, b) => a.changed_at.localeCompare(b.changed_at))) {
      if (e.to_status === "client_review") entered = e.changed_at;
      else if (entered && e.from_status === "client_review") {
        const left = qatarDate(e.changed_at);
        if (left >= from && left <= to) {
          const arr = out.get(id) ?? [];
          arr.push((Date.parse(e.changed_at) - Date.parse(entered)) / 3_600_000);
          out.set(id, arr);
        }
        entered = null;
      }
    }
  }
  return out;
}

export function clientReports(rows: BoardRow[], data: Dataset, from: IsoDate, to: IsoDate): ClientReport[] {
  const approvals = approvalHours(data, from, to);
  return data.clients.map((client) => {
    const mine = rows.filter((r) => r.client_id === client.id && r.type.is_content);
    const ot = onTimeBetween(mine, from, to);
    const approved = mine.filter((r) => isDone(r.status) && r.due_date >= from && r.due_date <= to);
    const hours = mine.flatMap((r) => approvals.get(r.id) ?? []);
    return {
      client,
      posted: ot.posted,
      onTimePct: ot.pct,
      avgRevisions: approved.length ? approved.reduce((n, r) => n + r.revision_count, 0) / approved.length : null,
      avgApprovalHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    };
  });
}

export function monthOf(today: IsoDate): IsoDate {
  return monthStart(today);
}
