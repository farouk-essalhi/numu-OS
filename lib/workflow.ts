// The deliverable workflow. These rules mirror the database triggers in
// supabase/migrations/20261031120200_deliverables.sql. The database is the
// authority; the app uses the same rules to only offer moves that will work.

import { daysBetween, qatarDate } from "./dates";
import type {
  AccessLevel,
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
];

export type StatusTone =
  | "slate"
  | "violet"
  | "amber"
  | "sky"
  | "indigo"
  | "orange"
  | "green"
  | "teal"
  | "ink";

export const STATUS_META: Record<DeliverableStatus, { en: string; ar: string; short: string; tone: StatusTone }> = {
  planned:         { en: "Planned",         ar: "مخطط",            short: "Planned",  tone: "slate" },
  scripting:       { en: "Scripting",       ar: "كتابة السيناريو", short: "Script",   tone: "violet" },
  shooting:        { en: "Shooting",        ar: "تصوير",           short: "Shoot",    tone: "amber" },
  editing:         { en: "Editing",         ar: "مونتاج",          short: "Edit",     tone: "sky" },
  internal_review: { en: "Internal review", ar: "مراجعة داخلية",   short: "Review",   tone: "indigo" },
  client_review:   { en: "Client review",   ar: "مراجعة العميل",   short: "Client",   tone: "orange" },
  approved:        { en: "Approved",        ar: "معتمد",           short: "Approved", tone: "green" },
  scheduled:       { en: "Scheduled",       ar: "مجدول",           short: "Sched.",   tone: "teal" },
  posted:          { en: "Posted",          ar: "منشور",           short: "Posted",   tone: "ink" },
};

export function statusIndex(status: DeliverableStatus): number {
  return STATUSES.indexOf(status);
}

/** Still with the team (before Client review). */
export function isWithTeam(status: DeliverableStatus): boolean {
  return statusIndex(status) < statusIndex("client_review");
}

/** Approved, scheduled or posted. */
export function isDone(status: DeliverableStatus): boolean {
  return statusIndex(status) >= statusIndex("approved");
}

/** The usual path for each type. Other moves are allowed; this drives "Next". */
const FLOW: Record<DeliverableTypeCode, DeliverableStatus[]> = {
  reel: STATUSES,
  long_video: STATUSES,
  shoot_day: ["planned", "shooting", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  influencer_post: ["planned", "scripting", "shooting", "internal_review", "client_review", "approved", "scheduled", "posted"],
  static_post: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  carousel: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  story_set: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
  ad_set: ["planned", "editing", "internal_review", "client_review", "approved", "scheduled", "posted"],
};

export function flowFor(type: DeliverableTypeCode): DeliverableStatus[] {
  return FLOW[type];
}

export function nextStatus(type: DeliverableTypeCode, current: DeliverableStatus): DeliverableStatus | null {
  const flow = FLOW[type];
  const i = flow.indexOf(current);
  if (i >= 0) return flow[i + 1] ?? null;
  // Off the usual path (e.g. a reel skipped scripting): next one after it.
  return flow.find((s) => statusIndex(s) > statusIndex(current)) ?? null;
}

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/** Who may make a move. Same rule as private.deliverable_workflow(). */
export function canMove(role: AccessLevel, from: DeliverableStatus, to: DeliverableStatus): MoveCheck {
  if (from === to) return { ok: false, reason: "Already there" };
  const signOff = to === "client_review" || to === "approved" || from === "client_review";
  if (signOff && role === "creator") {
    return { ok: false, reason: "Partners and account leads sign off" };
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
  actor: { teamMemberId: string; role: AccessLevel },
  now: Date = new Date(),
): MoveResult {
  const check = canMove(actor.role, d.status, to);
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
