"use client";

// The app's data source. Two backends behind one API:
//   live  Supabase: load what this person may see (RLS), write as them, then
//         reload. Card moves and edits show at once (optimistic) and roll back
//         if the database refuses them.
//   demo  fictional data held in this browser, when Supabase isn't configured
//         (local development, tests). Same rules, applied locally.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  deleteRow,
  ENTITIES,
  insertComment,
  insertRow,
  loadDataset,
  payloadFor,
  runGenerator,
  updateRow,
  type EntityKey,
  type EntityRow,
  type Result,
} from "./backend";
import { qatarHour, qatarToday, monthStart } from "./dates";
import { buildDemoDataset, DEMO_DEFAULT_USER } from "./demo/data";
import { generateMonth } from "./generator";
import { boardRows, type BoardRow } from "./selectors";
import { supabase, supabaseConfigured } from "./supabase";
import type { AccessLevel, Dataset, Deliverable, DeliverableStatus, IsoDate, TeamMember } from "./types";
import { applyMove, type MoveResult } from "./workflow";

export type { EntityKey, EntityRow, Result } from "./backend";

const VIEW_AS_KEY = "numu.demo.viewAs";

export interface NewDeliverableInput {
  client_id: string;
  project_id: string | null;
  deliverable_type: Deliverable["deliverable_type"];
  title: string;
  platform: Deliverable["platform"];
  owner_id: string | null;
  due_date: IsoDate;
}

export type DeliverablePatch = Partial<
  Pick<Deliverable, "title" | "owner_id" | "due_date" | "post_date" | "script_url" | "raw_url" | "final_url" | "post_url">
>;

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

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
  generate: (month: IsoDate, retainerId?: string | null) => Promise<{ ok: true; created: number } | { ok: false; reason: string }>;
  refresh: () => Promise<void>;
  notify: (text: string, tone?: Toast["tone"]) => void;
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
  | { kind: "ready"; data: Dataset; meId: string }
  | { kind: "signed_out" }
  | { kind: "no_member"; email: string }
  | { kind: "error"; message: string };

let bootCache: Promise<LiveBoot> | null = null;

export function liveBoot(): Promise<LiveBoot> {
  bootCache ??= (async (): Promise<LiveBoot> => {
    try {
      const sb = supabase();
      const { data: auth } = await sb.auth.getSession();
      const user = auth.session?.user;
      if (!user) return { kind: "signed_out" };
      const data = await loadDataset(sb);
      const me = data.team.find((m) => m.user_id === user.id && m.is_active);
      if (!me) return { kind: "no_member", email: user.email ?? "" };
      return { kind: "ready", data, meId: me.id };
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) };
    }
  })();
  return bootCache;
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

/** What deleting a row would break, the way the database's foreign keys refuse it. */
function demoBlocksDelete(data: Dataset, entity: EntityKey, id: string): string | null {
  const inUse = "It's still in use (it has deliverables, retainers or projects). Mark it ended or cancelled instead";
  if (entity === "clients" && (data.retainers.some((r) => r.client_id === id) || data.projects.some((p) => p.client_id === id) || data.deliverables.some((d) => d.client_id === id))) return inUse;
  if (entity === "retainers" && data.deliverables.some((d) => d.retainer_id === id)) return inUse;
  if (entity === "projects" && data.deliverables.some((d) => d.project_id === id)) return inUse;
  return null;
}

function demoDelete(data: Dataset, entity: EntityKey, id: string): Dataset {
  const next = { ...data, [entity]: (data[entity] as { id: string }[]).filter((r) => r.id !== id) } as Dataset;
  if (entity === "clients") next.contacts = next.contacts.filter((c) => c.client_id !== id);
  if (entity === "retainers") next.scopeLines = next.scopeLines.filter((s) => s.retainer_id !== id);
  if (entity === "scopeLines") next.deliverables = next.deliverables.map((d) => (d.scope_line_id === id ? { ...d, scope_line_id: null } : d));
  if (entity === "deliverables") {
    next.statusEvents = next.statusEvents.filter((e) => e.deliverable_id !== id);
    next.comments = next.comments.filter((c) => c.deliverable_id !== id);
  }
  if (entity === "team") {
    next.clients = next.clients.map((c) => (c.account_lead_id === id ? { ...c, account_lead_id: null } : c));
    next.deliverables = next.deliverables.map((d) => (d.owner_id === id ? { ...d, owner_id: null } : d));
    next.scopeLines = next.scopeLines.map((s) => (s.default_owner_id === id ? { ...s, default_owner_id: null } : s));
  }
  return next;
}

