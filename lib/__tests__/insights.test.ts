import { describe, expect, it } from "vitest";
import { isWorkingDay, qatarToday } from "../dates";
import { buildDemoDataset } from "../demo/data";
import {
  activityFeed,
  capacityWeek,
  change,
  clientSummaries,
  deliveryByDay,
  healthOf,
  overviewKpis,
  stageMix,
} from "../insights";
import { boardRows, clientMonth, planningWeek } from "../selectors";

const now = new Date("2026-11-04T15:00:00Z");
const today = qatarToday(now);
const data = buildDemoDataset(today, now);
const rows = boardRows(data, today, now);
const month = "2026-11-01";

describe("dashboard numbers", () => {
  it("change() is a percent change and never divides by zero", () => {
    expect(change(15, 14)).toBe(7);
    expect(change(0, 0)).toBe(0);
    expect(change(3, 0)).toBeNull();
  });

  it("splits the month's work by stage without losing any", () => {
    const mix = stageMix(rows, month);
    expect(mix.stages.reduce((n, s) => n + s.count, 0)).toBe(mix.total);
    expect(mix.total).toBe(rows.filter((r) => r.month === month).length);
  });

  it("charts every working day and counts each due deliverable once", () => {
    const days = deliveryByDay(rows, month);
    expect(days.every((d) => isWorkingDay(d.day))).toBe(true);
    const charted = days.reduce((n, d) => n + d.total, 0);
    const dueOnWorkingDays = rows.filter((r) => r.due_date.startsWith("2026-11") && isWorkingDay(r.due_date)).length;
    expect(charted).toBe(dueOnWorkingDays);
    for (const d of days) expect(d.production + d.review + d.ready + d.live).toBe(d.total);
  });

  it("rates client health from late work and long client waits", () => {
    const marina = clientMonth(rows, data.clients.find((c) => c.id === "cl-marina")!, month, today);
    expect(healthOf({ ...marina, overdue: 2 })).toBe("behind");
    expect(healthOf({ ...marina, overdue: 1 })).toBe("at_risk");
    expect(healthOf({ ...marina, overdue: 0, rows: [] })).toBe("on_track");
    expect(clientSummaries(rows, data, month, today)).toHaveLength(data.clients.length);
  });

  it("counts capacity for the team, not partners", () => {
    const cap = capacityWeek(rows, data, planningWeek(today).days);
    expect(cap.every((c) => c.member.access_level !== "partner")).toBe(true);
    const k = overviewKpis(rows, data, today);
    expect(k.capacity.available).toBe(cap.reduce((n, c) => n + c.available, 0));
    expect(k.due.byDay).toHaveLength(7);
  });

  it("lists recent activity newest first, nothing in the future", () => {
    const feed = activityFeed(data, rows, 10, now.toISOString());
    expect(feed.length).toBeGreaterThan(0);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1].at >= feed[i].at).toBe(true);
    expect(feed.every((a) => a.at <= now.toISOString())).toBe(true);
  });
});
