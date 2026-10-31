"use client";

import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Layers, Shapes, UserRound, X } from "lucide-react";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Drawer } from "vaul";
import { addDays, formatShort, isWorkingDay } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import { ledClientIds } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableTypeCode, Platform } from "@/lib/types";
import { Avatar, InsetGroup, InsetRow, PrimaryButton, SecondaryButton } from "./ui";

const PLATFORMS: (Platform | null)[] = ["instagram", "tiktok", "snapchat", "youtube", null];

function nextWorkingDay(from: string, n: number) {
  let d = from;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

/** "New task" sheet from screenshots 7-8, as New deliverable. */
export function NewDeliverableSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-[480px] rounded-t-[32px] bg-surface outline-none">
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-faint/60" />
          {open ? <NewDeliverableForm onDone={() => onOpenChange(false)} /> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function NewDeliverableForm({ onDone }: { onDone: () => void }) {
  const { data, me, role, today, create } = useNumu();
  const router = useRouter();

  const clients = useMemo(() => {
    const led = ledClientIds(data, me.id, role);
    return [...data.clients].sort((a, b) => Number(led.has(b.id)) - Number(led.has(a.id)) || a.name_en.localeCompare(b.name_en));
  }, [data, me.id, role]);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState<string>("");
  const [type, setType] = useState<DeliverableTypeCode>("reel");
  const [due, setDue] = useState(nextWorkingDay(today, 3));
  const client = data.clients.find((c) => c.id === clientId);
  const [ownerId, setOwnerId] = useState<string>(client?.account_lead_id ?? me.id);
  const [platform, setPlatform] = useState<Platform | null>("instagram");
  const [error, setError] = useState<string | null>(null);

  const projects = data.projects.filter((p) => p.client_id === clientId && (p.status === "active" || p.status === "planned"));
  const owner = data.team.find((m) => m.id === ownerId);
  const typeName = data.deliverableTypes.find((t) => t.code === type)?.name_en ?? "";

  function submit() {
    const result = create({
      client_id: clientId,
      project_id: projectId || null,
      deliverable_type: type,
      title: title.trim() || `${typeName}${platform ? ` · ${PLATFORM_LABEL[platform]}` : ""}`,
      platform,
      owner_id: ownerId || null,
      due_date: due,
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onDone();
    router.push(`/d/${result.id}`);
  }

  return (
    <div className="overflow-y-auto px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Drawer.Title className="text-[22px] font-semibold tracking-[-0.01em]">New deliverable</Drawer.Title>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full bg-raised text-ink-2 shadow-card"
        >
          <X className="size-5" />
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`${typeName}${platform ? ` · ${PLATFORM_LABEL[platform]}` : ""}`}
        aria-label="Title"
        className="mt-5 w-full bg-transparent text-[19px] font-medium outline-none placeholder:text-ink/35"
      />
      <Drawer.Description className="mt-1 text-[14px] text-muted">
        {projectId ? "Part of a one-off campaign." : "Added by hand, so it counts as an extra outside the retainer's scope."}
      </Drawer.Description>

      <InsetGroup className="mt-5">
        <SelectRow icon={<Building2 />} label="Client" value={client?.name_en ?? "Choose"}>
          <select
            aria-label="Client"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId("");
              const c = data.clients.find((x) => x.id === e.target.value);
              if (c?.account_lead_id) setOwnerId(c.account_lead_id);
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en}
              </option>
            ))}
          </select>
        </SelectRow>
        <SelectRow icon={<Layers />} label="For" value={projects.find((p) => p.id === projectId)?.name_en ?? "Retainer (extra)"}>
          <select aria-label="Retainer or project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Retainer (extra)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_en}
              </option>
            ))}
          </select>
        </SelectRow>
        <SelectRow icon={<Shapes />} label="Type" value={typeName}>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as DeliverableTypeCode)}>
            {data.deliverableTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name_en} · {t.effort_points} pt
              </option>
            ))}
          </select>
        </SelectRow>
        <SelectRow icon={<CalendarDays />} label="Due for review" value={formatShort(due)}>
          <input type="date" aria-label="Due date" value={due} min={today} onChange={(e) => e.target.value && setDue(e.target.value)} />
        </SelectRow>
        <SelectRow
          icon={<UserRound />}
          label="Owner"
          value={
            owner ? (
              <span className="flex items-center gap-2">
                <Avatar name={owner.full_name} size={24} />
                {owner.full_name.split(" ")[0]}
              </span>
            ) : (
              "Unassigned"
            )
          }
        >
          <select aria-label="Owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {data.team
              .filter((m) => m.is_active)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} · {m.job_title}
                </option>
              ))}
          </select>
        </SelectRow>
      </InsetGroup>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[15px] text-muted">Platform</span>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {PLATFORMS.map((p) => (
            <button
              key={p ?? "none"}
              type="button"
              onClick={() => setPlatform(p)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-[14px] transition",
                platform === p ? "bg-primary font-medium text-primary-ink" : "bg-raised text-ink-2 shadow-card",
              )}
            >
              {p ? PLATFORM_LABEL[p] : "None"}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 text-[14px] text-danger">{error}</p> : null}

      <div className="mt-6 flex gap-3">
        <SecondaryButton onClick={onDone}>Cancel</SecondaryButton>
        <PrimaryButton className="flex-1" onClick={submit} disabled={!clientId}>
          Create deliverable
        </PrimaryButton>
      </div>
    </div>
  );
}

/** A grouped row whose native picker covers the whole row (best on phones). */
function SelectRow({
  icon,
  label,
  value,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  children: ReactElement;
}) {
  return (
    <div className="relative">
      <InsetRow icon={icon} label={label} chevron>
        <span className="truncate">{value}</span>
      </InsetRow>
      <div className="absolute inset-0 opacity-0 [&>*]:h-full [&>*]:w-full [&>*]:cursor-pointer">{children}</div>
    </div>
  );
}
