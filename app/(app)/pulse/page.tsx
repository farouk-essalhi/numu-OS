"use client";

import Link from "next/link";
import { CalendarDays, CircleCheck, Hourglass, RotateCcw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar, Card, IconButton, PageHeader, ProgressBar, Segmented, SectionHeader } from "@/components/ui";
import { DotNumber, Heatmap } from "@/components/visuals";
import { formatHours } from "@/lib/dates";
import { percent } from "@/lib/format";
import { pulse, type Range } from "@/lib/selectors";
import { useNumu } from "@/lib/store";

/** Screenshot 3 ("Performance"), measuring delivery instead of hours. */
export default function PulsePage() {
  const { rows, data, today } = useNumu();
  const [range, setRange] = useState<Range>("week");
  const p = useMemo(() => pulse(rows, data, range, today, 22), [rows, data, range, today]);
  const delta = p.onTimePct != null && p.prevOnTimePct != null ? p.onTimePct - p.prevOnTimePct : null;
  const label = range === "week" ? "last week" : "the 30 days before";

  return (
    <>
      <PageHeader
        title="Pulse"
        actions={
          <IconButton href="/schedule" label="Schedule">
            <CalendarDays className="size-[18px]" />
          </IconButton>
        }
      />
      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: "week", label: "This week" },
          { value: "month", label: "30 days" },
        ]}
      />

      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] text-muted">Posted on time</p>
            <p className="mt-1 flex items-baseline gap-2">
              <DotNumber className="text-[44px] text-ink">{p.onTimePct != null ? `${p.onTimePct}%` : "—"}</DotNumber>
            </p>
          </div>
          {delta != null ? (
            <div className="text-right">
              <span className="inline-flex h-7 items-center rounded-full bg-raised px-2.5 text-[13px] font-medium shadow-card">
                <span className={delta >= 0 ? "text-[var(--tone-green)]" : "text-danger"}>{delta >= 0 ? "▲" : "▼"}</span>
                &nbsp;{Math.abs(delta)}%
              </span>
              <p className="mt-1 text-[12px] text-muted">vs {p.prevOnTimePct}% {label}</p>
            </div>
          ) : null}
        </div>
        <div className="no-scrollbar mt-5 overflow-x-auto">
          <Heatmap cells={p.heat} cell={11} gap={3} className="mx-auto w-max" />
        </div>
        <p className="mt-3 text-[12px] text-muted">Each square is a day; darker means more went live.</p>
      </Card>

      <SectionHeader title="By client" href="/clients" />
      <Card className="divide-y divide-line px-4">
        {p.byClient.length === 0 ? <p className="py-6 text-center text-[14px] text-muted">Nothing due in this range.</p> : null}
        {p.byClient.map(({ client, total, done }) => (
          <Link key={client.id} href={`/clients/${client.id}`} className="flex items-center gap-3 py-3.5">
            <Avatar name={client.name_en} size={40} className="rounded-[14px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[15px]">{client.name_en}</p>
                <p className="shrink-0 text-[14px] text-ink-2">
                  {done} of {total}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={percent(done, total)} className="flex-1" />
                <span className="w-9 text-right text-[12px] text-muted">{percent(done, total)}%</span>
              </div>
            </div>
          </Link>
        ))}
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Tile icon={<CircleCheck className="size-4" />} label="Posted" value={String(p.posted)} />
        <Tile
          icon={<Hourglass className="size-4" />}
          label="Client approval"
          value={p.avgApprovalHours != null ? formatHours(p.avgApprovalHours) : "—"}
        />
        <Tile
          icon={<RotateCcw className="size-4" />}
          label="Revisions each"
          value={p.avgRevisions != null ? p.avgRevisions.toFixed(1) : "—"}
        />
      </div>

      <SectionHeader title="Capacity this week" />
      <Card className="divide-y divide-line px-4">
        {p.capacity.map(({ member, booked, available }) => {
          const used = percent(booked, available);
          return (
            <div key={member.id} className="flex items-center gap-3 py-3.5">
              <Avatar name={member.full_name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px]">{member.full_name}</p>
                  <p className={used > 100 ? "text-[14px] font-medium text-danger" : "text-[14px] text-ink-2"}>
                    {booked} / {available} pts
                  </p>
                </div>
                <ProgressBar
                  value={used}
                  className="mt-2"
                  tone={used > 100 ? "var(--danger)" : used > 85 ? "var(--accent)" : undefined}
                />
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <span className="text-ink-2">{icon}</span>
      <p className="mt-3 text-[12px] leading-tight text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">{value}</p>
    </Card>
  );
}
