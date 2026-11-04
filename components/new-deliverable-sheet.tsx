"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { addDays, dayNumber, isWorkingDay } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { ledClientIds } from "@/lib/selectors";
import { canPlan, useNumu } from "@/lib/store";
import type { DeliverableTypeCode, Platform } from "@/lib/types";
import { Check } from "./forms";
import { Button, IconButton, Segmented } from "./ui";

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
export function NewDeliverableSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
          {open ? <Form onDone={() => onOpenChange(false)} /> : null}
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

function Form({ onDone }: { onDone: () => void }) {
  const { data, me, role, today, create, save, notify } = useNumu();
  const router = useRouter();

  const clients = useMemo(() => {
    const led = ledClientIds(data, me.id, role);
    return data.clients
      .filter((c) => c.status !== "ended")
      .sort((a, b) => Number(led.has(b.id)) - Number(led.has(a.id)) || a.name_en.localeCompare(b.name_en));
  }, [data, me.id, role]);
  const taskTypes = data.deliverableTypes.filter((t) => !t.is_content);
  const contentTypes = data.deliverableTypes.filter((t) => t.is_content);

  const [kind, setKind] = useState<Kind>("task");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<DeliverableTypeCode>(taskTypes[0]?.code ?? "follow_up");
  const [platform, setPlatform] = useState<Platform | "">("instagram");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(workingDaysFrom(today, kind === "task" ? 1 : 3));
  const [ownerId, setOwnerId] = useState(data.clients.find((c) => c.id === clients[0]?.id)?.account_lead_id ?? me.id);
  const [repeat, setRepeat] = useState(false);
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
  const canRepeat = plans && isTask && !projectId && Boolean(retainer);

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
      retainer_id: scopeLineId ? retainer!.id : null,
      scope_line_id: scopeLineId,
      deliverable_type: type,
      title: title.trim() || fallbackTitle,
      platform: isTask ? null : platform || null,
      owner_id: ownerId || null,
      due_date: due,
    });
    if (!result.ok) return setError(result.reason);
    onDone();
    if (isTask) notify(repeat ? `Added, and it repeats every month on day ${dayNumber(due)}` : "Task added", "success");
    else router.push(`/deliverables/${result.id}`);
  }

  return (
    <>
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
            placeholder={isTask ? (TITLE_HINT[type] ?? fallbackTitle) : fallbackTitle}
            className={control}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setProjectId("");
                setRepeat(false);
                const c = data.clients.find((x) => x.id === e.target.value);
                if (c?.account_lead_id) setOwnerId(c.account_lead_id);
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
              onChange={(e) => {
                setProjectId(e.target.value);
                if (e.target.value) setRepeat(false);
              }}
              className={control}
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
            <Field label="Owner">
              <Owner value={ownerId} onChange={setOwnerId} />
            </Field>
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
          <Field label={isTask ? "Due" : "Due for review"}>
            <input type="date" value={due} min={today} onChange={(e) => e.target.value && setDue(e.target.value)} className={control} />
          </Field>
          {!isTask ? (
            <Field label="Owner">
              <Owner value={ownerId} onChange={setOwnerId} />
            </Field>
          ) : null}
        </div>
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
                  : projectId
                    ? "Campaign tasks don't repeat."
                    : "Needs an active retainer for this client."
            }
          />
        ) : null}
        {error ? <p className="text-[13px] text-critical">{error}</p> : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={!clientId || busy}>
          {isTask ? "Add task" : "Add deliverable"}
        </Button>
      </div>
    </>
  );
}

function Owner({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useNumu();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={control}>
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
