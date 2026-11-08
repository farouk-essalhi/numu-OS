import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "../demo/data";
import { capacityWeek } from "../insights";
import { boardRows, countsForCapacity, planningWeek } from "../selectors";
import { canMove } from "../workflow";

const today = "2026-11-04";
const now = new Date("2026-11-04T09:00:00Z");
const data = buildDemoDataset(today, now);
const rows = boardRows(data, today, now);
const web = rows.find((r) => r.id === "dl-sidra-web")!;

describe("subtasks", () => {
  it("hang under their task, in order, with progress", () => {
    expect(web.subtasks.map((s) => s.title)).toEqual([
      "Sitemap and page list",
      "Moodboard and look",
      "Homepage design",
      "Product pages design",
      "Copywriting (English)",
      "Copywriting (Arabic)",
      "Photography selects",
      "Build the site",
      "QA on phones",
      "Launch and handover",
    ]);
    expect(web.progress).toEqual({ done: 2, total: 10, late: 1 }); // photography selects is a day late
    expect(web.subtasks.every((s) => s.parent?.id === web.id && s.client_id === web.client_id)).toBe(true);
  });

  it("count towards their owners' capacity instead of the big task", () => {
    expect(countsForCapacity(web)).toBe(false);
    expect(web.subtasks.every(countsForCapacity)).toBe(true);
    const days = planningWeek(today).days;
    const rand = capacityWeek(rows, { ...data, team: data.team.map((m) => ({ ...m, weekly_capacity_points: 20 })) }, days).find(
      (c) => c.member.id === "tm-rand",
    )!;
    const randsThisWeek = rows.filter((r) => r.owner_id === "tm-rand" && r.due_date >= days[0] && r.due_date <= days[6]);
    const expected = randsThisWeek.filter(countsForCapacity).reduce((n, r) => n + r.effort_points, 0);
    expect(rand.booked).toBe(expected);
  });

  it("tasks go To do → In progress → Done; content never uses those", () => {
    const anyone = { can_approve: false, can_send_to_client: false };
    expect(canMove(anyone, "planned", "in_progress", "task").ok).toBe(true);
    expect(canMove(anyone, "in_progress", "done", "task").ok).toBe(true);
    expect(canMove(anyone, "planned", "editing", "task").ok).toBe(false);
    expect(canMove(anyone, "editing", "in_progress", "reel").ok).toBe(false);
  });
});
