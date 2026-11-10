"use client";

import { X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { addDays, dayNumber, dayOfWeek, formatLong, isWorkingDay } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import type { NewTaskPreset } from "@/lib/new-task";
import { ledClientIds } from "@/lib/selectors";
import { canPlan, useNumu } from "@/lib/store";
import type { DeliverableTypeCode, Platform } from "@/lib/types";
import { Check } from "./forms";
import { Button, IconButton, Segmented } from "./ui";
import { taskHref } from "@/lib/routes";

const PLATFORMS: (Platform | "")[] = ["instagram", "tiktok", "snapchat", "youtube", "x", "linkedin", "facebook", ""];

type Kind = "task" | "content";

const TITLE_HINT: Partial<Record<DeliverableTypeCode, string>> = {
  follow_up: "e.g. Chase the Ramadan brief",
  content_calendar: "e.g. December content calendar",
  report: "e.g. October performance report",
  meeting: "e.g. Monthly review call",
  task: "e.g. Book the studio for the shoot",
};

function workingDaysFrom(from: string, n: number) {
  let d = from;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

/** New task (or content deliverable): a side panel on desktop, a bottom sheet on phones. */
export function NewDeliverableSheet({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fields filled in by whoever opened the panel (a client page, a day on the calendar). */
  preset?: NewTaskPreset;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Drawer.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-lg outline-none",
            desktop
              ? "inset-y-2 right-2 w-[440px] rounded-xl border border-line"
              : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-line",
          )}
        >
          {!desktop ? <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" /> : null}
          {open ? <Form preset={preset ?? NO_PRESET} onDone={() => onOpenChange(false)} /> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

const control =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink shadow-sm outline-none placeholder:text-faint focus:border-focus focus:ring-2 focus:ring-focus/20";

const NO_PRESET: NewTaskPreset = {};

/** The start of the next working week (Sunday), from today. */
function nextSunday(today: string) {
  let d = addDays(today, 1);
  while (dayOfWeek(d) !== 0) d = addDays(d, 1);
  return d;
}

function Form({ preset, onDone }: { preset: NewTaskPreset; onDone: () => void }) {
  const { data, me, role, today, create, save, notify } = useNumu();
  const titleInput = useRef<HTMLInputElement>(null);

  const clients = useMemo(() => {
    const led = ledClientIds(data, me.id, role);
    return data.clients
      .filter((c) => c.status !== "ended")
      .sort((a, b) => Number(led.has(b.id)) - Number(led.has(a.id)) || a.name_en.localeCompare(b.name_en));
  }, [data, me.id, role]);
  const taskTypes = data.deliverableTypes.filter((t) => !t.is_content);
  const contentTypes = data.deliverableTypes.filter((t) => t.is_content);

  // Start from what this person picked last time.
  const [last] = useState(readLast);
  // Opened for a subtask, or by someone who can't plan content: it's a task.
  const startKind: Kind = last.kind === "content" && canPlan(role) && !preset.parentId ? "content" : "task";
  const [kind, setKind] = useState<Kind>(startKind);
  const [clientId, setClientId] = useState(() => {
    const wanted = preset.clientId ?? last.clientId;
    return clients.some((c) => c.id === wanted) ? wanted! : (clients[0]?.id ?? "");
  });
  const [projectId, setProjectId] = useState(preset.projectId ?? "");
  const [parentId, setParentId] = useState(preset.parentId ?? "");
  const [type, setType] = useState<DeliverableTypeCode>(() => {
    const k = startKind;
    const remembered = k === "task" ? last.taskType : last.contentType;
    const list = k === "task" ? taskTypes : contentTypes;
    return list.some((t) => t.code === remembered) ? remembered! : (list[0]?.code ?? "follow_up");
  });
  const [platform, setPlatform] = useState<Platform | "">("instagram");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(preset.due ?? workingDaysFrom(today, kind === "task" ? 1 : 3));
  // A task you add is yours unless you give it away; content goes to the client's lead.
  const [ownerId, setOwnerId] = useState(
    preset.ownerId ?? (kind === "task" ? me.id : (data.clients.find((c) => c.id === clientId)?.account_lead_id ?? me.id)),
  );
  const [repeat, setRepeat] = useState(false);
  const [another, setAnother] = useState(false);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTask = kind === "task";
  const client = data.clients.find((c) => c.id === clientId);
  const retainer = data.retainers.find((r) => r.client_id === clientId && r.status === "active");
  const projects = data.projects.filter((p) => p.client_id === clientId && (p.status === "active" || p.status === "planned"));
  const typeName = data.deliverableTypes.find((t) => t.code === type)?.name_en ?? "";
  const fallbackTitle = isTask ? typeName : `${typeName}${platform ? ` · ${PLATFORM_LABEL[platform]}` : ""}`;
  // Content and repeating tasks hang off retainers and scope, which only leads and partners manage.
  const plans = canPlan(role);
  const canRepeat = plans && isTask && !projectId && !parentId && Boolean(retainer);
  // Open tasks of this client that this one could be a step of.
  const taskCodes = new Set(taskTypes.map((t) => t.code));
  const parents = data.deliverables
    .filter((d) => d.client_id === clientId && !d.parent_id && d.status !== "done" && taskCodes.has(d.deliverable_type))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  function switchKind(k: Kind) {
    setKind(k);
    setError(null);
    setRepeat(false);
    setType(k === "task" ? (taskTypes[0]?.code ?? "follow_up") : (contentTypes[0]?.code ?? "reel"));
  }

  async function submit() {
    if (!clientId) return setError("Add a client first");
    setError(null);
    let scopeLineId: string | null = null;
    if (repeat && canRepeat && retainer) {
      // Repeats every month: it joins the client's monthly scope, pinned to this day.
      setBusy(true);
      scopeLineId = crypto.randomUUID();
      const r = await save("scopeLines", {
        id: scopeLineId,
        retainer_id: retainer.id,
        deliverable_type: type,
        quantity_per_month: 1,
        platform: null,
        default_owner_id: ownerId || null,
        due_day: dayNumber(due),
        notes: title.trim() || null,
      });
      setBusy(false);
      if (!r.ok) return setError(r.reason);
    }
    const result = create({
      client_id: clientId,
      project_id: projectId || null,
      parent_id: isTask && parentId ? parentId : null,
      sort_order: parentId ? data.deliverables.filter((d) => d.parent_id === parentId).length + 1 : 0,
      retainer_id: scopeLineId ? retainer!.id : null,
      scope_line_id: scopeLineId,
      deliverable_type: type,
      title: title.trim() || fallbackTitle,
      platform: isTask ? null : platform || null,
      owner_id: ownerId || null,
      due_date: due,
    });
    if (!result.ok) return setError(result.reason);
    writeLast({ kind, clientId, taskType: isTask ? type : last.taskType, contentType: isTask ? last.contentType : type });
    if (another) {
      // Stay open for the next one: same client, type, owner and date.
      setTitle("");
      setRepeat(false);
      setAdded((n) => n + 1);
      titleInput.current?.focus();
      return;
    }
    onDone();
    notify(
      isTask ? (repeat ? `Added. It repeats every month on day ${dayNumber(due)}` : "Task added") : "Deliverable added",
      "success",
      { label: "Open", href: taskHref(result.id) },
    );
  }

  const quick: { label: string; day: string }[] = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1) },
    { label: "Sunday", day: nextSunday(today) },
    { label: "In a week", day: addDays(today, 7) },
  ];

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (clientId && !busy) void submit();
      }}
      // ⌘/Ctrl + Enter adds it from any field.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <Drawer.Title className="text-[16px] font-semibold">New task</Drawer.Title>
          <Drawer.Description className="mt-0.5 text-[12.5px] text-muted">
            {isTask
              ? "Follow-ups, reports, calendars, meetings: to do, then done."
              : projectId
                ? "Content for a one-off campaign."
                : "Content added by hand counts as an extra outside the retainer's scope."}
          </Drawer.Description>
        </div>
        <IconButton label="Close" onClick={onDone}>
          <X />
        </IconButton>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {clients.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
            Add a client first (Clients → New client). For NUMU&apos;s own work, add NUMU as a client.
          </p>
        ) : null}
        {plans ? (
          <Segmented
            className="w-full [&>button]:flex-1"
            value={kind}
            onChange={switchKind}
            options={[
              { value: "task", label: "Task" },
              { value: "content", label: "Content deliverable" },
            ]}
          />
        ) : null}
        <Field label={isTask ? "What needs doing" : "Title"}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            ref={titleInput}
            placeholder={isTask ? (TITLE_HINT[type] ?? fallbackTitle) : fallbackTitle}
            className={control}
            autoFocus
            enterKeyHint="done"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setProjectId("");
                setParentId("");
                setRepeat(false);
                const c = data.clients.find((x) => x.id === e.target.value);
                if (!isTask && c?.account_lead_id) setOwnerId(c.account_lead_id);
              }}
              className={control}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as DeliverableTypeCode)} className={control}>
              {(isTask ? taskTypes : contentTypes).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name_en} · {t.effort_points} pt
                </option>
              ))}
            </select>
          </Field>
          <Field label={isTask ? "Campaign" : "Counts against"}>
            <select
              value={projectId}
              disabled={Boolean(isTask && parentId)}
              title={isTask && parentId ? "A subtask belongs to its task's campaign" : undefined}
              onChange={(e) => {
                setProjectId(e.target.value);
                if (e.target.value) setRepeat(false);
              }}
              className={cn(control, "disabled:opacity-50")}
            >
              <option value="">{isTask ? "None" : "Retainer (extra)"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_en}
                </option>
              ))}
            </select>
          </Field>
          {isTask ? (
            <OwnerField value={ownerId} onChange={setOwnerId} />
          ) : (
            <Field label="Platform">
              <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")} className={control}>
                {PLATFORMS.map((p) => (
                  <option key={p || "none"} value={p}>
                    {p ? PLATFORM_LABEL[p] : "None"}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!isTask ? <OwnerField value={ownerId} onChange={setOwnerId} /> : null}
        </div>
        <div>
          <Field label={isTask ? "Due" : "Due for review"}>
            <input type="date" value={due} min={today} onChange={(e) => e.target.value && setDue(e.target.value)} className={control} />
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {quick.map((qd) => (
              <button
                key={qd.label}
                type="button"
                onClick={() => setDue(qd.day)}
                aria-pressed={due === qd.day}
                className={cn(
                  "h-8 rounded-full border px-3 text-[12.5px] transition-colors md:h-7",
                  due === qd.day ? "border-primary bg-primary font-medium text-primary-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                {qd.label}
              </button>
            ))}
          </div>
          <p className={cn("mt-1.5 text-[12px]", isWorkingDay(due) ? "text-muted" : "text-serious")}>
            {formatLong(due)}
            {isWorkingDay(due) ? "" : " · a weekend in Doha"}
          </p>
        </div>
        {isTask && parents.length ? (
          <Field label="Subtask of" hint={parentId ? "It shows inside that task, and in its owner's My work." : "Optional: make it a step of a bigger task."}>
            <select
              value={parentId}
              onChange={(e) => {
                setParentId(e.target.value);
                if (e.target.value) {
                  setRepeat(false);
                  setProjectId("");
                }
              }}
              className={control}
            >
              <option value="">Nothing (a task on its own)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {isTask ? (
          <Check
            checked={repeat}
            onChange={setRepeat}
            disabled={!canRepeat}
            label={`Repeat every month, on day ${dayNumber(due)}`}
            hint={
              canRepeat
                ? `Adds it to ${client?.name_en ?? "the client"}'s monthly scope, so it's created with the rest of each month (moved to the next working day when needed).`
                : !plans
                  ? "Partners and account leads set up repeating tasks."
                  : parentId
                    ? "Subtasks don't repeat; the bigger task can."
                  : projectId
                    ? "Campaign tasks don't repeat."
                    : "Needs an active retainer for this client."
            }
          />
        ) : null}
        {error ? <p className="text-[13px] text-critical">{error}</p> : null}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          <span className="truncate" aria-live="polite">
            {added ? `${added} added. Add another` : "Add another after this"}
          </span>
        </label>
        <Button onClick={onDone}>{added ? "Done" : "Cancel"}</Button>
        <Button variant="primary" type="submit" disabled={!clientId || busy} title="⌘/Ctrl + Enter">
          {isTask ? "Add task" : "Add deliverable"}
        </Button>
      </div>
    </form>
  );
}

const LAST_KEY = "numu.newTask";

interface Last {
  kind?: Kind;
  clientId?: string;
  taskType?: DeliverableTypeCode;
  contentType?: DeliverableTypeCode;
}

function readLast(): Last {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Last;
  } catch {
    return {};
  }
}

function writeLast(v: Last) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    // private mode: just don't remember
  }
}

/** Owner, with a one-tap "Assign to me". */
function OwnerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { me } = useNumu();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor="new-task-owner" className="text-[12.5px] font-medium text-ink-2">
          Owner
        </label>
        {value !== me.id ? (
          <button type="button" onClick={() => onChange(me.id)} className="rounded px-1 text-[12px] font-medium text-focus hover:underline">
            Assign to me
          </button>
        ) : (
          <span className="text-[12px] text-muted">You</span>
        )}
      </div>
      <Owner id="new-task-owner" value={value} onChange={onChange} />
    </div>
  );
}

function Owner({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const { data } = useNumu();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={control}>
      <option value="">Unassigned</option>
      {data.team
        .filter((m) => m.is_active)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
    </select>
  );
}
