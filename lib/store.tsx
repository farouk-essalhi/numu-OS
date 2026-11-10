"use client";

// The app's data source. Two backends behind one API:
//   live  Supabase: load what this person may see (RLS), write as them, then
//         catch up in the background. Card moves and edits show at once
//         (optimistic) and roll back if the database refuses them.
//   demo  fictional data held in this browser, when Supabase isn't configured
//         (local development, tests). Same rules, applied locally.
//
// Speed notes (decisions 50-51):
//   * The app opens from a copy of the last loaded data kept in this browser
//     (lib/cache.ts) and refreshes straight away, so there's no wait on the
//     network to see your work.
//   * After a change, only the tables that change all day are reloaded, and
//     only the status history that is new (reloadDataset).
//   * Messages and the "synced" indicator live outside the main context, so
//     showing one doesn't redraw every screen.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AvatarTints, avatarTints } from "@/components/ui";
import {
  deleteRow,
  deleteRows,
  ENTITIES,
  insertComment,
  insertRow,
  loadDataset,
  payloadFor,
  reloadDataset,
  runGenerator,
  setMyLogin,
  updateRow,
  type EntityKey,
  type EntityRow,
  type Result,
  type Scope,
} from "./backend";
import { clearCache, readCache, writeCache, writeCacheSoon } from "./cache";
import { qatarHour, qatarToday, monthStart } from "./dates";
import { buildDemoDataset, DEMO_DEFAULT_USER } from "./demo/data";
import { generateMonth } from "./generator";
import { authPasswordError, normalizeUsername } from "./logins";
import { boardRows, type BoardRow } from "./selectors";
import { createSignal, useSignal, type Signal } from "./signals";
import { savedUser, supabase, supabaseConfigured } from "./supabase";
import type { AccessLevel, Dataset, Deliverable, DeliverableStatus, IsoDate, TeamMember } from "./types";
import { applyMove, type MoveResult } from "./workflow";

export type { EntityKey, EntityRow, Result } from "./backend";

const VIEW_AS_KEY = "numu.demo.viewAs";

export interface NewDeliverableInput {
  client_id: string;
  project_id: string | null;
  /** Set when it repeats: the scope line it belongs to (seq 1 of its month), on this retainer. */
  scope_line_id?: string | null;
  retainer_id?: string | null;
  /** Makes it a subtask of this task (it takes the parent's client and campaign). */
  parent_id?: string | null;
  sort_order?: number;
  deliverable_type: Deliverable["deliverable_type"];
  title: string;
  platform: Deliverable["platform"];
  owner_id: string | null;
  due_date: IsoDate;
}

export type DeliverablePatch = Partial<
  Pick<Deliverable, "title" | "owner_id" | "due_date" | "post_date" | "script_url" | "raw_url" | "final_url" | "post_url" | "sort_order">
>;

// ---------------------------------------------------------------------------
// Messages (toasts) and sync state: shared values outside the main context.
// ---------------------------------------------------------------------------
export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
  /** A link or button after the text, e.g. "Open" or "Undo". */
  action?: ToastAction;
}

export type ToastAction = { label: string; href: string } | { label: string; run: () => void };

const toastSignal = createSignal<Toast[]>([]);
let toastSeq = 0;

/** Show a short message at the bottom of the screen. Safe to call from anywhere. */
export function notify(text: string, tone: Toast["tone"] = "info", action?: ToastAction): void {
  const id = ++toastSeq;
  toastSignal.set((t) => [...t.slice(-2), { id, text, tone, action }]);
  setTimeout(() => dismissToast(id), tone === "error" || action ? 6000 : 3500);
}

function dismissToast(id: number) {
  toastSignal.set((t) => (t.some((x) => x.id === id) ? t.filter((x) => x.id !== id) : t));
}

/** When the data was last loaded from Supabase, and whether a reload is running. */
export interface SyncState {
  at: number;
  busy: boolean;
}

const syncSignal = createSignal<SyncState>({ at: 0, busy: false });

export function useSyncState(): SyncState {
  return useSignal(syncSignal);
}

