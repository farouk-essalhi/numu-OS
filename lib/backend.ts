// Reading and writing NUMU OS data in Supabase. Everything runs as the
// signed-in person, so row-level security decides what comes back: a creator
// gets no retainers or projects (fees), and writes they may not make fail.

import type { PostgrestError } from "@supabase/supabase-js";
import type { Supabase } from "./supabase";
import type { Dataset } from "./types";

/** The tables people edit from the app, keyed like the Dataset. */
export const ENTITIES = {
  team: {
    table: "team_members",
    columns: [
      "full_name", "email", "phone", "job_title", "access_level", "employment", "weekly_capacity_points", "is_active",
      "can_create_tasks", "can_send_to_client", "can_approve",
    ],
  },
  clients: {
    table: "clients",
    columns: ["name_en", "name_ar", "industry", "status", "account_lead_id", "brand_kit_url", "drive_folder_url"],
  },
  contacts: {
    table: "contacts",
    columns: ["client_id", "full_name", "job_title", "phone", "email", "is_approver", "preferred_language"],
  },
  retainers: {
    table: "retainers",
    columns: ["client_id", "status", "start_date", "end_date", "monthly_fee_minor", "currency", "billing_day", "notes"],
  },
  scopeLines: {
    table: "scope_lines",
    columns: ["retainer_id", "deliverable_type", "quantity_per_month", "platform", "default_owner_id", "due_day", "notes"],
  },
  projects: {
    table: "projects",
    columns: ["client_id", "name_en", "name_ar", "status", "fixed_fee_minor", "currency", "start_date", "deadline", "notes"],
  },
  deliverables: {
    table: "deliverables",
    columns: [
      "client_id", "retainer_id", "scope_line_id", "project_id", "deliverable_type", "title", "month", "seq", "platform",
      "owner_id", "due_date", "post_date", "effort_points", "script_url", "raw_url", "final_url", "post_url",
    ],
  },
} as const;

export type EntityKey = keyof typeof ENTITIES;
export type EntityRow<K extends EntityKey> = Dataset[K][number];

export type Result = { ok: true } | { ok: false; reason: string };

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

async function all<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const cols = (k: EntityKey, extra = "id") => [extra, ...ENTITIES[k].columns].join(",");

/** Load everything this person may see, in parallel. */
export async function loadDataset(sb: Supabase): Promise<Dataset> {
  const [deliverableTypes, team, clients, contacts, retainers, scopeLines, projects, deliverables, statusEvents, comments] =
    await Promise.all([
      all((a, b) => sb.from("deliverable_types").select("*").order("sort_order").range(a, b)),
      all((a, b) => sb.from("team_members").select(cols("team", "id,user_id")).order("full_name").range(a, b)),
      all((a, b) => sb.from("clients").select(cols("clients")).order("name_en").range(a, b)),
      all((a, b) => sb.from("contacts").select(cols("contacts")).order("full_name").range(a, b)),
      all((a, b) => sb.from("retainers").select(cols("retainers")).order("start_date").range(a, b)),
      all((a, b) => sb.from("scope_lines").select(cols("scopeLines")).order("created_at").range(a, b)),
      all((a, b) => sb.from("projects").select(cols("projects")).order("created_at").range(a, b)),
      all((a, b) =>
        sb
          .from("deliverables")
          .select(cols("deliverables", "id,status,revision_count,posted_at,created_at"))
          .order("id")
          .range(a, b),
      ),
      all((a, b) => sb.from("status_events").select("*").order("id").range(a, b)),
      all((a, b) =>
        sb
          .from("comments")
          .select("id,deliverable_id,author_team_member_id,author_contact_id,body,is_internal,created_at")
          .order("created_at")
          .range(a, b),
      ),
    ]);

  // The database returns plain strings where the app has narrower unions
  // (deliverable type codes); the values are the same.
  return {
    deliverableTypes,
    team,
    clients,
    contacts,
    retainers,
    scopeLines,
    projects,
    deliverables,
    statusEvents,
    comments,
  } as unknown as Dataset;
}

/** Only the columns the app writes, from a full row. */
export function payloadFor<K extends EntityKey>(entity: K, row: EntityRow<K>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of ENTITIES[entity].columns) out[c] = (row as unknown as Record<string, unknown>)[c] ?? null;
  return out;
}

