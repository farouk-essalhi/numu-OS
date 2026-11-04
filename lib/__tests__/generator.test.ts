import { describe, expect, it } from "vitest";
import { friendlyError, payloadFor } from "../backend";
import { buildDemoDataset } from "../demo/data";
import { pinnedDueDate } from "../dates";
import { generatedTitle, generateMonth } from "../generator";
import type { Dataset } from "../types";

const today = "2026-11-04";
const now = new Date("2026-11-04T09:00:00Z");
let n = 0;
const ids = () => `gen-${++n}`;

describe("monthly generator (demo copy of generate_month_deliverables)", () => {
  const demo = buildDemoDataset(today, now);

  it("creates nothing for a month that already exists", () => {
    // The demo dataset was built by the same rules, so November is complete.
    expect(generateMonth(demo, "2026-11-01", { now, newId: ids }).deliverables).toHaveLength(0);
  });

  it("turns every scope line into numbered, evenly spread deliverables", () => {
    const out = generateMonth(demo, "2026-12-01", { now, newId: ids });
    const expected = demo.scopeLines.reduce((sum, s) => sum + s.quantity_per_month, 0);
    expect(out.deliverables).toHaveLength(expected);
    expect(out.events).toHaveLength(expected);
    const line = demo.scopeLines[0];
    const items = out.deliverables.filter((d) => d.scope_line_id === line.id).sort((a, b) => a.seq! - b.seq!);
    expect(items.map((d) => d.seq)).toEqual(Array.from({ length: line.quantity_per_month }, (_, i) => i + 1));
    expect(items[0].title).toMatch(new RegExp(`^\\w[\\w ]* 1/${line.quantity_per_month}`));
    expect(items.every((d) => d.status === "planned" && d.month === "2026-12-01")).toBe(true);
    // Due dates go up through the month and only land on Sun-Thu.
    const dues = items.map((d) => d.due_date);
    expect([...dues].sort()).toEqual(dues);
    expect(dues.every((d) => ![5, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))).toBe(true);
  });

  it("is safe to run twice and only adds what's missing", () => {
    const first = generateMonth(demo, "2026-12-01", { now, newId: ids });
    const after: Dataset = { ...demo, deliverables: [...demo.deliverables, ...first.deliverables] };
    expect(generateMonth(after, "2026-12-01", { now, newId: ids }).deliverables).toHaveLength(0);
    // Raising a quantity adds just the difference.
    const raised: Dataset = {
      ...after,
      scopeLines: after.scopeLines.map((s, i) => (i === 0 ? { ...s, quantity_per_month: s.quantity_per_month + 2 } : s)),
    };
    expect(generateMonth(raised, "2026-12-01", { now, newId: ids }).deliverables).toHaveLength(2);
  });

  it("skips paused retainers and inactive clients, and can target one retainer", () => {
    const r0 = demo.retainers[0];
    const paused: Dataset = { ...demo, retainers: demo.retainers.map((r) => (r.id === r0.id ? { ...r, status: "paused" } : r)) };
    expect(generateMonth(paused, "2026-12-01", { now, newId: ids }).deliverables.some((d) => d.retainer_id === r0.id)).toBe(false);
    const ended: Dataset = { ...demo, clients: demo.clients.map((c) => (c.id === r0.client_id ? { ...c, status: "ended" } : c)) };
    expect(generateMonth(ended, "2026-12-01", { now, newId: ids }).deliverables.some((d) => d.client_id === r0.client_id)).toBe(false);
    const one = generateMonth(demo, "2026-12-01", { now, newId: ids, retainerId: r0.id });
    expect(one.deliverables.length).toBeGreaterThan(0);
    expect(one.deliverables.every((d) => d.retainer_id === r0.id)).toBe(true);
  });

  it("gives work to the scope line's owner, else the client's account lead", () => {
    const line = { ...demo.scopeLines[0], default_owner_id: null };
    const data: Dataset = { ...demo, scopeLines: [line, ...demo.scopeLines.slice(1)] };
    const retainer = demo.retainers.find((r) => r.id === line.retainer_id)!;
    const lead = demo.clients.find((c) => c.id === retainer.client_id)!.account_lead_id;
    const out = generateMonth(data, "2026-12-01", { now, newId: ids }).deliverables.filter((d) => d.scope_line_id === line.id);
    expect(out.every((d) => d.owner_id === lead)).toBe(true);
  });

  it("names one-a-month items without 1/1 and pins their due day, like the SQL", () => {
    const out = generateMonth(demo, "2027-02-01", { now, newId: ids });
    const calendar = out.deliverables.find((d) => d.deliverable_type === "content_calendar")!;
    expect(calendar.title).toBe("Content calendar");
    // 20 Feb 2027 is a Saturday: the next working day is Sunday the 21st.
    expect(calendar.due_date).toBe("2027-02-21");
    const report = out.deliverables.find((d) => d.deliverable_type === "report" && d.client_id === "cl-dune")!;
    expect(report.due_date).toBe("2027-02-03");
    expect(generatedTitle("Reel", 3, 6, "instagram")).toBe("Reel 3/6 · Instagram");
    // Same cases as 04_tasks.test.sql: Fri 20 Feb 2026 -> Sun 22nd; the 31st -> the last working day.
    expect(pinnedDueDate("2026-02-01", 20)).toBe("2026-02-22");
    expect(pinnedDueDate("2026-02-01", 31)).toBe("2026-02-26");
  });

  it("does nothing on an empty workspace", () => {
    const empty: Dataset = { ...demo, clients: [], retainers: [], scopeLines: [], deliverables: [] };
    expect(generateMonth(empty, "2026-12-01", { now, newId: ids }).deliverables).toHaveLength(0);
  });
});

describe("writing to Supabase", () => {
  it("sends only the columns people edit", () => {
    const demo = buildDemoDataset(today, now);
    const payload = payloadFor("clients", { ...demo.clients[0] });
    expect(Object.keys(payload).sort()).toEqual(
      ["account_lead_id", "brand_kit_url", "drive_folder_url", "industry", "name_ar", "name_en", "status"].sort(),
    );
    expect(payloadFor("team", demo.team[0])).not.toHaveProperty("user_id");
  });

  it("explains database errors in plain words", () => {
    expect(friendlyError({ code: "42501", message: "new row violates row-level security policy for table \"clients\"", details: "" })).toBe(
      "You don't have permission to do that",
    );
    // Our own trigger messages pass through.
    expect(friendlyError({ code: "42501", message: "Only partners and account leads can sign off work", details: "" })).toMatch(/sign off/);
    expect(friendlyError({ code: "23505", message: 'duplicate key value violates unique constraint "clients_name_en_key"', details: "" })).toBe(
      "A client with that name already exists",
    );
    expect(friendlyError({ code: "23503", message: "update or delete violates foreign key constraint", details: "" })).toMatch(/still in use/);
    expect(friendlyError({ code: "", message: "TypeError: Failed to fetch", details: "" })).toMatch(/connection/);
  });
});