// ---------------------------------------------------------------------------
// The main context
// ---------------------------------------------------------------------------
interface NumuValue {
  data: Dataset;
  rows: BoardRow[];
  me: TeamMember;
  role: AccessLevel;
  today: IsoDate;
  thisMonth: IsoDate;
  now: Date;
  hour: number;
  /** Fictional demo data (no Supabase configured). */
  isDemo: boolean;
  /** A real person is signed in (then "View as" is off). */
  signedIn: boolean;
  move: (id: string, to: DeliverableStatus) => MoveResult;
  update: (id: string, patch: DeliverablePatch) => void;
  create: (input: NewDeliverableInput) => { ok: true; id: string } | { ok: false; reason: string };
  comment: (id: string, body: string) => void;
  /** Insert or update a client, contact, retainer, scope line, project or team member. */
  save: <K extends EntityKey>(entity: K, row: EntityRow<K>) => Promise<Result>;
  remove: (entity: EntityKey, id: string) => Promise<Result>;
  /** Delete several tasks/deliverables at once (leads and partners). */
  removeMany: (ids: string[]) => Promise<Result>;
  /** My own sign-in: username and password. */
  setMyUsername: (username: string) => Promise<Result>;
  setMyPassword: (password: string) => Promise<Result>;
  /** Partners: make someone choose a new username and password at next sign-in. */
  askToSetUpAgain: (memberId: string) => Promise<Result>;
  generate: (month: IsoDate, retainerId?: string | null) => Promise<{ ok: true; created: number } | { ok: false; reason: string }>;
  refresh: () => Promise<void>;
  notify: typeof notify;
  signOut: () => Promise<void>;
  viewAs: (teamMemberId: string) => void;
  /** Demo only: drop the fictional clients and work to try entering your own. */
  clearDemo: () => void;
}

const NumuContext = createContext<NumuValue | null>(null);

// ---------------------------------------------------------------------------
// Live boot: who is signed in and what they may see. Cached per page load so
// React's use() gets the same promise on every render.
// ---------------------------------------------------------------------------
export type LiveBoot =
  | {
      kind: "ready";
      data: Dataset;
      meId: string;
      userId: string;
      email: string;
      /** Set when `data` is the copy saved in this browser (it is refreshed at once). */
      cachedAt: number | null;
    }
  | { kind: "signed_out" }
  | { kind: "no_member"; email: string }
  | { kind: "error"; message: string };

let bootCache: Promise<LiveBoot> | null = null;

export function liveBoot(): Promise<LiveBoot> {
  bootCache ??= (async (): Promise<LiveBoot> => {
    try {
      // Fast start: this browser is signed in and has a copy of the data, so
      // open now. The refresh that follows renews the sign-in if it has run
      // out; one that is no longer valid ends at /login (app-root, Sync).
      const peek = savedUser();
      const fast = peek ? openSaved(peek.id, peek.email) : null;
      if (fast) return fast;

      const sb = supabase();
      const { data: auth } = await sb.auth.getSession();
      const user = auth.session?.user;
      if (!user) {
        clearCache();
        return { kind: "signed_out" };
      }
      const email = user.email ?? "";
      const saved = openSaved(user.id, email);
      if (saved) return saved;

      const data = await loadDataset(sb);
      const me = data.team.find((m) => m.user_id === user.id && m.is_active);
      if (!me) return { kind: "no_member", email };
      writeCache(user.id, data);
      return { kind: "ready", data, meId: me.id, userId: user.id, email, cachedAt: null };
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) };
    }
  })();
  return bootCache;
}

/** The saved copy for this login, if it can be opened from. */
function openSaved(userId: string, email: string): LiveBoot | null {
  const saved = readCache(userId);
  // Not while they still have to choose their login: that check needs fresh data.
  const me = saved?.data.team.find((m) => m.user_id === userId && m.is_active && m.credentials_set_at);
  return saved && me ? { kind: "ready", data: saved.data, meId: me.id, userId, email, cachedAt: saved.at } : null;
}

export { supabaseConfigured };

function readViewAs(): string {
  try {
    return localStorage.getItem(VIEW_AS_KEY) ?? DEMO_DEFAULT_USER;
  } catch {
    return DEMO_DEFAULT_USER;
  }
}

