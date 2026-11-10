import { beforeEach, describe, expect, it } from "vitest";
import { reloadDataset } from "../backend";
import { clearCache, readCache, writeCache } from "../cache";
import { buildDemoDataset } from "../demo/data";
import { clientHref, taskHref } from "../routes";
import { createSignal } from "../signals";
import type { Supabase } from "../supabase";
import type { Dataset } from "../types";

// A minimal localStorage for the saved copy.
const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
// Object.keys(localStorage) lists the saved keys in a browser; mirror that here.
const storage = new Proxy(fakeStorage, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
(globalThis as { localStorage?: unknown }).localStorage = storage;

const data = buildDemoDataset("2026-11-10", new Date("2026-11-10T08:00:00Z"));

describe("the saved copy (decision 51)", () => {
  beforeEach(() => store.clear());

  it("is kept per login and read back", () => {
    writeCache("user-a", data);
    expect(readCache("user-a")?.data.deliverables.length).toBe(data.deliverables.length);
    expect(readCache("user-b")).toBeNull();
  });

  it("is ignored once it is older than three days, or isn't a dataset", () => {
    const key = "numu.cache.v1.user-a";
    store.set(key, JSON.stringify({ at: Date.now() - 4 * 86_400_000, data }));
    expect(readCache("user-a")).toBeNull();
    store.set(key, JSON.stringify({ at: Date.now(), data: { team: "nope" } }));
    expect(readCache("user-a")).toBeNull();
    store.set(key, "not json");
    expect(readCache("user-a")).toBeNull();
  });

  it("is wiped for every login on sign-out, and nothing else is touched", () => {
    writeCache("user-a", data);
    writeCache("user-b", data);
    store.set("numu.auth", "the sign-in");
    clearCache();
    expect([...store.keys()]).toEqual(["numu.auth"]);
  });

  it("is skipped rather than saved when it would be too big", () => {
    const big = { ...data, comments: [{ ...data.comments[0], body: "x".repeat(3_100_000) }] } as Dataset;
    writeCache("user-a", big);
    expect(readCache("user-a")).toBeNull();
  });
});

describe("links", () => {
  it("task and client pages take their id in the address", () => {
    expect(taskHref("abc")).toBe("/task?id=abc");
    expect(clientHref("a b")).toBe("/client?id=a%20b");
  });
});

describe("signals", () => {
  it("tell subscribers only when the value changes", () => {
    const s = createSignal(1);
    let calls = 0;
    const stop = s.subscribe(() => calls++);
    s.set(1);
    s.set((n) => n + 1);
    stop();
    s.set(5);
    expect(calls).toBe(1);
    expect(s.get()).toBe(5);
  });
});

// A stand-in for the Supabase client: answers each table from `server` and
// notes what was asked.
function fakeSupabase(server: Record<string, unknown[]>, asked: string[]): Supabase {
  return {
    from(table: string) {
      let rows = server[table] ?? [];
      const q = {
        select: () => q,
        order: () => q,
        gt(_col: string, n: number) {
          asked.push(`${table}>${n}`);
          rows = (rows as { id: number }[]).filter((r) => r.id > n);
          return q;
        },
        range(a: number, b: number) {
          if (a === 0 && !asked.some((x) => x.startsWith(table))) asked.push(table);
          return Promise.resolve({ data: rows.slice(a, b + 1), error: null });
        },
      };
      return q;
    },
  } as unknown as Supabase;
}

describe("catching up with the database", () => {
  const lastId = Math.max(...data.statusEvents.map((e) => e.id));
  const moved = { ...data.deliverables[0], title: "Renamed by a teammate" };
  const newEvent = { ...data.statusEvents[0], id: lastId + 1, deliverable_id: moved.id };

  it("after a change, reloads only tasks, comments and the history that is new", async () => {
    const asked: string[] = [];
    const sb = fakeSupabase({ deliverables: [moved, ...data.deliverables.slice(1)], comments: data.comments, status_events: [...data.statusEvents, newEvent] }, asked);
    const next = await reloadDataset(sb, data, "work");
    expect(asked.sort()).toEqual(["comments", "deliverables", `status_events>${lastId}`].sort());
    expect(next.deliverables[0].title).toBe("Renamed by a teammate");
    expect(next.statusEvents.length).toBe(data.statusEvents.length + 1);
    expect(next.clients).toBe(data.clients); // untouched tables are kept as they were
  });

  it("drops history the app added itself while waiting, and history of deleted tasks", async () => {
    const waiting = { ...data.statusEvents[0], id: -5 };
    const gone = data.deliverables[1].id;
    const prev = { ...data, statusEvents: [...data.statusEvents, waiting] };
    const sb = fakeSupabase({ deliverables: data.deliverables.filter((d) => d.id !== gone), comments: [], status_events: data.statusEvents }, []);
    const next = await reloadDataset(sb, prev, "work");
    expect(next.statusEvents.some((e) => e.id < 0)).toBe(false);
    expect(next.statusEvents.some((e) => e.deliverable_id === gone)).toBe(false);
  });
});
