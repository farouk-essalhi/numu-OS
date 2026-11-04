"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { addDays, isWorkingDay } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { ledClientIds } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableTypeCode, Platform } from "@/lib/types";
import { Button, IconButton } from "./ui";

const PLATFORMS: (Platform | "")[] = ["instagram", "tiktok", "snapchat", "youtube", "x", "linkedin", "facebook", ""];

function workingDaysFrom(from: string, n: number) {
  let d = from;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

/** New deliverable: a side panel on desktop, a bottom sheet on phones. */
export function NewDeliverableSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? "right" : "bottom"}>
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
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink shadow-sm outline-none focus:border-focus focus:ring-2 focus:ring-focus/20";

function Form({ onDone }: { onDone: () => void }) {
  const { data, me, role, today, create } = useNumu();
  const router = useRouter();

  const clients = useMemo(() => {
    const led = ledClientIds(data, me.id, role);
    return [...data.clients].sort((a, b) => Number(led.has(b.id)) - Number(led.has(a.id)) || a.name_en.localeCompare(b.name_en));
  }, [data, me.id, role]);

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<DeliverableTypeCode>("reel");
  const [platform, setPlatform] = useState<Platform | "">("instagram");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(workingDaysFrom(today, 3));
  const [ownerId, setOwnerId] = useState(data.clients.find((c) => c.id === clients[0]?.id)?.account_lead_id ?? me.id);
  const [error, setError] = useState<string | null>(null);

  const projects = data.projects.filter((p) => p.client_id === clientId && (p.status === "active" || p.status === "planned"));
  const typeName = data.deliverableTypes.find((t) => t.code === type)?.name_en ?? "";
  const fallbackTitle = `${typeName}${platform ? ` · ${PLATFORM_LABEL[platform]}` : ""}`;

  function submit() {
    const result = create({
      client_id: clientId,
      project_id: projectId || null,
      deliverable_type: type,
      title: title.trim() || fallbackTitle,
      platform: platform || null,
      owner_id: ownerId || null,
      due_date: due,
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onDone();
    router.push(`/deliverables/${result.id}`);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <Drawer.Title className="text-[16px] font-semibold">New deliverable</Drawer.Title>
          <Drawer.Description className="mt-0.5 text-[12.5px] text-muted">
            {projectId ? "Part of a one-off campaign." : "Added by hand, so it counts as an extra outside the retainer's scope."}
          </Drawer.Description>
        </div>
        <IconButton label="Close" onClick={onDone}>
          <X />
        </IconButton>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {clients.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
            Add a client first (Clients → New client), then their retainer or a campaign.
          </p>
        ) : null}
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={fallbackTitle} className={control} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setProjectId("");
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
          <Field label="Counts against">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={control}>
              <option value="">Retainer (extra)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as DeliverableTypeCode)} className={control}>
              {data.deliverableTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name_en} · {t.effort_points} pt
                </option>
              ))}
            </select>
          </Field>
          <Field label="Platform">
            <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")} className={control}>
              {PLATFORMS.map((p) => (
                <option key={p || "none"} value={p}>
                  {p ? PLATFORM_LABEL[p] : "None"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due for review">
            <input type="date" value={due} min={today} onChange={(e) => e.target.value && setDue(e.target.value)} className={control} />
          </Field>
          <Field label="Owner">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={control}>
              <option value="">Unassigned</option>
              {data.team
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {error ? <p className="text-[13px] text-critical">{error}</p> : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={!clientId}>
          Create deliverable
        </Button>
      </div>
    </>
  );
}