const EMPTY_DEMO = (d: Dataset): Dataset => ({
  ...d,
  clients: [],
  contacts: [],
  retainers: [],
  scopeLines: [],
  projects: [],
  deliverables: [],
  statusEvents: [],
  comments: [],
});

// ---------------------------------------------------------------------------
// Local copies of what the database does, so a change shows before it answers.
// ---------------------------------------------------------------------------

/** What deleting a row would break, the way the database's foreign keys refuse it. */
function blocksDelete(data: Dataset, entity: EntityKey, id: string): string | null {
  const inUse = "It's still in use (it has deliverables, retainers or projects). Mark it ended or cancelled instead";
  if (
    entity === "clients" &&
    (data.retainers.some((r) => r.client_id === id) || data.projects.some((p) => p.client_id === id) || data.deliverables.some((d) => d.client_id === id))
  )
    return inUse;
  if (entity === "retainers" && data.deliverables.some((d) => d.retainer_id === id)) return inUse;
  if (entity === "projects" && data.deliverables.some((d) => d.project_id === id)) return inUse;
  return null;
}

function deleteLocal(data: Dataset, entity: EntityKey, id: string): Dataset {
  const next = { ...data, [entity]: (data[entity] as { id: string }[]).filter((r) => r.id !== id) } as Dataset;
  if (entity === "clients") next.contacts = next.contacts.filter((c) => c.client_id !== id);
  if (entity === "retainers") next.scopeLines = next.scopeLines.filter((s) => s.retainer_id !== id);
  if (entity === "scopeLines") next.deliverables = next.deliverables.map((d) => (d.scope_line_id === id ? { ...d, scope_line_id: null } : d));
  if (entity === "deliverables") {
    // Its subtasks go too (the database cascades the same way).
    const gone = new Set([id, ...data.deliverables.filter((d) => d.parent_id === id).map((d) => d.id)]);
    next.deliverables = next.deliverables.filter((d) => !gone.has(d.id));
    next.statusEvents = next.statusEvents.filter((e) => !gone.has(e.deliverable_id));
    next.comments = next.comments.filter((c) => !gone.has(c.deliverable_id));
  }
  if (entity === "team") {
    next.clients = next.clients.map((c) => (c.account_lead_id === id ? { ...c, account_lead_id: null } : c));
    next.deliverables = next.deliverables.map((d) => (d.owner_id === id ? { ...d, owner_id: null } : d));
    next.scopeLines = next.scopeLines.map((s) => (s.default_owner_id === id ? { ...s, default_owner_id: null } : s));
  }
  return next;
}

function upsertLocal<K extends EntityKey>(data: Dataset, entity: K, row: EntityRow<K>): Dataset {
  const list = data[entity] as { id: string }[];
  const next = list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
  return { ...data, [entity]: next } as Dataset;
}

// History rows the app adds while waiting for the database get negative ids.
let tempSeq = 0;
const tempId = () => -(Date.now() * 1000 + (++tempSeq % 1000));

const widest = (a: Scope | null, b: Scope): Scope => (a === "all" || b === "all" ? "all" : "work");

/**
 * Live sync: reloads and writes. Writes in flight hold back reloads, so a
 * reload never undoes a card move the database hasn't confirmed yet. A plain
 * object (not hooks) so its methods are stable for the whole session.
 */
class Sync {
  private pending = 0;
  /** Counts writes, so a reload that overlapped one is thrown away. */
  private writes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduled: Scope | null = null;
  private running = false;
  private wanted: Scope | null = null;
  lastLoad = Date.now();

  constructor(
    private live: { userId: string; meId: string } | null,
    /** The data on screen: partial reloads are merged into it. */
    private store: Signal<Dataset>,
  ) {}

