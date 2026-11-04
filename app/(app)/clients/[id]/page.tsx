"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, ExternalLink, Mail, MessageCircle } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { DeliverableTable } from "@/components/deliverables";
import { Avatar, ButtonLink, Card, Empty, Pill, Progress, Tabs, TONE_ICON } from "@/components/ui";
import { formatMonth, formatShort } from "@/lib/dates";
import { firstName, formatMoney, percent, PLATFORM_LABEL } from "@/lib/format";
import { clientSummaries, HEALTH_META } from "@/lib/insights";
import { useNumu } from "@/lib/store";
import { isDone } from "@/lib/workflow";

type Tab = "work" | "scope" | "people" | "campaigns";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { rows, data, role, today, thisMonth } = useNumu();
  const [tab, setTab] = useState<Tab>("work");
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
  const seesFees = role !== "creator";
  const retainer = data.retainers.find((r) => r.client_id === client.id && r.status === "active");
  const scope = retainer ? data.scopeLines.filter((s) => s.retainer_id === retainer.id) : [];
  const projects = data.projects.filter((p) => p.client_id === client.id);
  const contacts = data.contacts.filter((c) => c.client_id === client.id);
  const types = new Map(data.deliverableTypes.map((t) => [t.code, t]));
  const team = new Map(data.team.map((m) => [m.id, m]));
  const meta = HEALTH_META[summary.health];

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "work", label: formatMonth(thisMonth), count: summary.total },
    { value: "scope", label: "Monthly scope", count: scope.length },
    { value: "people", label: "People", count: contacts.length },
  ];
  if (seesFees) tabs.push({ value: "campaigns", label: "Campaigns", count: projects.length });

  return (
    <>
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
              <Pill tone={meta.tone} icon={TONE_ICON[meta.tone]}>
                {meta.label}
              </Pill>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {client.name_ar ? (
                <span lang="ar" dir="rtl">
                  {client.name_ar}
                </span>
              ) : null}
              {client.name_ar ? " · " : ""}
              {client.industry}
              {summary.lead ? ` · Led by ${summary.lead.full_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
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

        {tab === "work" ? <DeliverableTable rows={summary.rows} today={today} showClient={false} empty="Nothing this month." /> : null}

        {tab === "scope" ? (
          scope.length === 0 ? (
            <Empty>No active retainer.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {scope.map((s) => {
                const type = types.get(s.deliverable_type)!;
                const items = summary.rows.filter((r) => r.scope_line_id === s.id);
                const done = items.filter((r) => isDone(r.status)).length;
                const owner = s.default_owner_id ? team.get(s.default_owner_id) : null;
                return (
                  <li key={s.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_220px] sm:items-center sm:px-5">
                    <div>
                      <p className="text-[13.5px] font-medium">
                        {s.quantity_per_month} × {type.name_en}
                        {s.platform ? <span className="font-normal text-muted"> · {PLATFORM_LABEL[s.platform]}</span> : null}
                      </p>
                      <p className="text-[12px] text-muted">
                        {type.effort_points} pts each · usually {owner ? firstName(owner.full_name) : "the account lead"}
                      </p>
                    </div>
                    <span className="flex items-center gap-2.5">
                      <Progress value={percent(done, items.length)} className="flex-1" />
                      <span className="w-20 text-right text-[12px] text-muted num">
                        {done} of {items.length}
                      </span>
                    </span>
                  </li>
                );
              })}
              {retainer && seesFees ? (
                <li className="px-4 py-3 text-[12.5px] text-muted sm:px-5">
                  Since {formatShort(retainer.start_date)} · billed {retainer.billing_day ? `on the ${retainer.billing_day}th` : "on the last working day"}
                </li>
              ) : null}
            </ul>
          )
        ) : null}

        {tab === "people" ? (
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
                    {c.job_title} · emails in {c.preferred_language === "ar" ? "Arabic" : "English"}
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
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "campaigns" ? (
          projects.length === 0 ? (
            <Empty>No campaigns for this client.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/deliverables?project=${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                    <span>
                      <span className="block text-[13.5px] font-medium">{p.name_en}</span>
                      <span className="block text-[12px] text-muted">{p.deadline ? `Deadline ${formatShort(p.deadline)}` : "No deadline"}</span>
                    </span>
                    <span className="text-[13px] font-medium num">{formatMoney(p.fixed_fee_minor, p.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>

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
