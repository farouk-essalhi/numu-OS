"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Columns, Heatmap, HeatScale } from "@/components/charts";
import { Avatar, Card, CardHeader, Delta, PageHeader, Segmented } from "@/components/ui";
import { addDays, formatHours, formatShort, qatarDate, weekDays } from "@/lib/dates";
import { approvalHours, clientReports, onTimeBetween, weeklyOnTime } from "@/lib/insights";
import { useNumu } from "@/lib/store";
import { isDone } from "@/lib/workflow";

type Range = "4" | "12";

export default function ReportsPage() {
  const { rows, data, today } = useNumu();
  const [range, setRange] = useState<Range>("4");
  const weeks = Number(range);
  const thisWeek = weekDays(today)[0];
  const from = addDays(thisWeek, -7 * (weeks - 1));
  const prevFrom = addDays(from, -7 * weeks);
  const prevTo = addDays(from, -1);

  const stats = useMemo(() => {
    const cur = onTimeBetween(rows, from, today);
    const prev = onTimeBetween(rows, prevFrom, prevTo);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const hoursCur = [...approvalHours(data, from, today).values()].flat();
    const hoursPrev = [...approvalHours(data, prevFrom, prevTo).values()].flat();
    const revs = (a: string, b: string) => avg(rows.filter((r) => isDone(r.status) && r.due_date >= a && r.due_date <= b).map((r) => r.revision_count));
    return {
      posted: cur.posted,
      postedPrev: prev.posted,
      onTime: cur.pct,
      onTimePrev: prev.pct,
      approval: avg(hoursCur),
      approvalPrev: avg(hoursPrev),
      revisions: revs(from, today),
      revisionsPrev: revs(prevFrom, prevTo),
    };
  }, [rows, data, from, prevFrom, prevTo, today]);

  const weekly = useMemo(() => weeklyOnTime(rows, today, weeks), [rows, today, weeks]);
  const byClient = useMemo(() => clientReports(rows, data, from, today), [rows, data, from, today]);
  const heat = useMemo(() => {
    const heatWeeks = 18;
    const start = addDays(thisWeek, -7 * (heatWeeks - 1));
    const counts = new Map<string, number>();
    for (const r of rows) if (r.posted_at) counts.set(qatarDate(r.posted_at), (counts.get(qatarDate(r.posted_at)) ?? 0) + 1);
    return Array.from({ length: heatWeeks * 7 }, (_, i) => {
      const day = addDays(start, i);
      const count = day > today ? -1 : counts.get(day) ?? 0;
      return { day, count, tooltip: `${formatShort(day)}: ${Math.max(0, count)} posted` };
    });
  }, [rows, thisWeek, today]);

  const pct = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
  const rel = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? Math.round(((a - b) / b) * 100) : null);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${formatShort(from)} – ${formatShort(today)}, compared with the ${weeks} weeks before`}
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "4", label: "4 weeks" },
              { value: "12", label: "12 weeks" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Metric label="Posted" value={String(stats.posted)} delta={<Delta value={rel(stats.posted, stats.postedPrev)} goodWhen="neither" label="vs before" />} />
        <Metric
          label="On time"
          value={stats.onTime != null ? `${stats.onTime}%` : "–"}
          delta={<Delta value={pct(stats.onTime, stats.onTimePrev)} suffix=" pts" label="vs before" />}
        />
        <Metric
          label="Client approval time"
          value={stats.approval != null ? formatHours(stats.approval) : "–"}
          delta={<Delta value={rel(stats.approval, stats.approvalPrev)} goodWhen="down" label="vs before" />}
        />
        <Metric
          label="Revisions per deliverable"
          value={stats.revisions != null ? stats.revisions.toFixed(2) : "–"}
          delta={<Delta value={rel(stats.revisions, stats.revisionsPrev)} goodWhen="down" label="vs before" />}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="On time, week by week" subtitle="Share of deliverables posted on or before their planned date" />
          <div className="px-4 pb-5 sm:px-5">
            <Columns
              title="On-time percentage per week"
              format={(v) => `${v}%`}
              data={weekly.map((w) => ({
                key: w.from,
                label: formatShort(w.from).split(", ")[1],
                value: w.pct,
                tooltip: `Week of ${formatShort(w.from)}: ${w.pct != null ? `${w.pct}% of ${w.posted}` : "nothing posted"}`,
              }))}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Posting activity" subtitle="Deliverables that went live each day, last 18 weeks" action={<HeatScale />} />
          <div className="scroll-thin overflow-x-auto px-4 pb-5 sm:px-5">
            <Heatmap title="Deliverables posted per day" cells={heat} />
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="By client" subtitle="Same period" />
        <div className="scroll-thin overflow-x-auto border-t border-line">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-muted">
              <tr>
                <th className="py-2.5 pr-3 pl-5 text-left font-medium">Client</th>
                <th className="px-3 text-right font-medium">Posted</th>
                <th className="px-3 text-right font-medium">On time</th>
                <th className="px-3 text-right font-medium">Client approval</th>
                <th className="py-2.5 pr-5 pl-3 text-right font-medium">Revisions each</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {byClient.map((c) => (
                <tr key={c.client.id} className="hover:bg-surface-2">
                  <td className="py-3 pr-3 pl-5">
                    <Link href={`/clients/${c.client.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <Avatar name={c.client.name_en} size={26} square />
                      {c.client.name_en}
                    </Link>
                  </td>
                  <td className="px-3 text-right num">{c.posted}</td>
                  <td className="px-3 text-right num">{c.onTimePct != null ? `${c.onTimePct}%` : "–"}</td>
                  <td className="px-3 text-right num">{c.avgApprovalHours != null ? formatHours(c.avgApprovalHours) : "–"}</td>
                  <td className="py-3 pr-5 pl-3 text-right num">{c.avgRevisions != null ? c.avgRevisions.toFixed(2) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] num sm:text-[30px]">{value}</p>
      <div className="mt-2.5">{delta}</div>
    </div>
  );
}
