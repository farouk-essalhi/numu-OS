"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, Mail, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { TaskCard } from "@/components/deliverable-card";
import { Avatar, Card, Chip, Empty, PageHeader, ProgressBar, SectionHeader } from "@/components/ui";
import { DotNumber } from "@/components/visuals";
import { formatMonth, formatShort } from "@/lib/dates";
import { formatMoney, PLATFORM_LABEL, percent } from "@/lib/format";
import { clientMonth } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { isDone } from "@/lib/workflow";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { rows, data, role, today, thisMonth } = useNumu();
  const client = data.clients.find((c) => c.id === id);
  const month = useMemo(() => (client ? clientMonth(rows, client, thisMonth, today) : null), [rows, client, thisMonth, today]);

  if (!client || !month) {
    return (
      <>
        <PageHeader title="Client" back />
        <Empty>This client doesn&apos;t exist.</Empty>
      </>
    );
  }

  const seesFees = role !== "creator";
  const retainer = data.retainers.find((r) => r.client_id === client.id && r.status === "active");
  const scope = retainer ? data.scopeLines.filter((s) => s.retainer_id === retainer.id) : [];
  const projects = data.projects.filter((p) => p.client_id === client.id);
  const contacts = data.contacts.filter((c) => c.client_id === client.id);
  const lead = data.team.find((m) => m.id === client.account_lead_id);
  const types = new Map(data.deliverableTypes.map((t) => [t.code, t]));

  return (
    <>
      <PageHeader title={client.name_en} back />

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={client.name_en} size={56} />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-semibold">{client.name_en}</p>
            {client.name_ar ? (
              <p lang="ar" dir="rtl" className="truncate text-left text-[15px] text-ink-2">
                {client.name_ar}
              </p>
            ) : null}
            <p className="mt-0.5 text-[13px] text-muted">
              {client.industry}
              {lead ? ` · Led by ${lead.full_name}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
          <div>
            <p className="text-[13px] text-muted">{formatMonth(thisMonth)}</p>
            <DotNumber className="text-[40px] text-ink">
              {month.done}/{month.total}
            </DotNumber>
            <p className="mt-1 text-[13px] text-muted">approved or live</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {month.waiting > 0 ? <Chip tone="accent">{month.waiting} with client</Chip> : null}
            {month.overdue > 0 ? <Chip tone="danger">{month.overdue} late</Chip> : null}
            {month.extras > 0 ? <Chip>{month.extras} extra</Chip> : null}
          </div>
        </div>
        <ProgressBar value={percent(month.done, month.total)} className="mt-4" />
      </Card>

      {retainer ? (
        <>
          <SectionHeader title="Monthly scope" />
          <Card className="divide-y divide-line px-4">
            {seesFees ? (
              <div className="flex items-center justify-between py-3.5">
                <span className="text-[15px] text-muted">Retainer</span>
                <span className="text-[15px] font-medium">{formatMoney(retainer.monthly_fee_minor, retainer.currency)} / month</span>
              </div>
            ) : null}
            {scope.map((s) => {
              const type = types.get(s.deliverable_type)!;
              const items = month.rows.filter((r) => r.scope_line_id === s.id);
              const done = items.filter((r) => isDone(r.status)).length;
              return (
                <div key={s.id} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[15px]">
                      {s.quantity_per_month} × {type.name_en}
                      {s.platform ? <span className="text-muted"> · {PLATFORM_LABEL[s.platform]}</span> : null}
                    </p>
                    <p className="text-[14px] text-ink-2">
                      {done} of {items.length}
                    </p>
                  </div>
                  <ProgressBar value={percent(done, items.length)} className="mt-2" />
                </div>
              );
            })}
            {seesFees ? (
              <p className="py-3 text-[13px] text-muted">
                Since {formatShort(retainer.start_date)} · billed {retainer.billing_day ? `on the ${retainer.billing_day}th` : "last working day"}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      {seesFees && projects.length > 0 ? (
        <>
          <SectionHeader title="Campaigns" />
          <Card className="divide-y divide-line px-4">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{p.name_en}</p>
                  <p className="text-[13px] text-muted">{p.deadline ? `Deadline ${formatShort(p.deadline)}` : "No deadline"}</p>
                </div>
                <span className="shrink-0 text-[14px] font-medium">{formatMoney(p.fixed_fee_minor, p.currency)}</span>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="People" />
      <Card className="divide-y divide-line px-4">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-3">
            <Avatar name={c.full_name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">
                {c.full_name} {c.is_approver ? <Chip className="ml-1 align-middle">Approver</Chip> : null}
              </p>
              <p className="truncate text-[13px] text-muted">
                {c.job_title} · {c.preferred_language === "ar" ? "Arabic" : "English"}
              </p>
            </div>
            {c.phone ? (
              <a
                href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                aria-label={`WhatsApp ${c.full_name}`}
                className="grid size-9 place-items-center rounded-full bg-inset text-ink-2"
              >
                <MessageCircle className="size-4" />
              </a>
            ) : null}
            {c.email ? (
              <a href={`mailto:${c.email}`} aria-label={`Email ${c.full_name}`} className="grid size-9 place-items-center rounded-full bg-inset text-ink-2">
                <Mail className="size-4" />
              </a>
            ) : null}
          </div>
        ))}
      </Card>

      <div className="mt-4 flex gap-2">
        {client.drive_folder_url ? <LinkPill href={client.drive_folder_url} label="Drive folder" /> : null}
        {client.brand_kit_url ? <LinkPill href={client.brand_kit_url} label="Brand kit" /> : null}
      </div>

      <SectionHeader title="This month" href={`/board?q=${encodeURIComponent(client.name_en)}`} action="Board" />
      <div className="space-y-3">
        {month.rows.length === 0 ? <Empty>Nothing this month.</Empty> : null}
        {month.rows.map((r) => (
          <TaskCard key={r.id} row={r} today={today} showClient={false} />
        ))}
      </div>
    </>
  );
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-10 items-center gap-2 rounded-full bg-raised px-4 text-[14px] font-medium shadow-card"
    >
      {label} <ExternalLink className="size-3.5 text-muted" />
    </Link>
  );
}
