"use client";

// The app's data source. Today it serves demo data held in the browser; when
// the Supabase project exists, this file is the one place that changes (load
// from the deliverable_board view, write through Supabase, keep the same API).

import { createContext, use, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { browser } from "react-dom";
import { qatarHour, qatarToday, monthStart } from "./dates";
import { buildDemoDataset, DEMO_DEFAULT_USER } from "./demo/data";
import { boardRows, type BoardRow } from "./selectors";
import type { AccessLevel, Dataset, Deliverable, DeliverableStatus, IsoDate, TeamMember } from "./types";
import { applyMove, type MoveResult } from "./workflow";

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

interface NumuValue {
  data: Dataset;
  rows: BoardRow[];
  me: TeamMember;
  role: AccessLevel;
  today: IsoDate;
  thisMonth: IsoDate;
  now: Date;
  hour: number;
  isDemo: true;
  /** True when this person signed in (then "View as" is off). */
  signedIn: boolean;
  move: (id: string, to: DeliverableStatus) => MoveResult;
  update: (id: string, patch: DeliverablePatch) => void;
  create: (input: NewDeliverableInput) => { ok: true; id: string } | { ok: false; reason: string };
  comment: (id: string, body: string) => void;
  viewAs: (teamMemberId: string) => void;
}

const NumuContext = createContext<NumuValue | null>(null);

function readViewAs(): string {
  try {
    return localStorage.getItem(VIEW_AS_KEY) ?? DEMO_DEFAULT_USER;
  } catch {
    return DEMO_DEFAULT_USER;
  }
}

export function NumuProvider({ children, sessionMemberId = null }: { children: ReactNode; sessionMemberId?: string | null }) {
  // Everything here depends on today's date in Doha and on this browser
  // (demo data, the "view as" choice), so it renders in the browser only.
  use(browser("NUMU OS renders per person and per day, in the browser."));

  const [now] = useState(() => new Date());
  const today = qatarToday(now);
  const [data, setData] = useState<Dataset>(() => buildDemoDataset(today, now));
  const [meId, setMeId] = useState(readViewAs);

  const signedIn = Boolean(sessionMemberId && data.team.some((m) => m.id === sessionMemberId));
  const me =
    data.team.find((m) => m.id === (signedIn ? sessionMemberId : meId)) ?? data.team.find((m) => m.id === DEMO_DEFAULT_USER)!;
  const role = me.access_level;
  const rows = useMemo(() => boardRows(data, today, new Date()), [data, today]);

  const move = useCallback(
    (id: string, to: DeliverableStatus): MoveResult => {
      const d = data.deliverables.find((x) => x.id === id);
      if (!d) return { ok: false, reason: "Not found" };
      const result = applyMove(d, to, { teamMemberId: me.id, role });
      if (result.ok) {
        setData((prev) => ({
          ...prev,
          deliverables: prev.deliverables.map((x) => (x.id === id ? result.deliverable : x)),
          statusEvents: [...prev.statusEvents, { ...result.event, id: prev.statusEvents.length + 1 }],
        }));
      }
      return result;
    },
    [data.deliverables, me.id, role],
  );

  const update = useCallback((id: string, patch: DeliverablePatch) => {
    setData((prev) => ({
      ...prev,
      deliverables: prev.deliverables.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        if (patch.due_date && x.project_id) next.month = monthStart(patch.due_date);
        return next;
      }),
    }));
  }, []);

  const create = useCallback(
    (input: NewDeliverableInput) => {
      if (role === "creator") return { ok: false as const, reason: "Partners and account leads add deliverables" };
      const retainer = input.project_id
        ? null
        : data.retainers.find((r) => r.client_id === input.client_id && r.status === "active");
      if (!input.project_id && !retainer) return { ok: false as const, reason: "This client has no active retainer" };
      const type = data.deliverableTypes.find((t) => t.code === input.deliverable_type)!;
      const id = `dl-new-${Date.now()}`;
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
            id: prev.statusEvents.length + 1,
            deliverable_id: id,
            from_status: null,
            to_status: "planned",
            changed_by_team_member_id: me.id,
            changed_by_contact_id: null,
            changed_at: createdAt,
          },
        ],
      }));
      return { ok: true as const, id };
    },
    [data.retainers, data.deliverableTypes, me.id, role],
  );

  const comment = useCallback(
    (id: string, body: string) => {
      const text = body.trim();
      if (!text) return;
      setData((prev) => ({
        ...prev,
        comments: [
          ...prev.comments,
          {
            id: `cm-${Date.now()}`,
            deliverable_id: id,
            author_team_member_id: me.id,
            author_contact_id: null,
            body: text,
            is_internal: true,
            created_at: new Date().toISOString(),
          },
        ],
      }));
    },
    [me.id],
  );

  const viewAs = useCallback((teamMemberId: string) => {
    setMeId(teamMemberId);
    try {
      localStorage.setItem(VIEW_AS_KEY, teamMemberId);
    } catch {
      // ignore
    }
  }, []);

  const value: NumuValue = {
    data,
    rows,
    me,
    role,
    today,
    thisMonth: monthStart(today),
    now,
    hour: qatarHour(),
    isDemo: true,
    signedIn,
    move,
    update,
    create,
    comment,
    viewAs,
  };

  return <NumuContext value={value}>{children}</NumuContext>;
}

export function useNumu(): NumuValue {
  const value = useContext(NumuContext);
  if (!value) throw new Error("useNumu must be used inside <NumuProvider>");
  return value;
}
