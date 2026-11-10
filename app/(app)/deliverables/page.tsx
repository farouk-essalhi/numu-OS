"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare, ChevronLeft, ChevronRight, Columns3, List, ListTree, LoaderCircle, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanBoard, type BoardColumn, type DropCheck } from "@/components/board";
import { DeliverableTable, useMove, type RowGroup, type Selection } from "@/components/deliverables";
import { Button, ButtonLink, Card, Empty, IconButton, Kbd, PageHeader, Segmented, SelectFilter } from "@/components/ui";
import { addMonths, formatMonth, monthStart } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { useMediaQuery, useStored } from "@/lib/hooks";
import { openNewTask } from "@/lib/new-task";
import { planningWeek } from "@/lib/selectors";
import { canPlan, useNumu } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import type { BoardRow } from "@/lib/selectors";
import { canMove, isDone, isWithTeam, STATUSES, STATUS_META } from "@/lib/workflow";

type View = "board" | "list";
type Group = "status" | "client" | "person";

interface Filters {
  q: string;
  client: string;
  owner: string;
  type: string;
  status: string;
  month: string;
  /** The month the filters were saved in: a new month starts clean. */
  planned: string;
}
const NO_FILTERS: Filters = { q: "", client: "", owner: "", type: "", status: "", month: "", planned: "" };

