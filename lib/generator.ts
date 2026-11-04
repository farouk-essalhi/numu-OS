// The monthly generator in TypeScript, for demo data. It mirrors
// public.generate_month_deliverables(): every active retainer of an active
// client turns each scope line into numbered deliverables for the month, due
// dates spread over the working days, owner = scope line default owner, else
// the client's account lead. Only creates what is missing (scope line + month
// + seq), so running it twice adds nothing. The live app calls the database
// function instead; a test keeps the two in line.

import { monthEnd, monthStart, scopeDueDate } from "./dates";
import { PLATFORM_LABEL } from "./format";
import type { Dataset, Deliverable, IsoDate, Platform, StatusEvent } from "./types";

/** "Reel 3/6 · Instagram"; "Report" when there's one a month. Same as the SQL. */
export function generatedTitle(typeName: string, seq: number, quantity: number, platform: Platform | null): string {
  return `${typeName}${quantity > 1 ? ` ${seq}/${quantity}` : ""}${platform ? ` · ${PLATFORM_LABEL[platform]}` : ""}`;
}

export function generateMonth(
  data: Dataset,
  month: IsoDate,
  opts: { retainerId?: string | null; now?: Date; newId?: () => string } = {},
): { deliverables: Deliverable[]; events: Omit<StatusEvent, "id">[] } {
  const first = monthStart(month);
  const last = monthEnd(first);
  const now = (opts.now ?? new Date()).toISOString();
  const newId = opts.newId ?? (() => crypto.randomUUID());

  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const types = new Map(data.deliverableTypes.map((t) => [t.code, t]));
  const activeMember = new Set(data.team.filter((m) => m.is_active).map((m) => m.id));
  const existing = new Set(
    data.deliverables.filter((d) => d.scope_line_id && d.month === first).map((d) => `${d.scope_line_id}:${d.seq}`),
  );

  const deliverables: Deliverable[] = [];
  const events: Omit<StatusEvent, "id">[] = [];

  for (const r of data.retainers) {
    const client = clients.get(r.client_id);
    if (!client || r.status !== "active" || client.status !== "active") continue;
    if (r.start_date > last || (r.end_date && r.end_date < first)) continue;
    if (opts.retainerId && r.id !== opts.retainerId) continue;
    const lead = client.account_lead_id && activeMember.has(client.account_lead_id) ? client.account_lead_id : null;

    for (const sl of data.scopeLines.filter((s) => s.retainer_id === r.id)) {
      const type = types.get(sl.deliverable_type);
      if (!type) continue;
      const owner = sl.default_owner_id && activeMember.has(sl.default_owner_id) ? sl.default_owner_id : lead;
      for (let seq = 1; seq <= sl.quantity_per_month; seq++) {
        if (existing.has(`${sl.id}:${seq}`)) continue;
        const id = newId();
        deliverables.push({
          id,
          client_id: r.client_id,
          retainer_id: r.id,
          scope_line_id: sl.id,
          project_id: null,
          deliverable_type: sl.deliverable_type,
          title: generatedTitle(type.name_en, seq, sl.quantity_per_month, sl.platform),
          month: first,
          seq,
          platform: sl.platform,
          owner_id: owner,
          due_date: scopeDueDate(first, seq, sl.quantity_per_month, sl.due_day),
          post_date: null,
          status: "planned",
          revision_count: 0,
          effort_points: type.effort_points,
          script_url: null,
          raw_url: null,
          final_url: null,
          post_url: null,
          posted_at: null,
          created_at: now,
        });
        events.push({
          deliverable_id: id,
          from_status: null,
          to_status: "planned",
          changed_by_team_member_id: null,
          changed_by_contact_id: null,
          changed_at: now,
        });
      }
    }
  }
  return { deliverables, events };
}