  refresh = async (scope: Scope = "all"): Promise<void> => {
    const live = this.live;
    if (!live) {
      // Demo data lives in this tab: nothing to fetch, but the indicator still answers.
      syncSignal.set({ at: Date.now(), busy: false });
      return;
    }
    if (this.running) {
      // One reload at a time; remember that another was asked for.
      this.wanted = widest(this.wanted, scope);
      return;
    }
    this.running = true;
    const writesBefore = this.writes;
    syncSignal.set((s) => ({ ...s, busy: true }));
    try {
      const next = await reloadDataset(supabase(), this.store.get(), scope);
      this.lastLoad = Date.now();
      if (scope === "all" && !next.team.some((m) => m.id === live.meId && m.is_active)) {
        // No longer on the team: drop the saved copy and let the app say so.
        clearCache();
        location.reload();
        return;
      }
      if (this.pending === 0 && this.writes === writesBefore) {
        this.store.set(next);
        writeCacheSoon(live.userId, next);
        syncSignal.set({ at: this.lastLoad, busy: false });
      } else {
        // Something changed while this was loading: don't draw over it, ask again.
        syncSignal.set((s) => ({ ...s, busy: false }));
        this.schedule(500, scope);
      }
    } catch {
      syncSignal.set((s) => ({ ...s, busy: false }));
      if (!savedUser()) {
        // The sign-in is gone from this browser (signed out in another tab, or it ended).
        clearCache();
        location.replace("/login");
        return;
      }
      notify("Couldn't refresh. Check your connection", "error");
    } finally {
      this.running = false;
      if (this.wanted) {
        const again = this.wanted;
        this.wanted = null;
        void this.refresh(again);
      }
    }
  };

  schedule = (ms = 500, scope: Scope = "all") => {
    this.scheduled = widest(this.scheduled, scope);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending > 0) return this.schedule(ms, scope);
      const what = this.scheduled ?? scope;
      this.scheduled = null;
      void this.refresh(what);
    }, ms);
  };

  track = async <T,>(fn: () => Promise<T>): Promise<T> => {
    this.pending++;
    this.writes++;
    try {
      return await fn();
    } finally {
      this.pending--;
    }
  };

  /** Run a write, say so if it failed, and catch up with the database shortly after. */
  write = async (fn: () => Promise<Result>, opts: { quiet?: boolean; scope?: Scope } = {}): Promise<Result> => {
    const r = await this.track(fn);
    if (!r.ok && !opts.quiet) notify(r.reason, "error");
    this.schedule(500, opts.scope ?? "work");
    return r;
  };
}

export interface LiveStart {
  data: Dataset;
  meId: string;
  userId: string;
  cachedAt: number | null;
}

