// The deliverable workflow. These rules mirror the database triggers in
// supabase/migrations/20261031120200_deliverables.sql. The database is the
// authority; the app uses the same rules to only offer moves that will work.

import { daysBetween, qatarDate } from "./dates";
import type {
  Deliverable,
  DeliverableStatus,
  DeliverableTypeCode,
  IsoDate,
  StatusEvent,
} from "./types";

export const STATUSES: DeliverableStatus[] = [
  "planned",
  "scripting",
  "shooting",
  "editing",
  "internal_review",
  "client_review",
  "approved",
  "scheduled",
  "posted",
  "done",
];

/** Identity colour per status (a dot beside the label, never colour alone). */
export const STATUS_META: Record<DeliverableStatus, { en: string; ar: string; color: string }> = {
  planned:         { en: "Planned",         ar: "مخطط",            color: "var(--faint)" },
  scripting:       { en: "Scripting",       ar: "كتابة السيناريو", color: "var(--series-7)" },
  shooting:        { en: "Shooting",        ar: "تصوير",           color: "var(--series-4)" },
  editing:         { en: "Editing",         ar: "مونتاج",          color: "var(--series-1)" },
  internal_review: { en: "Internal review", ar: "مراجعة داخلية",   color: "var(--series-5)" },
  client_review:   { en: "Client review",   ar: "مراجعة العميل",   color: "var(--series-2)" },
  approved:        { en: "Approved",        ar: "معتمد",           color: "var(--series-3)" },
  scheduled:       { en: "Scheduled",       ar: "مجدول",           color: "var(--series-6)" },
  posted:          { en: "Posted",          ar: "منشور",           color: "var(--ink)" },
  done:            { en: "Done",            ar: "تم",              color: "var(--ink)" },
};

export function statusIndex(status: DeliverableStatus): number {
  return STATUSES.indexOf(status);
}

/** Still with the team (before Client review). */
export function isWithTeam(status: DeliverableStatus): boolean {
  return statusIndex(status) < statusIndex("client_review");
}

/** Approved, scheduled, posted, or a task that's done. */
export function isDone(status: DeliverableStatus): boolean {
  return statusIndex(status) >= statusIndex("approved");
}

const TASK_FLOW: DeliverableStatus[] = ["planned", "done"];
const CONTENT_FLOW: DeliverableStatus[] = STATUSES.filter((s) => s !== "done");

