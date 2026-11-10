"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, ExternalLink, LoaderCircle, Mail, MessageCircle, Pencil, Plus, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { DeliverableTable } from "@/components/deliverables";
import type { Edit } from "@/components/entity-forms";
import { EditSheet } from "@/components/lazy";
import { Avatar, Button, ButtonLink, Card, Empty, Pill, Progress, Tabs, TONE_ICON } from "@/components/ui";
import { addMonths, dayNumber, formatMonth, formatShort } from "@/lib/dates";
import { firstName, formatMoney, percent, PLATFORM_LABEL } from "@/lib/format";
import { clientSummaries, HEALTH_META } from "@/lib/insights";
import { openNewTask } from "@/lib/new-task";
import { canPlan, useNumu } from "@/lib/store";
import type { Retainer } from "@/lib/types";
import { isDone } from "@/lib/workflow";

type Tab = "work" | "scope" | "people" | "campaigns";

const RETAINER_STATUS_LABEL: Record<Retainer["status"], string> = { active: "Active", draft: "Draft", paused: "Paused", ended: "Ended" };

export default function ClientPage() {
  const id = useSearchParams().get("id") ?? "";
  const { rows, data, me, role, today, thisMonth } = useNumu();
  const [tab, setTab] = useState<Tab>("work");
  const [edit, setEdit] = useState<Edit | null>(null);
  const summary = useMemo(() => clientSummaries(rows, data, thisMonth, today).find((c) => c.client.id === id), [rows, data, thisMonth, today, id]);

  if (!summary) {
    return (
      <Card>
        <Empty>
          This client doesn&apos;t exist.{" "}
          <Link href="/clients" className="font-medium text-ink underline">
            Back to clients
          </Link>
        </Empty>
      </Card>
    );
  }

  const { client } = summary;
  const plans = canPlan(role);
  const seesFees = plans;
  // The retainer to show: the active one, else the latest (a draft to switch on).
  const retainers = data.retainers.filter((r) => r.client_id === client.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const retainer = retainers.find((r) => r.status === "active") ?? retainers[0] ?? null;
  // Creators can't read retainers (fees), so find this client's scope through its deliverables.
  const scopeRetainerIds = new Set(
    retainer ? [retainer.id] : rows.filter((r) => r.client_id === client.id && r.retainer_id).map((r) => r.retainer_id!),
  );
  const scope = data.scopeLines.filter((s) => scopeRetainerIds.has(s.retainer_id));
  const projects = data.projects.filter((p) => p.client_id === client.id);
  const contacts = data.contacts.filter((c) => c.client_id === client.id);
  const types = new Map(data.deliverableTypes.map((t) => [t.code, t]));
  const team = new Map(data.team.map((m) => [m.id, m]));
  const meta = HEALTH_META[summary.health];
  const monthlyPoints = scope.reduce((n, s) => n + s.quantity_per_month * (types.get(s.deliverable_type)?.effort_points ?? 0), 0);

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "work", label: formatMonth(thisMonth), count: summary.rows.length },
    { value: "scope", label: "Retainer & scope", count: scope.length },
    { value: "people", label: "Contacts", count: contacts.length },
  ];
  if (seesFees) tabs.push({ value: "campaigns", label: "Campaigns", count: projects.length });

  return (
    <>
      <EditSheet edit={edit} onClose={() => setEdit(null)} />
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[12.5px] text-muted">
        <Link href="/clients" className="hover:text-ink">
          Clients
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-ink-2">{client.name_en}</span>
      </nav>

      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={client.name_en} size={52} square />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[24px]">{client.name_en}</h1>
              {client.status === "active" ? (
                <Pill tone={meta.tone} icon={TONE_ICON[meta.tone]}>
                  {meta.label}
                </Pill>
              ) : (
                <Pill className="capitalize">{client.status}</Pill>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {client.name_ar ? (
                <span lang="ar" dir="rtl">
                  {client.name_ar}
                </span>
              ) : null}
              {client.name_ar && client.industry ? " · " : ""}
              {client.industry}
              {summary.lead ? `${client.name_ar || client.industry ? " · " : ""}Led by ${summary.lead.full_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {client.drive_folder_url ? (
            <ButtonLink href={client.drive_folder_url} target="_blank" rel="noreferrer">
              Drive folder <ExternalLink />
            </ButtonLink>
          ) : null}
          {client.brand_kit_url ? (
            <ButtonLink href={client.brand_kit_url} target="_blank" rel="noreferrer">
              Brand kit <ExternalLink />
            </ButtonLink>
          ) : null}
          {plans ? (
            <Button onClick={() => setEdit({ kind: "client", row: client })}>
              <Pencil /> Edit
            </Button>
          ) : null}
          {me.can_create_tasks && client.status !== "ended" ? (
            <Button variant="primary" onClick={() => openNewTask({ clientId: client.id })}>
              <Plus /> New task
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Approved or live">
          <span className="num">
            {summary.done}/{summary.total}
          </span>
          <Progress value={percent(summary.done, summary.total)} className="mt-3" />
        </Stat>
        <Stat label="With client">
          <span className="num">{summary.waiting}</span>
        </Stat>
        <Stat label="Late">
          <span className={summary.overdue ? "text-critical num" : "num"}>{summary.overdue}</span>
        </Stat>
        {seesFees ? (
          <Stat label="Monthly retainer">
            <span className="num">{summary.feeMinor != null ? formatMoney(summary.feeMinor, summary.currency) : "–"}</span>
          </Stat>
        ) : (
          <Stat label="Extras outside scope">
            <span className="num">{summary.extras}</span>
          </Stat>
        )}
      </div>

      <Card className="overflow-hidden">
        <Tabs className="px-2 sm:px-3" value={tab} onChange={setTab} tabs={tabs} />

        {tab === "work" ? (
          <DeliverableTable
            rows={summary.rows}
            today={today}
            showClient={false}
            empty={
              scope.length && plans
                ? `Nothing for ${formatMonth(thisMonth)} yet. Generate the month in "Retainer & scope".`
                : "Nothing this month."
            }
          />
        ) : null}

        {tab === "scope" ? (
          <div>
            {plans ? (
              <RetainerBar
                retainer={retainer}
                monthlyPoints={monthlyPoints}
                hasScope={scope.length > 0}
                onAdd={() => setEdit({ kind: "retainer", clientId: client.id })}
                onEdit={(r) => setEdit({ kind: "retainer", clientId: client.id, row: r })}
                clientActive={client.status === "active"}
              />
            ) : null}
            {scope.length === 0 ? (
              <Empty>
                {plans
                  ? retainer
                    ? "Add what happens each month: content (e.g. 6 Reels on Instagram) and recurring tasks (e.g. the report on the 3rd)."
                    : "No retainer yet. Add one to set the monthly fee and scope."
                  : "No monthly scope yet."}
              </Empty>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {scope.map((s) => {
                  const type = types.get(s.deliverable_type)!;
                  const items = summary.rows.filter((r) => r.scope_line_id === s.id);
                  const done = items.filter((r) => isDone(r.status)).length;
                  const owner = s.default_owner_id ? team.get(s.default_owner_id) : null;
                  const body = (
                    <>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium">
                          {s.quantity_per_month} × {type.name_en}
                          {s.platform ? <span className="font-normal text-muted"> · {PLATFORM_LABEL[s.platform]}</span> : null}
                        </p>
                        <p className="truncate text-[12px] text-muted">
                          {s.quantity_per_month === 1 && s.due_day ? `due on day ${s.due_day} · ` : ""}
                          {type.effort_points} pts each · usually {owner ? firstName(owner.full_name) : "the account lead"}
                          {s.notes ? ` · ${s.notes}` : ""}
                        </p>
                      </div>
                      <span className="flex items-center gap-2.5">
                        <Progress value={percent(done, items.length)} className="flex-1" />
                        <span className="w-20 text-right text-[12px] text-muted num">
                          {items.length ? `${done} of ${items.length}` : "not generated"}
                        </span>
                        {plans ? <Pencil className="size-3.5 text-faint" /> : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={s.id}>
                      {plans ? (
                        <button
                          type="button"
                          onClick={() => setEdit({ kind: "scope", retainerId: s.retainer_id, row: s })}
                          className="grid w-full gap-2 px-4 py-3.5 text-left hover:bg-surface-2 sm:grid-cols-[1fr_240px] sm:items-center sm:px-5"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_220px] sm:items-center sm:px-5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {plans && retainer ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
                <Button size="sm" onClick={() => setEdit({ kind: "scope", retainerId: retainer.id })}>
                  <Plus /> Add to scope
                </Button>
                {scope.length ? <GenerateButtons retainer={retainer} clientActive={client.status === "active"} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "people" ? (
          <>
            {contacts.length === 0 ? <Empty>No contacts yet. Add who approves content and who to WhatsApp.</Empty> : null}
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={c.full_name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[13.5px] font-medium">
                      {c.full_name}
                      {c.is_approver ? <Pill tone="info">Approver</Pill> : null}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {c.job_title ? `${c.job_title} · ` : ""}emails in {c.preferred_language === "ar" ? "Arabic" : "English"}
                    </p>
                  </div>
                  {c.phone ? (
                    <a
                      href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                      aria-label={`WhatsApp ${c.full_name}`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-2"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  ) : null}
                  {c.email ? (
                    <a href={`mailto:${c.email}`} aria-label={`Email ${c.full_name}`} className="grid size-9 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-2">
                      <Mail className="size-4" />
                    </a>
                  ) : null}
                  {plans ? (
                    <button
                      type="button"
                      onClick={() => setEdit({ kind: "contact", clientId: client.id, row: c })}
                      aria-label={`Edit ${c.full_name}`}
                      className="grid size-9 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-2"
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {plans ? (
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <Button size="sm" onClick={() => setEdit({ kind: "contact", clientId: client.id })}>
                  <Plus /> Add contact
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "campaigns" ? (
          <>
            {projects.length === 0 ? <Empty>No campaigns for this client.</Empty> : null}
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-2 pr-3 hover:bg-surface-2">
                  <Link href={`/deliverables?project=${p.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium">{p.name_en}</span>
                      <span className="block text-[12px] text-muted capitalize">
                        {p.status} · {p.deadline ? `deadline ${formatShort(p.deadline)}` : "no deadline"}
                      </span>
                    </span>
                    <span className="text-[13px] font-medium num">{formatMoney(p.fixed_fee_minor, p.currency)}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEdit({ kind: "project", clientId: client.id, row: p })}
                    aria-label={`Edit ${p.name_en}`}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink"
                  >
                    <Pencil className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-3 sm:px-5">
              <Button size="sm" onClick={() => setEdit({ kind: "project", clientId: client.id })}>
                <Plus /> New campaign
              </Button>
            </div>
          </>
        ) : null}
      </Card>
    </>
  );
}