export function NumuProvider({ children, live = null }: { children: ReactNode; live?: LiveStart | null }) {
  const isLive = live !== null;
  const [now] = useState(() => new Date());
  const [hour] = useState(() => qatarHour());
  // Today in Doha. Checked every minute so a tab left open overnight rolls over.
  const [today, setToday] = useState(() => qatarToday(now));
  useEffect(() => {
    const t = setInterval(() => setToday(qatarToday()), 60_000);
    return () => clearInterval(t);
  }, []);

  // The data lives in one shared value: screens redraw when it changes, and
  // actions always read the latest (so "Undo" a few seconds later still works).
  const [store] = useState(() => createSignal<Dataset>(live?.data ?? buildDemoDataset(today, now)));
  const data = useSignal(store);
  const setData = store.set;
  const [demoMeId, setDemoMeId] = useState(readViewAs);

  const [sync] = useState(() => new Sync(live ? { userId: live.userId, meId: live.meId } : null, store));
  const { write } = sync;

  // Opened from the saved copy: say how old it is and catch up right away.
  const cachedAt = live?.cachedAt ?? null;
  useEffect(() => {
    syncSignal.set({ at: cachedAt ?? Date.now(), busy: false });
    if (cachedAt) void sync.refresh("all");
  }, [sync, cachedAt]);

  const meId = live?.meId ?? demoMeId;
  // If a refresh no longer includes me (deactivated), keep my row from sign-in
  // until the reload sends me to "no access".
  const me = (data.team.find((m) => m.id === meId) ??
    (live ? live.data.team.find((m) => m.id === meId) : data.team.find((m) => m.id === DEMO_DEFAULT_USER)) ??
    data.team[0])!;
  const role = me.access_level;
  const rows = useMemo(() => boardRows(data, today, new Date()), [data, today]);

  // Pick up teammates' changes when coming back to the tab, and every two
  // minutes while it's open.
  useEffect(() => {
    if (!isLive) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - sync.lastLoad > 30_000) sync.schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const every = setInterval(() => {
      if (document.visibilityState === "visible") sync.schedule(0);
    }, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(every);
    };
  }, [isLive, sync]);

  // --- deliverables ---------------------------------------------------------
  const move = useCallback(
    (id: string, to: DeliverableStatus): MoveResult => {
      const d = store.get().deliverables.find((x) => x.id === id);
      if (!d) return { ok: false, reason: "Not found" };
      const result = applyMove(d, to, { teamMemberId: me.id, perms: me });
      if (result.ok) {
        setData((prev) => ({
          ...prev,
          deliverables: prev.deliverables.map((x) => (x.id === id ? result.deliverable : x)),
          statusEvents: [...prev.statusEvents, { ...result.event, id: tempId() }],
        }));
        if (isLive) void write(() => updateRow(supabase(), "deliverables", id, { status: to }));
      }
      return result;
    },
    [store, setData, me, isLive, write],
  );

  const update = useCallback(
    (id: string, patch: DeliverablePatch) => {
      const d = store.get().deliverables.find((x) => x.id === id);
      if (!d) return;
      const payload: Record<string, unknown> = { ...patch };
      if (patch.due_date && d.project_id) payload.month = monthStart(patch.due_date);
      setData((prev) => ({
        ...prev,
        deliverables: prev.deliverables.map((x) => (x.id === id ? ({ ...x, ...payload } as Deliverable) : x)),
      }));
      if (isLive) void write(() => updateRow(supabase(), "deliverables", id, payload));
    },
    [store, setData, isLive, write],
  );

  const create = useCallback(
    (input: NewDeliverableInput) => {
      if (!me.can_create_tasks) return { ok: false as const, reason: "Adding tasks needs permission (Team → Permissions)" };
      const data = store.get();
      const type = data.deliverableTypes.find((t) => t.code === input.deliverable_type)!;
      // A subtask belongs wherever its parent does (the database copies it too).
      const parent = input.parent_id ? data.deliverables.find((x) => x.id === input.parent_id) : null;
      if (input.parent_id && !parent) return { ok: false as const, reason: "That task doesn't exist any more" };
      if (parent?.parent_id) return { ok: false as const, reason: "Subtasks can't have subtasks of their own" };
      if (parent && type.is_content) return { ok: false as const, reason: "Subtasks are tasks, not content" };
      const clientId = parent?.client_id ?? input.client_id;
      const projectId = parent ? parent.project_id : input.project_id;
      // Content counts against a campaign or the client's active retainer (an
      // extra outside scope). A task can stand alone, or sit on a campaign, or
      // repeat through a scope line on the retainer.
      const retainerId = parent
        ? parent.retainer_id
        : input.project_id
          ? null
          : (input.retainer_id ??
            (type.is_content ? data.retainers.find((r) => r.client_id === input.client_id && r.status === "active")?.id : null) ??
            null);
      if (type.is_content && !projectId && !retainerId) return { ok: false as const, reason: "This client has no active retainer" };
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const d: Deliverable = {
        id,
        client_id: clientId,
        retainer_id: retainerId,
        scope_line_id: parent ? null : (input.scope_line_id ?? null), // none on content = an extra outside scope
        project_id: projectId,
        deliverable_type: input.deliverable_type,
        title: input.title.trim(),
        month: monthStart(input.due_date),
        seq: input.scope_line_id ? 1 : null,
        platform: input.platform,
        owner_id: input.owner_id,
        due_date: input.due_date,
        post_date: null,
        status: "planned",
        revision_count: 0,
        effort_points: type.effort_points,
        script_url: null,
        raw_url: null,
        final_url: null,
        post_url: null,
        posted_at: null,
        created_at: createdAt,
        parent_id: parent?.id ?? null,
        sort_order: input.sort_order ?? 0,
      };
      setData((prev) => ({
        ...prev,
        deliverables: [...prev.deliverables, d],
        statusEvents: [
          ...prev.statusEvents,
          {
            id: tempId(),
            deliverable_id: id,
            from_status: null,
            to_status: "planned",
            changed_by_team_member_id: me.id,
            changed_by_contact_id: null,
            changed_at: createdAt,
          },
        ],
      }));
      if (isLive) void write(() => insertRow(supabase(), "deliverables", id, payloadFor("deliverables", d)));
      return { ok: true as const, id };
    },
    [store, setData, me.id, me.can_create_tasks, isLive, write],
  );

  const comment = useCallback(
    (id: string, body: string) => {
      const text = body.trim();
      if (!text) return;
      const commentId = crypto.randomUUID();
      setData((prev) => ({
        ...prev,
        comments: [
          ...prev.comments,
          {
            id: commentId,
            deliverable_id: id,
            author_team_member_id: me.id,
            author_contact_id: null,
            body: text,
            is_internal: true,
            created_at: new Date().toISOString(),
          },
        ],
      }));
      if (isLive) void write(() => insertComment(supabase(), commentId, id, text));
    },
    [setData, me.id, isLive, write],
  );

  // --- clients, contacts, retainers, scope, projects, team -----------------
  // The form waits for the database's answer (it may refuse: a duplicate name,
  // a missing permission), then the change shows at once; the full reload
  // follows in the background instead of holding the form open.
  const save = useCallback(
    async <K extends EntityKey>(entity: K, row: EntityRow<K>): Promise<Result> => {
      if (isLive) {
        const exists = (store.get()[entity] as { id: string }[]).some((r) => r.id === row.id);
        const sb = supabase();
        const payload = payloadFor(entity, row);
        const r = await write(() => (exists ? updateRow(sb, entity, row.id, payload) : insertRow(sb, entity, row.id, payload)), {
          quiet: true,
          scope: "all",
        });
        if (!r.ok) return r;
      }
      setData((prev) => upsertLocal(prev, entity, row));
      return { ok: true };
    },
    [store, setData, isLive, write],
  );

  const remove = useCallback(
    async (entity: EntityKey, id: string): Promise<Result> => {
      if (isLive) {
        const r = await write(() => deleteRow(supabase(), entity, id), { quiet: true, scope: entity === "deliverables" ? "work" : "all" });
        if (!r.ok) return r;
      } else {
        const blocked = blocksDelete(store.get(), entity, id);
        if (blocked) return { ok: false, reason: blocked };
      }
      setData((prev) => deleteLocal(prev, entity, id));
      return { ok: true };
    },
    [store, setData, isLive, write],
  );

  const removeMany = useCallback(
    async (ids: string[]): Promise<Result> => {
      if (ids.length === 0) return { ok: true };
      if (isLive) {
        const r = await write(() => deleteRows(supabase(), "deliverables", ids), { quiet: true });
        if (!r.ok) return r; // the reload that follows shows what did go
      }
      setData((prev) => ids.reduce((d, id) => deleteLocal(d, "deliverables", id), prev));
      return { ok: true };
    },
    [setData, isLive, write],
  );

  const setMyUsername = useCallback(
    async (username: string): Promise<Result> => {
      const name = normalizeUsername(username);
      if (isLive) {
        const r = await sync.track(() => setMyLogin(supabase(), name));
        if (!r.ok) return r;
        sync.schedule(0, "all");
      } else if (store.get().team.some((m) => m.id !== me.id && m.username === name)) {
        return { ok: false, reason: "That username is taken" };
      }
      setData((prev) => ({
        ...prev,
        team: prev.team.map((m) => (m.id === me.id ? { ...m, username: name, credentials_set_at: m.credentials_set_at ?? new Date().toISOString() } : m)),
      }));
      return { ok: true };
    },
    [store, setData, isLive, sync, me.id],
  );

  const setMyPassword = useCallback(
    async (password: string): Promise<Result> => {
      if (!isLive) return { ok: true }; // demo: nothing to change
      const { error } = await supabase().auth.updateUser({ password });
      return error ? { ok: false, reason: authPasswordError(error.message) } : { ok: true };
    },
    [isLive],
  );

  const askToSetUpAgain = useCallback(
    async (memberId: string): Promise<Result> => {
      if (isLive) {
        const r = await write(() => updateRow(supabase(), "team", memberId, { credentials_set_at: null }), { quiet: true, scope: "all" });
        if (!r.ok) return r;
      }
      setData((prev) => ({ ...prev, team: prev.team.map((m) => (m.id === memberId ? { ...m, credentials_set_at: null } : m)) }));
      return { ok: true };
    },
    [setData, isLive, write],
  );

  const generate = useCallback(
    async (month: IsoDate, retainerId?: string | null) => {
      if (role === "creator") return { ok: false as const, reason: "Partners and account leads generate deliverables" };
      if (isLive) {
        const r = await sync.track(() => runGenerator(supabase(), monthStart(month), retainerId));
        await sync.refresh("work");
        return r;
      }
      const out = generateMonth(store.get(), month, { retainerId });
      setData((prev) => ({
        ...prev,
        deliverables: [...prev.deliverables, ...out.deliverables],
        statusEvents: [...prev.statusEvents, ...out.events.map((e) => ({ ...e, id: tempId() }))],
      }));
      return { ok: true as const, created: out.deliverables.length };
    },
    [store, setData, role, isLive, sync],
  );

  const refresh = useCallback(() => sync.refresh("all"), [sync]);

  const signOut = useCallback(async () => {
    if (!isLive) return;
    await supabase().auth.signOut();
    clearCache();
    // A full load, so nothing from this session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }, [isLive]);

  const viewAs = useCallback((teamMemberId: string) => {
    setDemoMeId(teamMemberId);
    try {
      localStorage.setItem(VIEW_AS_KEY, teamMemberId);
    } catch {
      // ignore
    }
  }, []);

  const clearDemo = useCallback(() => {
    if (!isLive) setData((prev) => EMPTY_DEMO(prev));
  }, [setData, isLive]);

  const tints = useMemo(() => avatarTints(data.team.map((m) => m.full_name)), [data.team]);

  // One object that only changes when something a screen shows has changed.
  const value = useMemo<NumuValue>(
    () => ({
      data,
      rows,
      me,
      role,
      today,
      thisMonth: monthStart(today),
      now,
      hour,
      isDemo: !isLive,
      signedIn: isLive,
      move,
      update,
      create,
      comment,
      save,
      remove,
      removeMany,
      setMyUsername,
      setMyPassword,
      askToSetUpAgain,
      generate,
      refresh,
      notify,
      signOut,
      viewAs,
      clearDemo,
    }),
    [
      data,
      rows,
      me,
      role,
      today,
      now,
      hour,
      isLive,
      move,
      update,
      create,
      comment,
      save,
      remove,
      removeMany,
      setMyUsername,
      setMyPassword,
      askToSetUpAgain,
      generate,
      refresh,
      signOut,
      viewAs,
      clearDemo,
    ],
  );

  return (
    <NumuContext value={value}>
      <AvatarTints value={tints}>
        {children}
        <Toaster />
      </AvatarTints>
    </NumuContext>
  );
}

function Toaster() {
  const toasts = useSignal(toastSignal);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in pointer-events-auto flex max-w-[480px] items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-4 text-[13px] text-ink shadow-lg"
          role={t.tone === "error" ? "alert" : "status"}
        >
          <button type="button" onClick={() => dismissToast(t.id)} className="flex min-h-9 items-center gap-2.5 py-1.5 pr-2 text-left">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: t.tone === "error" ? "var(--critical)" : t.tone === "success" ? "var(--good)" : "var(--focus)" }}
            />
            {t.text}
          </button>
          {t.action ? (
            "href" in t.action ? (
              <Link
                href={t.action.href}
                onClick={() => dismissToast(t.id)}
                className="shrink-0 rounded-lg px-2.5 py-1.5 font-medium text-ink underline-offset-2 hover:bg-surface-3"
              >
                {t.action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if ("run" in t.action!) t.action.run();
                  dismissToast(t.id);
                }}
                className="shrink-0 rounded-lg px-2.5 py-1.5 font-medium text-ink hover:bg-surface-3"
              >
                {t.action.label}
              </button>
            )
          ) : (
            <span className="w-2" />
          )}
        </div>
      ))}
    </div>
  );
}

export function useNumu(): NumuValue {
  const value = useContext(NumuContext);
  if (!value) throw new Error("useNumu must be used inside <NumuProvider>");
  return value;
}

/** Who may plan work and edit clients, retainers and scope. */
export function canPlan(role: AccessLevel): boolean {
  return role !== "creator";
}

export { ENTITIES };
