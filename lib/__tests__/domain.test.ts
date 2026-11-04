import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOfWeek,
  formatRelative,
  greeting,
  isWorkingDay,
  qatarToday,
  spreadDueDate,
  weekStart,
} from "../dates";
import { buildDemoDataset } from "../demo/data";
import { formatMoney } from "../format";
import { boardRows, myWork, planningWeek, pulse } from "../selectors";
import type { Deliverable } from "../types";
import { applyMove, canMove, flowFor, nextStatus, STATUSES } from "../workflow";

describe("dates (Doha)", () => {
  it("uses Doha's calendar date, not the device's", () => {
    // 22:30 UTC is already 01:30 the next day in Doha (UTC+3).
    expect(qatarToday(new Date("2026-11-04T22:30:00Z"))).toBe("2026-11-05");
    expect(qatarToday(new Date("2026-11-04T20:59:00Z"))).toBe("2026-11-04");
  });

  it("weeks start on Sunday and working days are Sunday to Thursday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-01"); // Thu -> Sun
    expect(weekStart("2026-11-01")).toBe("2026-11-01");
    expect(dayOfWeek("2026-11-01")).toBe(0);
    expect(isWorkingDay("2026-11-05")).toBe(true); // Thu
    expect(isWorkingDay("2026-11-06")).toBe(false); // Fri
    expect(isWorkingDay("2026-11-07")).toBe(false); // Sat
  });

  it("spreads due dates exactly like the database generator", () => {
    // Expected values come from public.generate_month_deliverables('2026-12-01').
    const spread = (n: number) => Array.from({ length: n }, (_, i) => spreadDueDate("2026-12-01", i + 1, n));
    expect(spread(6)).toEqual(["2026-12-02", "2026-12-08", "2026-12-14", "2026-12-20", "2026-12-24", "2026-12-30"]);
    expect(spread(8)).toEqual([
      "2026-12-02", "2026-12-07", "2026-12-10", "2026-12-15", "2026-12-17", "2026-12-22", "2026-12-27", "2026-12-30",
    ]);
    expect(spread(1)).toEqual(["2026-12-16"]);
  });

  it("plans around the coming week on Friday and Saturday", () => {
    expect(planningWeek("2026-11-05")).toMatchObject({ label: "This week" }); // Thu
    expect(planningWeek("2026-11-05").days[0]).toBe("2026-11-01");
    const sat = planningWeek("2026-10-31");
    expect(sat.label).toBe("Next week");
    expect(sat.days[0]).toBe("2026-11-01");
    expect(planningWeek("2026-11-06").days[0]).toBe("2026-11-08"); // Fri
  });

  it("formats relative days and greetings", () => {
    expect(formatRelative("2026-11-05", "2026-11-05")).toBe("Today");
    expect(formatRelative("2026-11-06", "2026-11-05")).toBe("Tomorrow");
    expect(formatRelative("2026-11-10", "2026-11-05")).toBe("Tue, 10 Nov");
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(14)).toBe("Good afternoon");
    expect(greeting(20)).toBe("Good evening");
  });
});

describe("money", () => {
  it("formats integer fils as QAR", () => {
    expect(formatMoney(1_800_000)).toBe("QAR 18,000");
    expect(formatMoney(123_450)).toBe("QAR 1,234.50");
  });
});

const base: Deliverable = {
  id: "d1",
  client_id: "c1",
  retainer_id: "r1",
  scope_line_id: "s1",
  project_id: null,
  deliverable_type: "reel",
  title: "Reel 1/6",
  month: "2026-11-01",
  seq: 1,
  platform: "instagram",
  owner_id: "m1",
  due_date: "2026-11-10",
  post_date: null,
  status: "editing",
  revision_count: 0,
  effort_points: 3,
  script_url: null,
  raw_url: null,
  final_url: null,
  post_url: null,
  posted_at: null,
  created_at: "2026-10-25T06:00:00Z",
};