export default function DeliverablesPage() {
  const { rows, data, me, role, today, update, removeMany, notify } = useNumu();
  const moveIt = useMove();
  const params = useSearchParams();
  const router = useRouter();
  const desktop = useMediaQuery("(min-width: 768px)");
  const planningMonth = monthStart(planningWeek(today).days[0]);

  // How you like to look at tasks is remembered on this device; the filters
  // for as long as this tab is open, so opening a task and coming back keeps them.
  const [savedView, setView] = useStored<View | null>("numu.tasks.view", null, "local");
  const view: View = savedView ?? (desktop ? "board" : "list");
  const [group, setGroup] = useStored<Group>("numu.tasks.group", "status", "local");
  const [stored, setStored] = useStored<Filters>("numu.tasks.filters", NO_FILTERS);
  const [f, setFilters] = useState<Filters>(() => {
    const fresh = { ...NO_FILTERS, month: planningMonth, planned: planningMonth };
    // A link here with filters in it (a client's "View tasks", "My late work") wins.
    if (params.size)
      return {
        ...fresh,
        q: params.get("q") ?? "",
        client: params.get("client") ?? "",
        owner: params.get("owner") === "me" ? me.id : (params.get("owner") ?? ""),
        status: params.get("status") ?? "",
      };
    return stored.planned === planningMonth ? stored : fresh;
  });
  const setF = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setFilters(next);
    setStored(next);
  };
  const { q, client, owner, type, status, month } = f;
  const setMonth = (m: string) => setF({ month: m });
  const [savedSubtasks, setSavedSubtasks] = useStored<boolean | number>("numu.tasks.subtasks", false, "local");
  const showSubtasks = Boolean(savedSubtasks);
  const toggleSubtasks = () => setSavedSubtasks(!showSubtasks);
  const project = params.get("project") ?? "";

  // Select mode: tick tasks on the board or the list, then delete them together.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const selection: Selection = useMemo(
    () => ({
      ids: picked,
      toggle: (id) =>
        setPicked((p) => {
          const n = new Set(p);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        }),
      setMany: (ids, on) =>
        setPicked((p) => {
          const n = new Set(p);
          for (const id of ids) {
            if (on) n.add(id);
            else n.delete(id);
          }
          return n;
        }),
    }),
    [picked],
  );
  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
    setConfirming(false);
  }
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stopSelecting();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);
  const pickedIds = [...picked].filter((id) => rows.some((r) => r.id === id));
  async function deletePicked() {
    setDeleting(true);
    const r = await removeMany(pickedIds);
    setDeleting(false);
    if (!r.ok) return notify(r.reason, "error");
    notify(`Deleted ${pickedIds.length} ${pickedIds.length === 1 ? "task" : "tasks"}`, "success");
    stopSelecting();
  }

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
      // Subtasks live inside their big task unless asked for (or someone's own work is filtered).
      .filter((r) => !r.parent_id || showSubtasks || Boolean(owner))
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
  }, [rows, month, planningMonth, project, client, owner, type, status, q, showSubtasks]);

  const add = me.can_create_tasks;
  const columns: BoardColumn[] = useMemo(() => {
    if (group === "status") {
      // Every status is a column (empty ones fold into a slim rail), so any
      // card can be dragged to any step.
      return STATUSES.filter((s) => !status || s === status).map((s) => ({
        key: s,
        title: STATUS_META[s].en,
        color: STATUS_META[s].color,
        rows: visible.filter((r) => r.status === s),
        onAdd: add && s === "planned" ? () => openNewTask() : undefined,
      }));
    }
    if (group === "client") {
      return data.clients
        .map((c) => ({
          key: c.id,
          title: c.name_en,
          rows: visible.filter((r) => r.client_id === c.id),
          onAdd: add ? () => openNewTask({ clientId: c.id }) : undefined,
        }))
        .filter((c) => c.rows.length > 0);
    }
    // Everyone active is a column, so work can be dragged onto anyone.
    const people: BoardColumn[] = data.team
      .filter((m) => m.is_active || visible.some((r) => r.owner_id === m.id))
      .map((m) => ({
        key: m.id,
        title: m.full_name,
        avatar: m.full_name,
        rows: visible.filter((r) => r.owner_id === m.id),
        onAdd: add && m.is_active ? () => openNewTask({ ownerId: m.id }) : undefined,
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.title.localeCompare(b.title));
    return [...people, { key: "none", title: "Unassigned", rows: visible.filter((r) => !r.owner_id) }];
  }, [group, visible, data, status, add]);

  // The list uses the same groups as the board; finished work starts folded.
  const listGroups: RowGroup[] = useMemo(
    () =>
      columns
        .filter((c) => c.rows.length > 0)
        .map((c) => ({ key: c.key, title: c.title, color: c.color, avatar: c.avatar, rows: c.rows, collapsed: c.key === "done" || c.key === "posted" })),
    [columns],
  );

  // Dragging a card: by status moves it along (same rules as the database),
  // by person reassigns it. By client there's nothing to drag to.
  const canDrop = useCallback(
    (row: BoardRow, to: string): DropCheck => {
      if (group === "person") return { ok: true };
      const check = canMove(me, row.status, to as DeliverableStatus, row.deliverable_type);
      if (!check.ok) return check;
      if (to === "scheduled" && !row.post_date) return { ok: false, reason: "Set a post date first: open the card and add it" };
      const open = row.subtasks.filter((s) => !isDone(s.status)).length;
      if (to === "done" && open) return { ok: false, reason: `${open} of its subtasks ${open === 1 ? "is" : "are"} still open. Open the task to finish them` };
      return { ok: true };
    },
    [group, me],
  );
  const onDrop = useCallback(
    (row: BoardRow, to: string): DropCheck => {
      if (group === "person") {
        const before = row.owner_id;
        const owner = to === "none" ? null : to;
        update(row.id, { owner_id: owner });
        const name = data.team.find((m) => m.id === owner)?.full_name;
        notify(name ? `Given to ${firstName(name)}` : "Unassigned", "success", { label: "Undo", run: () => update(row.id, { owner_id: before }) });
        return { ok: true };
      }
      const r = moveIt(row, to as DeliverableStatus);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    },
    [group, moveIt, update, notify, data.team],
  );

  const filtered = Boolean(q || client || owner || type || status || project);
  function clearAll() {
    setF({ q: "", client: "", owner: "", type: "", status: "" });
    if (params.size) router.replace("/deliverables", { scroll: false });
  }

  const projectName = data.projects.find((p) => p.id === project)?.name_en;

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          projectName ? (
            `${projectName} · ${visible.length} tasks`
          ) : (
            <>
              {visible.length} in {formatMonth(month)}
              {/* Phones keep the top of the page short, so the work starts sooner. */}
              {month === planningMonth ? <span className="hidden sm:inline">, plus anything unfinished from before</span> : null}
            </>
          )
        }
        actions={
          <>
            {canPlan(role) && rows.length > 0 ? (
              selecting ? (
                <Button onClick={stopSelecting} aria-label="Done selecting">
                  <X /> <span className="hidden sm:inline">Done selecting</span>
                </Button>
              ) : (
                <Button onClick={() => setSelecting(true)} title="Select tasks to delete" aria-label="Select tasks">
                  <CheckSquare /> <span className="hidden sm:inline">Select</span>
                </Button>
              )
            ) : null}
            {!project ? (
              <div className="flex flex-1 items-center rounded-lg border border-line bg-surface shadow-sm sm:flex-none">
                <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="size-9">
                  <ChevronLeft />
                </IconButton>
                <button
                  type="button"
                  onClick={() => setMonth(planningMonth)}
                  className="min-w-[112px] flex-1 px-1 text-center text-[13px] font-medium"
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
            onChange={(e) => setF({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (q) setF({ q: "" });
              else e.currentTarget.blur();
            }}
            data-page-filter
            placeholder="Filter by title, client, owner"
            aria-label="Filter tasks"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
          {q ? null : (
            <span className="hidden md:block">
              <Kbd>/</Kbd>
            </span>
          )}
        </label>
        {/* Phones: one row that scrolls sideways. Larger screens: these sit in the row above. */}
        <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:contents">
          <SelectFilter
            label="Group"
            className="sm:hidden"
            value={group}
            onChange={(v) => setGroup(v as Group)}
            options={[
              { value: "status", label: "Status" },
              { value: "client", label: "Client" },
              { value: "person", label: "Person" },
            ]}
          />
          <SelectFilter label="Client" value={client} onChange={(v) => setF({ client: v })} options={[{ value: "", label: "All clients" }, ...data.clients.map((c) => ({ value: c.id, label: c.name_en }))]} />
          <SelectFilter
            label="Owner"
            value={owner}
            onChange={(v) => setF({ owner: v })}
            options={[{ value: "", label: "Everyone" }, { value: me.id, label: "Me" }, ...data.team.filter((m) => m.id !== me.id).map((m) => ({ value: m.id, label: m.full_name }))]}
          />
          <SelectFilter label="Type" value={type} onChange={(v) => setF({ type: v })} options={[{ value: "", label: "All types" }, ...data.deliverableTypes.map((t) => ({ value: t.code, label: t.name_en }))]} />
          <SelectFilter
            label="Status"
            value={status}
            onChange={(v) => setF({ status: v })}
            options={[{ value: "", label: "Any status" }, ...STATUSES.map((s: DeliverableStatus) => ({ value: s, label: STATUS_META[s].en }))]}
          />
          {filtered ? (
            <Button variant="ghost" onClick={clearAll}>
              <X /> Clear
            </Button>
          ) : null}
          <Button
            variant={showSubtasks ? "primary" : "secondary"}
            onClick={toggleSubtasks}
            aria-pressed={showSubtasks}
            title={showSubtasks ? "Subtasks show as their own cards" : "Subtasks are inside their task"}
            className="sm:ml-auto"
          >
            <ListTree /> Subtasks {showSubtasks ? "shown" : "inside"}
          </Button>
          <Segmented
            className="hidden sm:inline-flex"
            value={group}
            onChange={setGroup}
            options={[
              { value: "status", label: "By status" },
              { value: "client", label: "By client" },
              { value: "person", label: "By person" },
            ]}
          />
        </div>
      </div>

      {visible.length === 0 && !filtered ? (
        <Card>
          <Empty className="py-14">
            <span className="block text-[15px] font-medium text-ink">Nothing in {formatMonth(month)} yet</span>
            <span className="mt-1 block">
              {data.clients.length === 0
                ? "Start by adding your clients, their retainers and what each buys a month."
                : role === "creator"
                  ? "Your account lead plans the month; it shows up here."
                  : "Open a client and generate the month from their scope, or add a task with New task."}
            </span>
            {role !== "creator" ? (
              <ButtonLink href="/clients" variant="primary" className="mt-4">
                {data.clients.length === 0 ? "Add a client" : "Go to clients"}
              </ButtonLink>
            ) : null}
          </Empty>
        </Card>
      ) : view === "board" ? (
        <>
          <KanbanBoard
            columns={columns}
            today={today}
            hideClient={group === "client"}
            collapseEmpty={group !== "client"}
            canDrop={group === "client" ? undefined : canDrop}
            onDrop={onDrop}
            selection={selecting ? selection : undefined}
          />
          {selecting ? (
            <p className="mt-1 text-[12px] text-muted">Tap cards to select them. Esc to stop.</p>
          ) : group !== "client" ? (
            <p className="mt-1 hidden text-[12px] text-muted md:block">
              Drag a card to {group === "status" ? "move it to another step" : "give it to someone else"}. On a phone, press and hold to pick it up.{" "}
              <Link href="/approvals" className="underline-offset-2 hover:underline">
                Sign-off rules
              </Link>{" "}
              still apply.
            </p>
          ) : null}
        </>
      ) : (
        <Card className="overflow-hidden">
          <DeliverableTable
            groups={listGroups}
            today={today}
            showClient={group !== "client"}
            showOwner={group !== "person"}
            empty="Nothing matches these filters."
            selection={selecting ? selection : undefined}
          />
        </Card>
      )}

      {selecting ? (
        <div className="toast-in fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6 md:pl-[68px] lg:pl-[248px]">
          <div className="flex w-full max-w-[560px] flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-lg">
            <span className="text-[13.5px] font-medium num">
              {pickedIds.length} selected
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const allIn = visible.length > 0 && visible.every((r) => picked.has(r.id));
                selection.setMany(visible.map((r) => r.id), !allIn);
                setConfirming(false);
              }}
            >
              {visible.length > 0 && visible.every((r) => picked.has(r.id)) ? "Unselect all" : `Select all ${visible.length}`}
            </Button>
            <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {confirming ? (
              <>
                <span className="text-[12.5px] text-muted">Can&apos;t be undone.</span>
                <Button size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                  Keep
                </Button>
                <Button size="sm" variant="primary" className="bg-[var(--critical)] text-white" onClick={() => void deletePicked()} disabled={deleting}>
                  {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Delete {pickedIds.length}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={stopSelecting}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={() => setConfirming(true)} disabled={pickedIds.length === 0}>
                  <Trash2 /> Delete
                </Button>
              </>
            )}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
