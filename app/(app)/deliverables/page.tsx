"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Columns3, List, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DeliverableTable, KanbanBoard, type BoardColumn } from "@/components/deliverables";
import { Button, Card, IconButton, PageHeader, Segmented, SelectFilter } from "@/components/ui";
import { addMonths, formatMonth, monthStart } from "@/lib/dates";
import { useMediaQuery } from "@/lib/hooks";
import { planningWeek } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import { isWithTeam, STATUSES, STATUS_META } from "@/lib/workflow";

type View = "board" | "list";
type Group = "status" | "client" | "person";

export default function DeliverablesPage() {
  const { rows, data, me, today } = useNumu();
  const params = useSearchParams();
  const router = useRouter();
  const desktop = useMediaQuery("(min-width: 768px)");
  const planningMonth = monthStart(planningWeek(today).days[0]);

  const [view, setView] = useState<View>(desktop ? "board" : "list");
  const [group, setGroup] = useState<Group>("status");
  const [month, setMonth] = useState(planningMonth);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [client, setClient] = useState(params.get("client") ?? "");
  const [owner, setOwner] = useState(params.get("owner") === "me" ? me.id : params.get("owner") ?? "");
  const [type, setType] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const project = params.get("project") ?? "";

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          project ||
          r.month === month ||
          // Unfinished or late work from earlier months stays on the current board.
          (month === planningMonth && r.month < month && (isWithTeam(r.status) || r.flags.overdue)),
      )
      .filter((r) => !project || r.project_id === project)
      .filter((r) => !client || r.client_id === client)
      .filter((r) => !owner || r.owner_id === owner)
      .filter((r) => !type || r.deliverable_type === type)
      .filter((r) => !status || r.status === status)
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.client.name_en.toLowerCase().includes(needle) ||
          (r.owner?.full_name.toLowerCase().includes(needle) ?? false),
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [rows, month, planningMonth, project, client, owner, type, status, q]);

  const columns: BoardColumn[] = useMemo(() => {
    if (group === "status") {
      return STATUSES.filter((s) => !status || s === status)
        .map((s) => ({ key: s, title: STATUS_META[s].en, color: STATUS_META[s].color, rows: visible.filter((r) => r.status === s) }))
        .filter((c) => c.rows.length > 0 || ["planned", "editing", "internal_review", "client_review"].includes(c.key));
    }
    if (group === "client") {
      return data.clients
        .map((c) => ({ key: c.id, title: c.name_en, rows: visible.filter((r) => r.client_id === c.id) }))
        .filter((c) => c.rows.length > 0);
    }
    const people: BoardColumn[] = data.team
      .map((m) => ({ key: m.id, title: m.full_name, avatar: m.full_name, rows: visible.filter((r) => r.owner_id === m.id) }))
      .filter((c) => c.rows.length > 0);
    const none = visible.filter((r) => !r.owner_id);
    return none.length ? [...people, { key: "none", title: "Unassigned", rows: none }] : people;
  }, [group, visible, data, status]);

  const filtered = Boolean(q || client || owner || type || status || project);
  function clearAll() {
    setQ("");
    setClient("");
    setOwner("");
    setType("");
    setStatus("");
    if (params.size) router.replace("/deliverables", { scroll: false });
  }

  const projectName = data.projects.find((p) => p.id === project)?.name_en;

  return (
    <>
      <PageHeader
        title="Deliverables"
        subtitle={projectName ? `${projectName} · ${visible.length} deliverables` : `${visible.length} in ${formatMonth(month)}${month === planningMonth ? ", plus anything unfinished from before" : ""}`}
        actions={
          <>
            {!project ? (
              <div className="flex items-center rounded-lg border border-line bg-surface shadow-sm">
                <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="size-9">
                  <ChevronLeft />
                </IconButton>
                <button
                  type="button"
                  onClick={() => setMonth(planningMonth)}
                  className="min-w-[124px] px-1 text-center text-[13px] font-medium"
                  title="Back to the current month"
                >
                  {formatMonth(month)}
                </button>
                <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="size-9">
                  <ChevronRight />
                </IconButton>
              </div>
            ) : null}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "board", label: <><Columns3 /> <span className="hidden sm:inline">Board</span></>, title: "Board" },
                { value: "list", label: <><List /> <span className="hidden sm:inline">List</span></>, title: "List" },
              ]}
            />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 shadow-sm sm:w-[240px]">
          <Search className="size-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by title, client, owner"
            aria-label="Filter deliverables"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
        </label>
        <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
          <SelectFilter label="Client" value={client} onChange={setClient} options={[{ value: "", label: "All clients" }, ...data.clients.map((c) => ({ value: c.id, label: c.name_en }))]} />
          <SelectFilter
            label="Owner"
            value={owner}
            onChange={setOwner}
            options={[{ value: "", label: "Everyone" }, { value: me.id, label: "Me" }, ...data.team.filter((m) => m.id !== me.id).map((m) => ({ value: m.id, label: m.full_name }))]}
          />
          <SelectFilter label="Type" value={type} onChange={setType} options={[{ value: "", label: "All types" }, ...data.deliverableTypes.map((t) => ({ value: t.code, label: t.name_en }))]} />
          <SelectFilter
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "Any status" }, ...STATUSES.map((s: DeliverableStatus) => ({ value: s, label: STATUS_META[s].en }))]}
          />
          {filtered ? (
            <Button variant="ghost" onClick={clearAll}>
              <X /> Clear
            </Button>
          ) : null}
        </div>
        {view === "board" ? (
          <Segmented
            className="sm:ml-auto"
            value={group}
            onChange={setGroup}
            options={[
              { value: "status", label: "By status" },
              { value: "client", label: "By client" },
              { value: "person", label: "By person" },
            ]}
          />
        ) : null}
      </div>

      {view === "board" ? (
        <KanbanBoard columns={columns} today={today} hideClient={group === "client"} />
      ) : (
        <Card className="overflow-hidden">
          <DeliverableTable rows={visible} today={today} empty="No deliverables match these filters." />
        </Card>
      )}
    </>
  );
}