describe("workflow rules (same as the database trigger)", () => {
  it("only partners and account leads sign off", () => {
    expect(canMove("creator", "editing", "internal_review").ok).toBe(true);
    expect(canMove("creator", "internal_review", "client_review").ok).toBe(false);
    expect(canMove("creator", "client_review", "editing").ok).toBe(false);
    expect(canMove("creator", "approved", "scheduled").ok).toBe(true);
    expect(canMove("account_lead", "internal_review", "client_review").ok).toBe(true);
    expect(canMove("partner", "client_review", "approved").ok).toBe(true);
  });

  it("counts a revision when work comes back from the client", () => {
    const lead = { teamMemberId: "m2", role: "account_lead" as const };
    const r = applyMove({ ...base, status: "client_review" }, "editing", lead);
    expect(r.ok && r.deliverable.revision_count).toBe(1);
    const internal = applyMove({ ...base, status: "internal_review" }, "editing", lead);
    expect(internal.ok && internal.deliverable.revision_count).toBe(0);
    const approved = applyMove({ ...base, status: "client_review" }, "approved", lead);
    expect(approved.ok && approved.deliverable.revision_count).toBe(0);
  });

  it("needs a post date to schedule, and stamps posted_at", () => {
    const creator = { teamMemberId: "m1", role: "creator" as const };
    expect(applyMove({ ...base, status: "approved" }, "scheduled", creator).ok).toBe(false);
    const scheduled = applyMove({ ...base, status: "approved", post_date: "2026-11-12" }, "scheduled", creator);
    expect(scheduled.ok).toBe(true);
    const posted = applyMove({ ...base, status: "scheduled", post_date: "2026-11-12" }, "posted", creator);
    expect(posted.ok && posted.deliverable.posted_at).toBeTruthy();
    const back = applyMove(
      { ...base, status: "posted", post_date: "2026-11-12", posted_at: "2026-11-12T10:00:00Z" },
      "scheduled",
      creator,
    );
    expect(back.ok && back.deliverable.posted_at).toBeNull();
  });

  it("suggests the next step along each type's usual path", () => {
    expect(nextStatus("static_post", "planned")).toBe("editing");
    expect(nextStatus("reel", "planned")).toBe("scripting");
    expect(nextStatus("reel", "posted")).toBeNull();
    expect(nextStatus("static_post", "shooting")).toBe("editing"); // off-path: next one after it
    for (const t of ["reel", "static_post", "influencer_post"] as const) {
      expect(flowFor(t).every((s) => STATUSES.includes(s))).toBe(true);
    }
  });
});

describe("demo data", () => {
  const now = new Date("2026-11-05T09:00:00Z");
  const today = qatarToday(now);
  const data = buildDemoDataset(today, now);
  const rows = boardRows(data, today, now);

  it("follows the database's invariants", () => {
    for (const d of data.deliverables) {
      expect(Number(!!d.retainer_id) + Number(!!d.project_id)).toBe(1);
      expect(d.month.endsWith("-01")).toBe(true);
      if (d.status === "scheduled") expect(d.post_date).toBeTruthy();
      if (d.status === "posted") expect(d.posted_at).toBeTruthy();
      if (d.scope_line_id) expect(isWorkingDay(d.due_date)).toBe(true);
    }
  });

  it("has a status history that ends in each deliverable's current status, never in the future", () => {
    const last = new Map<string, string>();
    for (const e of data.statusEvents) {
      expect(e.changed_at <= now.toISOString()).toBe(true);
      last.set(e.deliverable_id, e.to_status);
    }
    for (const d of data.deliverables) expect(last.get(d.id)).toBe(d.status);
  });

  it("shows both flags from the spec", () => {
    expect(rows.some((r) => r.flags.manyRevisions)).toBe(true);
    expect(rows.some((r) => r.flags.waitingOnClient)).toBe(true);
  });

  it("gives an account lead their work, sign-offs and client waits", () => {
    const work = myWork(rows, data, "tm-rand", "account_lead", today);
    expect(work.waitingOnClient.length).toBeGreaterThan(0);
    expect(work.week).toHaveLength(7);
    expect(work.week[0].day).toBe(weekStart(today));
    const creator = myWork(rows, data, "tm-anas", "creator", today);
    expect(creator.signOff).toHaveLength(0);
    expect(creator.open.every((r) => r.owner_id === "tm-anas")).toBe(true);
  });

  it("produces pulse numbers", () => {
    const p = pulse(rows, data, "month", today);
    expect(p.posted).toBeGreaterThan(10);
    expect(p.onTimePct).not.toBeNull();
    expect(p.heat.at(-1)?.day).toBe(addDays(weekStart(today), 6));
    expect(p.capacity.length).toBeGreaterThan(0);
  });
});