// supabase-js types each table separately; these helpers work across tables.
type AnyTable = {
  insert: (v: unknown) => PromiseLike<{ error: PostgrestError | null }>;
  update: (v: unknown) => { eq: (c: string, v: string) => { select: (c: string) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> } };
  delete: () => {
    eq: (c: string, v: string) => { select: (c: string) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> };
    in: (c: string, v: string[]) => { select: (c: string) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> };
  };
};
const table = (sb: Supabase, name: string) => sb.from(name as "clients") as unknown as AnyTable;

export async function insertRow(sb: Supabase, entity: EntityKey, id: string, payload: Record<string, unknown>): Promise<Result> {
  const { error } = await table(sb, ENTITIES[entity].table).insert({ id, ...payload });
  return error ? { ok: false, reason: friendlyError(error) } : { ok: true };
}

export async function updateRow(sb: Supabase, entity: EntityKey, id: string, payload: Record<string, unknown>): Promise<Result> {
  const { data, error } = await table(sb, ENTITIES[entity].table).update(payload).eq("id", id).select("id");
  if (error) return { ok: false, reason: friendlyError(error) };
  // Row-level security hides rows instead of raising: nothing updated = not allowed.
  if (!data?.length) return { ok: false, reason: "You don't have permission to change this" };
  return { ok: true };
}

export async function deleteRow(sb: Supabase, entity: EntityKey, id: string): Promise<Result> {
  const { data, error } = await table(sb, ENTITIES[entity].table).delete().eq("id", id).select("id");
  if (error) return { ok: false, reason: friendlyError(error) };
  if (!data?.length) return { ok: false, reason: "You don't have permission to delete this" };
  return { ok: true };
}

/** Delete many rows, 100 at a time. Rows RLS hides are not deleted, which we report. */
export async function deleteRows(sb: Supabase, entity: EntityKey, ids: string[]): Promise<Result> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await table(sb, ENTITIES[entity].table).delete().in("id", ids.slice(i, i + 100)).select("id");
    if (error) return { ok: false, reason: friendlyError(error) };
    deleted += data?.length ?? 0;
  }
  if (deleted < ids.length) {
    return { ok: false, reason: deleted ? `Deleted ${deleted} of ${ids.length}; you don't have permission for the rest` : "You don't have permission to delete these" };
  }
  return { ok: true };
}

export async function insertComment(sb: Supabase, id: string, deliverableId: string, body: string): Promise<Result> {
  const { error } = await sb.from("comments").insert({ id, deliverable_id: deliverableId, body, is_internal: true });
  return error ? { ok: false, reason: friendlyError(error) } : { ok: true };
}

export async function runGenerator(sb: Supabase, month: string, retainerId?: string | null): Promise<{ ok: true; created: number } | { ok: false; reason: string }> {
  const { data, error } = await sb.rpc("generate_month_deliverables", {
    p_month: month,
    ...(retainerId ? { p_retainer_id: retainerId } : {}),
  });
  return error ? { ok: false, reason: friendlyError(error) } : { ok: true, created: data ?? 0 };
}

/** A sentence a person can act on, from a Postgres/PostgREST error. */
export function friendlyError(error: Pick<PostgrestError, "code" | "message" | "details">): string {
  const msg = error.message ?? "";
  switch (error.code) {
    case "42501":
      // Raised by our own triggers with a readable message; RLS says "row-level security".
      return /row-level security/i.test(msg) ? "You don't have permission to do that" : msg;
    case "23505":
      if (/clients_name_en_key/.test(msg)) return "A client with that name already exists";
      if (/team_members_email_key/.test(msg)) return "Someone on the team already has that email";
      if (/contacts_client_email_key/.test(msg)) return "This client already has a contact with that email";
      return "That already exists";
    case "23503":
      return "It's still in use (it has deliverables, retainers or projects). Mark it ended or cancelled instead";
    case "23514":
      if (/retainers_dates_check|projects_dates_check/.test(msg)) return "The end date must be after the start date";
      if (/quantity_per_month/.test(msg)) return "Quantity must be between 1 and 100";
      if (/due_day/.test(msg)) return "The due day must be between 1 and 31";
      if (/billing_day/.test(msg)) return "Billing day must be between 1 and 31";
      if (/email/.test(msg)) return "That email doesn't look right";
      return msg.startsWith("new row") ? "Some values aren't allowed" : msg;
    case "22P02":
    case "22007":
    case "22008":
      return "A value isn't in the right format";
    case "PGRST301":
    case "PGRST303":
      return "Your session expired. Sign in again";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Can't reach NUMU OS. Check your connection and try again";
  return msg || "Something went wrong";
}