/** The usual path for each type. Other moves are allowed; this drives "Next". */
const FLOW: Record<DeliverableTypeCode, DeliverableStatus[]> = {
  reel: CONTENT_FLOW,
  long_video: CONTENT_FLOW,
  shoot_day: ["planned", "shooting", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  influencer_post: ["planned", "scripting", "shooting", "internal_review", "client_review", "approved", "scheduled", "posted"],
  static_post: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  carousel: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  story_set: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  ad_set: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  // Tasks: to do, then done.
  follow_up: TASK_FLOW,
  content_calendar: TASK_FLOW,
  report: TASK_FLOW,
  meeting: TASK_FLOW,
  task: TASK_FLOW,
};

/** Task types: work that isn't content. Mirrors deliverable_types.is_content = false. */
export const TASK_TYPES: DeliverableTypeCode[] = ["follow_up", "content_calendar", "report", "meeting", "task"];

export function isTaskType(type: DeliverableTypeCode): boolean {
  return TASK_TYPES.includes(type);
}

export function flowFor(type: DeliverableTypeCode): DeliverableStatus[] {
  return FLOW[type] ?? CONTENT_FLOW;
}

export function nextStatus(type: DeliverableTypeCode, current: DeliverableStatus): DeliverableStatus | null {
  const flow = FLOW[type] ?? STATUSES;
  const i = flow.indexOf(current);
  if (i >= 0) return flow[i + 1] ?? null;
  // Off the usual path (e.g. a reel skipped scripting): next one after it.
  return flow.find((s) => statusIndex(s) > statusIndex(current)) ?? null;
}

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/** What a person may do with work (team_members permissions). */
export type Perms = { can_approve: boolean; can_send_to_client: boolean };

/**
 * Who may make a move, and where a type can go. Same rules as
 * private.deliverable_workflow(): tasks are to do or done; content never uses
 * Done; Approved needs "approve"; in or out of Client review needs "send to
 * client" (both set per person by partners).
 */
export function canMove(who: Perms, from: DeliverableStatus, to: DeliverableStatus, type?: DeliverableTypeCode): MoveCheck {
  if (from === to) return { ok: false, reason: "Already there" };
  if (type && isTaskType(type) && to !== "planned" && to !== "done") {
    return { ok: false, reason: "A task is either to do or done" };
  }
  if (type && !isTaskType(type) && to === "done") {
    return { ok: false, reason: "Content goes through review and ends at Posted" };
  }
  if (to === "approved") {
    if (!who.can_approve) return { ok: false, reason: "Approving needs permission (Team → Permissions)" };
  } else if ((to === "client_review" || from === "client_review") && !who.can_send_to_client) {
    return { ok: false, reason: "Sending to the client needs permission (Team → Permissions)" };
  }
  return { ok: true };
}

export type MoveResult =
  | { ok: true; deliverable: Deliverable; event: Omit<StatusEvent, "id"> }
  | { ok: false; reason: string };

/** Apply a status change the way the database trigger does. */
export function applyMove(
  d: Deliverable,
  to: DeliverableStatus,
  actor: { teamMemberId: string; perms: Perms },
  now: Date = new Date(),
): MoveResult {
  const check = canMove(actor.perms, d.status, to, d.deliverable_type);
  if (!check.ok) return check;
  if (to === "scheduled" && !d.post_date) {
    return { ok: false, reason: "Set a post date before scheduling" };
  }

  const isRevision = d.status === "client_review" && statusIndex(to) < statusIndex("client_review");
  const next: Deliverable = {
    ...d,
    status: to,
    revision_count: d.revision_count + (isRevision ? 1 : 0),
    posted_at: to === "posted" ? now.toISOString() : null,
  };

  return {
    ok: true,
    deliverable: next,
    event: {
      deliverable_id: d.id,
      from_status: d.status,
      to_status: to,
      changed_by_team_member_id: actor.teamMemberId,
      changed_by_contact_id: null,
      changed_at: now.toISOString(),
    },
  };
}

/** When the deliverable entered its current status. */
export function statusChangedAt(events: StatusEvent[]): string | null {
  let latest: string | null = null;
  for (const e of events) if (!latest || e.changed_at > latest) latest = e.changed_at;
  return latest;
}

export interface Flags {
  overdue: boolean;
  manyRevisions: boolean;
  waitingOnClient: boolean;
  waitingHours: number | null;
}

/** Same definitions as the deliverable_board view. */
export function flagsFor(d: Deliverable, statusSince: string | null, today: IsoDate, now: Date = new Date()): Flags {
  const overdue =
    (isWithTeam(d.status) && d.due_date < today) ||
    ((d.status === "approved" || d.status === "scheduled") && !!d.post_date && d.post_date < today);
  const waitingHours =
    d.status === "client_review" && statusSince ? (now.getTime() - new Date(statusSince).getTime()) / 3_600_000 : null;
  return {
    overdue,
    manyRevisions: d.revision_count >= 2,
    waitingOnClient: waitingHours !== null && waitingHours > 48,
    waitingHours,
  };
}

/** Posted on or before the planned date (post date, else due date). */
export function isOnTime(d: Deliverable): boolean | null {
  if (d.status !== "posted" || !d.posted_at) return null;
  const planned = d.post_date ?? d.due_date;
  return daysBetween(qatarDate(d.posted_at), planned) >= 0;
}