function RetainerBar({
  retainer,
  monthlyPoints,
  hasScope,
  onAdd,
  onEdit,
  clientActive,
}: {
  retainer: Retainer | null;
  monthlyPoints: number;
  hasScope: boolean;
  onAdd: () => void;
  onEdit: (r: Retainer) => void;
  clientActive: boolean;
}) {
  if (!retainer) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <p className="text-[13px] text-muted">The monthly contract: fee, start date, billing day.</p>
        <Button variant="primary" size="sm" onClick={onAdd}>
          <Plus /> Add retainer
        </Button>
      </div>
    );
  }
  const warn = retainer.status !== "active" ? "Not active, so nothing is generated" : !clientActive ? "The client isn't active, so nothing is generated" : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2/60 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold num">
          {formatMoney(retainer.monthly_fee_minor, retainer.currency)}
          <span className="text-[12.5px] font-normal text-muted">a month</span>
          <Pill tone={retainer.status === "active" ? "good" : "neutral"}>{RETAINER_STATUS_LABEL[retainer.status]}</Pill>
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Since {formatShort(retainer.start_date)}
          {retainer.end_date ? ` until ${formatShort(retainer.end_date)}` : ""} · billed{" "}
          {retainer.billing_day ? `on day ${retainer.billing_day}` : "on the last working day"}
          {hasScope ? ` · ${monthlyPoints} pts of work a month` : ""}
        </p>
        {warn ? <p className="mt-1 text-[12.5px] text-serious">{warn}</p> : null}
      </div>
      <Button size="sm" onClick={() => onEdit(retainer)}>
        <Pencil /> Edit retainer
      </Button>
    </div>
  );
}