/**
 * Live sync: toasts, reloads and writes. Writes in flight hold back reloads,
 * so a reload never undoes a card move the database hasn't confirmed yet.
 * A plain object (not hooks) so its methods are stable for the whole session.
 */
class Sync {
  private pending = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private toastSeq = 0;
  lastLoad = Date.now();

  constructor(
    private live: boolean,
    private setData: (d: Dataset) => void,
    private setToasts: Dispatch<SetStateAction<Toast[]>>,
  ) {}

  notify = (text: string, tone: Toast["tone"] = "info") => {
    const id = ++this.toastSeq;
    this.setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => this.setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  };

  refresh = async () => {
    if (!this.live) return;
    try {
      const next = await loadDataset(supabase());
      this.lastLoad = Date.now();
      if (this.pending === 0) this.setData(next);
      else this.schedule();
    } catch {
      this.notify("Couldn't refresh. Check your connection", "error");
    }
  };

  schedule = (ms = 500) => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending > 0) this.schedule(ms);
      else void this.refresh();
    }, ms);
  };

  track = async <T,>(fn: () => Promise<T>): Promise<T> => {
    this.pending++;
    try {
      return await fn();
    } finally {
      this.pending--;
    }
  };

  write = async (fn: () => Promise<Result>, quiet = false): Promise<Result> => {
    const r = await this.track(fn);
    if (!r.ok && !quiet) this.notify(r.reason, "error");
    this.schedule();
    return r;
  };
}

