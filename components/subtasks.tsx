"use client";

import Link from "next/link";
import { Check, GripVertical, Plus, UserRound, X } from "lucide-react";
import { useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { formatRelative } from "@/lib/dates";
import { cn, firstName, percent } from "@/lib/format";
import type { BoardRow } from "@/lib/selectors";
import { canPlan, useNumu } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import { isDone, STATUS_META } from "@/lib/workflow";
import { Avatar, Button, Card, CardHeader, Progress } from "./ui";
import { taskHref } from "@/lib/routes";

/**
 * A task's subtasks: each with its own owner, due date and step, ticked off
 * one by one. Quick to fill in: type and press Enter (the box stays ready for
 * the next one), or paste a list to add every line. Drag to reorder.
 */
export function SubtasksCard({ row }: { row: BoardRow }) {
  const { me, role, today, move, notify, create, update, remove } = useNumu();
  const subtasks = row.subtasks;
  const { done, total, late } = row.progress;
  const canAdd = me.can_create_tasks;
  const canDelete = canPlan(role);

  // Who has open subtasks, most first.
  const load = new Map<string, { name: string; open: number; late: number }>();
  for (const s of subtasks) {
    if (isDone(s.status)) continue;
    const key = s.owner?.id ?? "none";
    const e = load.get(key) ?? { name: s.owner?.full_name ?? "Unassigned", open: 0, late: 0 };
    e.open += 1;
    if (s.flags.overdue) e.late += 1;
    load.set(key, e);
  }
  const people = [...load.values()].sort((a, b) => b.open - a.open);

  function setStatus(s: BoardRow, to: DeliverableStatus) {
    const r = move(s.id, to);
    if (!r.ok) return notify(r.reason, "error");
    // The last one ticked: offer to close the whole task.
    const openLeft = subtasks.filter((x) => x.id !== s.id && !isDone(x.status)).length;
    if (to === "done" && openLeft === 0 && !isDone(row.status)) {
      notify(`All ${total} subtasks done`, "success", { label: `Mark “${row.title}” done`, run: () => void move(row.id, "done") });
    }
  }

  // --- reorder (drag on desktop) --------------------------------------------
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = subtasks.map((s) => s.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    ids.forEach((id, i) => {
      const s = subtasks.find((x) => x.id === id)!;
      if (s.sort_order !== i + 1) update(id, { sort_order: i + 1 });
    });
  }

  return (
    <Card>
      <CardHeader
        title="Subtasks"
        subtitle={
          total
            ? `${done} of ${total} done${late ? ` · ${late} late` : ""}`
            : "Break it into steps, each with its own owner and date"
        }
        action={total ? <span className="text-[13px] font-semibold num">{percent(done, total)}%</span> : null}
      />
      {total ? (
        <div className="px-4 pb-3 sm:px-5">
          <Progress value={percent(done, total)} color={late ? "var(--serious)" : "var(--good)"} />
          {people.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {people.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-0.5 text-[12px] text-ink-2"
                  title={`${p.name}: ${p.open} open${p.late ? `, ${p.late} late` : ""}`}
                >
                  {p.name === "Unassigned" ? (
                    <span className="grid size-[22px] place-items-center rounded-full border border-dashed border-line-strong text-faint">
                      <UserRound className="size-3" />
                    </span>
                  ) : (
                    <Avatar name={p.name} size={22} />
                  )}
                  {firstName(p.name)} <span className="font-medium text-ink num">{p.open}</span>
                  {p.late ? <span className="font-medium text-critical num">· {p.late} late</span> : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-line border-t border-line">
        {subtasks.map((s) => {
          const state = s.status === "done" ? "done" : s.status === "in_progress" ? "doing" : "todo";
          return (
            <li
              key={s.id}
              draggable={Boolean(canAdd)}
              onDragStart={(e: DragEvent) => {
                setDragId(s.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(s.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(s.id);
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                "group flex items-center gap-2.5 px-3 py-2.5 transition-colors sm:px-4",
                dragId === s.id && "opacity-40",
                overId === s.id && dragId !== s.id && "bg-surface-2 shadow-[inset_0_2px_0_var(--focus)]",
              )}
            >
              {canAdd ? (
                <GripVertical className="hidden size-4 shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100 md:block" aria-hidden />
              ) : null}
              <button
                type="button"
                role="checkbox"
                aria-checked={state === "done" ? true : state === "doing" ? "mixed" : false}
                aria-label={state === "done" ? `Reopen ${s.title}` : `Mark ${s.title} done`}
                title={state === "done" ? "Done. Tap to reopen" : "Mark done"}
                onClick={() => setStatus(s, state === "done" ? "planned" : "done")}
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-150 active:scale-90",
                  state === "done" && "border-[var(--good)] bg-[var(--good)] text-white",
                  state === "doing" && "border-[var(--series-1)]",
                  state === "todo" && "border-line-strong hover:border-ink-2",
                )}
              >
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : null}
                {state === "doing" ? <span className="size-2.5 rounded-full" style={{ background: "var(--series-1)" }} /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <Link
                  href={taskHref(s.id)}
                  className={cn("block truncate text-[13.5px] hover:underline", state === "done" ? "text-muted line-through" : "font-medium text-ink")}
                >
                  {s.title}
                </Link>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className={cn("num sm:hidden", s.flags.overdue && state !== "done" ? "font-medium text-critical" : "text-muted")}>
                    {formatRelative(s.due_date, today)}
                  </span>
                  {state === "doing" ? (
                    <span className="font-medium" style={{ color: "var(--series-1)" }}>
                      {STATUS_META.in_progress.en}
                    </span>
                  ) : null}
                  {state === "todo" ? (
                    <button
                      type="button"
                      onClick={() => setStatus(s, "in_progress")}
                      className="text-muted hover:text-ink md:opacity-0 md:group-hover:opacity-100"
                    >
                      Start
                    </button>
                  ) : null}
                </div>
              </div>
              <DueChip value={s.due_date} late={s.flags.overdue} done={state === "done"} today={today} onChange={(v) => update(s.id, { due_date: v })} />
              <OwnerPick ownerId={s.owner_id} onChange={(v) => update(s.id, { owner_id: v })} />
              {canDelete ? <DeleteSub id={s.id} title={s.title} onDelete={remove} /> : null}
            </li>
          );
        })}
      </ul>

      {canAdd ? <QuickAdd parent={row} create={create} next={subtasks.length + 1} /> : null}

      {total && done === total && !isDone(row.status) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-4 py-3 sm:px-5">
          <span className="text-[13px]">All subtasks are done.</span>
          <Button size="sm" variant="primary" onClick={() => void move(row.id, "done")}>
            <Check /> Mark the task done
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Type a subtask, Enter, next one. Paste a list to add every line. */
function QuickAdd({ parent, create, next }: { parent: BoardRow; create: ReturnType<typeof useNumu>["create"]; next: number }) {
  const { data, me, notify } = useNumu();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(parent.owner_id ?? me.id);
  const [due, setDue] = useState(parent.due_date);

  function add(titles: string[]) {
    let order = next;
    let added = 0;
    for (const t of titles.map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)]|\[ ?\])\s*/, "").trim()).filter(Boolean)) {
      const r = create({
        client_id: parent.client_id,
        project_id: parent.project_id,
        parent_id: parent.id,
        sort_order: order++,
        deliverable_type: "task",
        title: t,
        platform: null,
        owner_id: owner || null,
        due_date: due,
      });
      if (!r.ok) return notify(r.reason, "error");
      added++;
    }
    if (added > 1) notify(`Added ${added} subtasks`, "success");
    setTitle("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5 sm:flex-nowrap sm:px-4">
      <Plus className="size-4 shrink-0 text-faint" aria-hidden />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter" && title.trim()) {
            e.preventDefault();
            add([title]);
          }
        }}
        onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
          const text = e.clipboardData.getData("text");
          if (!text.includes("\n")) return;
          e.preventDefault();
          add(text.split(/\r?\n/));
        }}
        placeholder="Add a subtask, press Enter (or paste a list)"
        aria-label="New subtask"
        className="h-9 min-w-0 flex-1 basis-full bg-transparent text-[13.5px] outline-none placeholder:text-faint sm:basis-auto"
      />
      <label className="relative inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-0.5 text-[12px] text-ink-2">
        {owner ? (
          <Avatar name={data.team.find((m) => m.id === owner)?.full_name ?? "?"} size={22} />
        ) : (
          <span className="grid size-[22px] place-items-center rounded-full border border-dashed border-line-strong text-faint">
            <UserRound className="size-3" />
          </span>
        )}
        {owner ? (owner === me.id ? "You" : firstName(data.team.find((m) => m.id === owner)?.full_name ?? "")) : "Nobody"}
        <select aria-label="Owner for new subtasks" value={owner} onChange={(e) => setOwner(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
          <option value="">Unassigned</option>
          {data.team
            .filter((m) => m.is_active)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.full_name} (you)` : m.full_name}
              </option>
            ))}
        </select>
      </label>
      <input
        type="date"
        aria-label="Due date for new subtasks"
        value={due}
        onChange={(e) => e.target.value && setDue(e.target.value)}
        className="h-8 rounded-full border border-line bg-surface px-2.5 text-[12px] text-ink-2"
      />
      <Button size="sm" variant="primary" disabled={!title.trim()} onClick={() => add([title])}>
        Add
      </Button>
    </div>
  );
}

function DueChip({ value, late, done, today, onChange }: { value: string; late: boolean; done: boolean; today: string; onChange: (v: string) => void }) {
  return (
    <label
      className={cn(
        "relative hidden h-7 shrink-0 items-center rounded-full px-2.5 text-[12px] num hover:bg-surface-3 sm:inline-flex",
        late && !done ? "font-medium text-critical" : "text-muted",
      )}
      title="Change the due date"
    >
      {formatRelative(value, today)}
      <input type="date" aria-label="Due date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

function OwnerPick({ ownerId, onChange }: { ownerId: string | null; onChange: (v: string | null) => void }) {
  const { data, me } = useNumu();
  const owner = ownerId ? data.team.find((m) => m.id === ownerId) : null;
  return (
    <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-surface-3" title={owner ? `${owner.full_name}. Change` : "Assign"}>
      {owner ? (
        <Avatar name={owner.full_name} size={24} />
      ) : (
        <span className="grid size-6 place-items-center rounded-full border border-dashed border-line-strong text-faint">
          <UserRound className="size-3" />
        </span>
      )}
      <select aria-label="Owner" value={ownerId ?? ""} onChange={(e) => onChange(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">Unassigned</option>
        {data.team
          .filter((m) => m.is_active || m.id === ownerId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me.id ? `${m.full_name} (you)` : m.full_name}
            </option>
          ))}
      </select>
    </label>
  );
}

function DeleteSub({ id, title, onDelete }: { id: string; title: string; onDelete: ReturnType<typeof useNumu>["remove"] }) {
  const { notify } = useNumu();
  const [sure, setSure] = useState(false);
  return (
    <button
      type="button"
      aria-label={sure ? `Confirm deleting ${title}` : `Delete ${title}`}
      title={sure ? "Click again to delete" : "Delete"}
      onBlur={() => setSure(false)}
      onClick={async () => {
        if (!sure) return setSure(true);
        const r = await onDelete("deliverables", id);
        if (!r.ok) notify(r.reason, "error");
      }}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md transition-opacity",
        sure ? "bg-[var(--critical)] text-white" : "text-faint hover:bg-surface-3 hover:text-ink md:opacity-0 md:group-hover:opacity-100",
      )}
    >
      <X className="size-3.5" />
    </button>
  );
}