/** Run the monthly generator for this retainer: this month, or next once it's late in the month. */
function GenerateButtons({ retainer, clientActive }: { retainer: Retainer; clientActive: boolean }) {
  const { generate, notify, thisMonth, today } = useNumu();
  const [busy, setBusy] = useState<string | null>(null);
  const next = addMonths(thisMonth, 1);
  const months = dayNumber(today) >= 15 ? [thisMonth, next] : [thisMonth];
  const disabled = retainer.status !== "active" || !clientActive;

  async function run(month: string) {
    setBusy(month);
    const r = await generate(month, retainer.id);
    setBusy(null);
    if (!r.ok) return notify(r.reason, "error");
    notify(
      r.created
        ? `Created ${r.created} ${r.created === 1 ? "item" : "items"} for ${formatMonth(month)}`
        : `${formatMonth(month)} already has everything in scope`,
      r.created ? "success" : "info",
      r.created ? { label: "View", href: "/deliverables" } : undefined,
    );
  }

  return (
    <>
      {months.map((m) => (
        <Button key={m} size="sm" variant={m === thisMonth ? "primary" : "secondary"} disabled={disabled || busy !== null} onClick={() => void run(m)}>
          {busy === m ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Generate {formatMonth(m)}
        </Button>
      ))}
      <span className="text-[12px] text-muted">Only adds what&apos;s missing. Runs by itself on the 25th for next month.</span>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-[12.5px] text-muted">{label}</p>
      <div className="mt-1.5 text-[22px] leading-none font-semibold tracking-[-0.02em]">{children}</div>
    </div>
  );
}