export function NumuProvider({ children, live = null }: { children: ReactNode; live?: { data: Dataset; meId: string } | null }) {
  const isLive = live !== null;
  const [now] = useState(() => new Date());
  const today = qatarToday(now);
  const [data, setData] = useState<Dataset>(() => live?.data ?? buildDemoDataset(today, now));
  const [demoMeId, setDemoMeId] = useState(readViewAs);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const meId = live?.meId ?? demoMeId;
  // If a refresh no longer includes me (deactivated), keep my row from sign-in
  // until the next page load sends me to "no access".
  const me = (data.team.find((m) => m.id === meId) ??
    (live ? live.data.team.find((m) => m.id === meId) : data.team.find((m) => m.id === DEMO_DEFAULT_USER)) ??
    data.team[0])!;
  const role = me.access_level;
  const rows = useMemo(() => boardRows(data, today, new Date()), [data, today]);

  const [sync] = useState(() => new Sync(isLive, setData, setToasts));
  const { notify, refresh, write } = sync;

  // Pick up teammates' changes when coming back to the tab.
  useEffect(() => {
    if (!isLive) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - sync.lastLoad > 30_000) sync.schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isLive, sync]);

  // --- deliverables ---------------------------------------------------------
  const move = useCallback(
    (id: string, to: DeliverableStatus): MoveResult => {
      const d = data.deliverables.find((x) => x.id === id);
      if (!d) return { ok: false, reason: "Not found" };
      const result = applyMove(d, to, { teamMemberId: me.id, role });
      if (result.ok) {
        setData((prev) => ({
          ...prev,
          deliverables: prev.deliverables.map((x) => (x.id === id ? result.deliverable : x)),
          statusEvents: [...prev.statusEvents, { ...result.event, id: -Date.now() }],
        }));
        if (isLive) void write(() => updateRow(supabase(), "deliverables", id, { status: to }));
      }
      return result;
    },
    [data.deliverables, me.id, role, isLive, write],
  );

  const update = useCallback(
    (id: string, patch: DeliverablePatch) => {
      const d = data.deliverables.find((x) => x.id === id);
      if (!d) return;
      const payload: Record<string, unknown> = { ...patch };
      if (patch.due_date && d.project_id) payload.month = monthStart(patch.due_date);
      setData((prev) => ({
        ...prev,
        deliverables: prev.deliverables.map((x) => (x.id === id ? ({ ...x, ...payload } as Deliverable) : x)),
      }));
      if (isLive) void write(() => updateRow(supabase(), "deliverables", id, payload));
    },
    [data.deliverables, isLive, write],
  );

  const create = useCallback(
    (input: NewDeliverableInput) => {
      if (role === "creator") return { ok: false as const, reason: "Partners and account leads add deliverables" };
      const retainer = input.project_id
        ? null
        : data.retainers.find((r) => r.client_id === input.client_id && r.status === "active");
      if (!input.project_id && !retainer) return { ok: false as const, reason: "This client has no active retainer" };
      const type = data.deliverableTypes.find((t) => t.code === input.deliverable_type)!;
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const d: Deliverable = {
        id,
        client_id: input.client_id,
        retainer_id: retainer?.id ?? null,
        scope_line_id: null, // added by hand = an extra outside scope
        project_id: input.project_id,
        deliverable_type: input.deliverable_type,
        title: input.title.trim(),
        month: monthStart(input.due_date),
        seq: null,
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
      };
      setData((prev) => ({
        ...prev,
        deliverables: [...prev.deliverables, d],
        statusEvents: [
          ...prev.statusEvents,
          {
            id: -Date.now(),
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
    [data.retainers, data.deliverableTypes, me.id, role, isLive, write],
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
    [me.id, isLive, write],
  );

  // --- clients, contacts, retainers, scope, projects, team -----------------
  const save = useCallback(
    async <K extends EntityKey>(entity: K, row: EntityRow<K>): Promise<Result> => {
      const exists = (data[entity] as { id: string }[]).some((r) => r.id === row.id);
      if (isLive) {
        const sb = supabase();
        const payload = payloadFor(entity, row);
        const r = await write(() => (exists ? updateRow(sb, entity, row.id, payload) : insertRow(sb, entity, row.id, payload)), true);
        if (r.ok) await refresh();
        return r;
      }
      setData((prev) => {
        const list = prev[entity] as { id: string }[];
        const next = exists ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
        return { ...prev, [entity]: next } as Dataset;
      });
      return { ok: true };
    },
    [data, isLive, write, refresh],
  );

  const remove = useCallback(
    async (entity: EntityKey, id: string): Promise<Result> => {
      if (isLive) {
        const r = await write(() => deleteRow(supabase(), entity, id), true);
        if (r.ok) await refresh();
        return r;
      }
      const blocked = demoBlocksDelete(data, entity, id);
      if (blocked) return { ok: false, reason: blocked };
      setData((prev) => demoDelete(prev, entity, id));
      return { ok: true };
    },
    [data, isLive, write, refresh],
  );

  const generate = useCallback(
    async (month: IsoDate, retainerId?: string | null) => {
      if (role === "creator") return { ok: false as const, reason: "Partners and account leads generate deliverables" };
      if (isLive) {
        const r = await sync.track(() => runGenerator(supabase(), monthStart(month), retainerId));
        await refresh();
        return r;
      }
      const out = generateMonth(data, month, { retainerId });
      setData((prev) => ({
        ...prev,
        deliverables: [...prev.deliverables, ...out.deliverables],
        statusEvents: [...prev.statusEvents, ...out.events.map((e, i) => ({ ...e, id: -Date.now() - i }))],
      }));
      return { ok: true as const, created: out.deliverables.length };
    },
    [data, role, isLive, refresh, sync],
  );

  const signOut = useCallback(async () => {
    if (!isLive) return;
    await supabase().auth.signOut();
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
  }, [isLive]);

  const value: NumuValue = {
    data,
    rows,
    me,
    role,
    today,
    thisMonth: monthStart(today),
    now,
    hour: qatarHour(),
    isDemo: !isLive,
    signedIn: isLive,
    move,
    update,
    create,
    comment,
    save,
    remove,
    generate,
    refresh,
    notify,
    signOut,
    viewAs,
    clearDemo,
  };

  return (
    <NumuContext value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </NumuContext>
  );
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onDismiss(t.id)}
          className="toast-in pointer-events-auto flex max-w-[460px] items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-[13px] text-ink shadow-lg"
          role={t.tone === "error" ? "alert" : "status"}
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: t.tone === "error" ? "var(--critical)" : t.tone === "success" ? "var(--good)" : "var(--focus)" }}
          />
          {t.text}
        </button>
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
