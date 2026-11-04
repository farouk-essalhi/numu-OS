"use client";

import Link from "next/link";
import { CalendarClock, Hourglass, ListChecks, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Donut, Legend, Sparkbars, StackedColumns, TickMeter, type Series } from "@/components/charts";
import {
  Avatar,
  ButtonLink,
  Card,
  CardHeader,
  CardLink,
  Delta,
  Empty,
  PageHeader,
  Pill,
  Progress,
  StatusPill,
  TONE_ICON,
} from "@/components/ui";
import { dayNumber, formatHours, formatLong, formatMonth, formatRelative, formatShort, greeting, timeAgo, weekdayShort } from "@/lib/dates";
import { firstName, percent } from "@/lib/format";
import {
  activityFeed,
  attentionItems,
  capacityWeek,
  change,
  clientSummaries,
  deliveryByDay,
  HEALTH_META,
  overviewKpis,
  stageMix,
  upcoming,
  type AttentionReason,
} from "@/lib/insights";
import { planningWeek } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { STATUS_META } from "@/lib/workflow";

const STAGE_SERIES: Series[] = [
  { key: "production", label: "In production", color: "var(--series-1)" },
  { key: "review", label: "In review", color: "var(--series-2)" },
  { key: "ready", label: "Approved", color: "var(--series-3)" },
  { key: "live", label: "Live", color: "var(--series-4)" },
];

export default function OverviewPage() {
  const { rows, data, me, today, thisMonth, hour, now } = useNumu();
  const [nowMs] = useState(() => now.getTime());

  const kpis = useMemo(() => overviewKpis(rows, data, today), [rows, data, today]);
  const delivery = useMemo(() => deliveryByDay(rows, thisMonth), [rows, thisMonth]);
  const mix = useMemo(() => stageMix(rows, thisMonth), [rows, thisMonth]);
  const clients = useMemo(() => clientSummaries(rows, data, thisMonth, today), [rows, data, thisMonth, today]);
  const attention = useMemo(() => attentionItems(rows), [rows]);
  const capacity = useMemo(() => capacityWeek(rows, data, planningWeek(today).days), [rows, data, today]);
  const next = useMemo(() => upcoming(rows, today, 7), [rows, today]);
  const activity = useMemo(() => activityFeed(data, rows, 6, now.toISOString()), [data, rows, now]);
  const todayInMonth = delivery.find((d) => d.day >= today)?.day;

  return (
    <>
      <PageHeader
        title={
          <>
            {greeting(hour)}, {firstName(me.full_name)}
          </>
        }
        subtitle={`${formatLong(today)} · Here's how NUMU is doing.`}
        actions={
          <>
            <ButtonLink href="/calendar">
              <CalendarClock />
              Calendar
            </ButtonLink>
            <ButtonLink href="/my-work" variant="primary">
              <ListChecks />
              My work
            </ButtonLink>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          href="/deliverables"
          label={`Due ${kpis.weekLabel.toLowerCase()}`}
          value={kpis.due.value}
          delta={<Delta value={change(kpis.due.value, kpis.due.previous)} goodWhen="neither" label="vs week before" />}
          visual={<Sparkbars values={kpis.due.byDay.map((d) => d.count)} labels={kpis.due.byDay.map((d) => formatShort(d.day))} />}
        />
        <Kpi
          href="/approvals"
          label="Waiting on clients"
          value={kpis.waiting.value}
          delta={
            <span className="text-[12.5px] text-muted">
              {kpis.waiting.overdue48h > 0 ? (
                <span className="font-medium text-serious">{kpis.waiting.overdue48h} over 48h</span>
              ) : (
                "None over 48h"
              )}
              {kpis.waiting.longestHours != null ? ` · longest ${formatHours(kpis.waiting.longestHours)}` : ""}
            </span>
          }
          visual={<Hourglass className="size-9 text-faint" strokeWidth={1.4} />}
        />
        <Kpi
          href="/reports"
          label="Posted on time · 30 days"
          value={kpis.onTime.value != null ? `${kpis.onTime.value}%` : "–"}
          delta={
            <Delta
              value={kpis.onTime.value != null && kpis.onTime.previous != null ? kpis.onTime.value - kpis.onTime.previous : null}
              suffix=" pts"
              label="vs previous 30"
            />
          }
          visual={<Sparkbars values={kpis.onTime.weekly.map((w) => w.pct ?? 0)} labels={kpis.onTime.weekly.map((w) => `Week of ${formatShort(w.from)}`)} />}
        />
        <Kpi
          href="/team"
          label={`Capacity used · ${kpis.weekLabel.toLowerCase()}`}
          value={`${kpis.capacity.pct}%`}
          delta={<Delta value={kpis.capacity.pct - kpis.capacity.previousPct} suffix=" pts" goodWhen="neither" label="vs week before" />}
          visual={
            <div className="w-24">
              <Progress value={kpis.capacity.pct} color={kpis.capacity.pct > 100 ? "var(--serious)" : "var(--series-1)"} />
              <p className="mt-1.5 text-right text-[11.5px] text-muted num">
                {kpis.capacity.booked}/{kpis.capacity.available} pts
              </p>
            </div>
          }
        />
      </div>

      {/* Delivery + mix */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={`Delivery · ${formatMonth(thisMonth)}`}
            subtitle="Deliverables due on each working day, by where they are now"
            action={<CardLink href="/deliverables">Board</CardLink>}
          />
          <div className="px-4 pb-4 sm:px-5">
            <Legend series={STAGE_SERIES} className="mb-4" />
            <StackedColumns
              title={`Deliverables due per working day in ${formatMonth(thisMonth)}`}
              series={STAGE_SERIES}
              marker={todayInMonth}
              data={delivery.map((d) => ({
                key: d.day,
                label: String(dayNumber(d.day)),
                tooltipTitle: `${weekdayShort(d.day)} ${formatShort(d.day).split(", ")[1]} · ${d.total} due`,
                values: { production: d.production, review: d.review, ready: d.ready, live: d.live },
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Where this month stands" subtitle={`${mix.total} deliverables in ${formatMonth(thisMonth)}`} />
          <div className="flex flex-col items-center gap-5 px-4 pb-5 sm:flex-row sm:px-5 xl:flex-col 2xl:flex-row">
            <Donut
              label="this month"
              total={mix.total}
              segments={mix.stages.map((s, i) => ({ key: s.key, label: s.label, value: s.count, color: STAGE_SERIES[i].color }))}
            />
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-line">
                {mix.stages.map((s, i) => (
                  <tr key={s.key}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2 text-ink-2">
                        <span className="size-2.5 rounded-[3px]" style={{ background: STAGE_SERIES[i].color }} />
                        {s.label}
                      </span>
                    </td>
                    <td className="py-2 text-right font-medium num">{s.count}</td>
                    <td className="w-14 py-2 text-right text-muted num">{percent(s.count, mix.total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Clients + attention */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Client health" subtitle="This month's retainer work, done vs planned" action={<CardLink href="/clients">All clients</CardLink>} />
          <ul className="divide-y divide-line border-t border-line">
            {clients.map((c) => {
              const meta = HEALTH_META[c.health];
              const pct = percent(c.done, c.total);
              return (
                <li key={c.client.id}>
                  <Link href={`/clients/${c.client.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:px-5">
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.client.name_en} size={32} square />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{c.client.name_en}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {c.lead ? `Led by ${firstName(c.lead.full_name)}` : "No lead"} · {c.total - c.done} to go
                        </span>
                      </span>
                    </span>
                    <span className="col-span-2 flex items-center gap-3 sm:col-span-1">
                      <Progress value={pct} className="flex-1" />
                      <span className="w-16 text-right text-[12px] text-muted num">
                        {c.done}/{c.total}
                      </span>
                    </span>
                    <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                      <Pill tone={meta.tone} icon={TONE_ICON[meta.tone]}>
                        {meta.label}
                      </Pill>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Needs attention"
            subtitle="Late work, client waits over 48 hours, and 2+ revisions"
            action={<CardLink href="/approvals">Approvals</CardLink>}
          />
          {attention.length === 0 ? (
            <Empty>All clear. Nothing late or stuck.</Empty>
          ) : (
            <ul className="scroll-thin max-h-[352px] divide-y divide-line overflow-y-auto border-t border-line">
              {attention.slice(0, 12).map(({ row, reason }) => (
                <li key={`${reason}-${row.id}`}>
                  <Link href={`/deliverables/${row.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                    <ReasonIcon reason={reason} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{row.title}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {row.client.name_en}
                        {row.owner ? ` · ${firstName(row.owner.full_name)}` : ""}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <StatusPill status={row.status} />
                    </span>
                    <span className="w-24 shrink-0 text-right text-[12.5px] text-muted num">
                      {reason === "waiting" && row.flags.waitingHours ? `${formatHours(row.flags.waitingHours)} waiting` : `Due ${formatRelative(row.due_date, today)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Capacity, deadlines, activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title={`Team capacity · ${kpis.weekLabel.toLowerCase()}`} subtitle="Effort points booked vs available" action={<CardLink href="/team">Plan</CardLink>} />
          <ul className="space-y-4 px-4 pb-5 sm:px-5">
            {capacity.map((c) => (
              <li key={c.member.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={c.member.full_name} size={22} />
                    <span className="truncate">{c.member.full_name}</span>
                  </span>
                  <span className={c.booked > c.available ? "font-medium text-serious num" : "text-muted num"}>
                    {c.booked}/{c.available} pts
                  </span>
                </div>
                <TickMeter value={c.booked} max={c.available} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Upcoming deadlines" subtitle="Due for client review in the next 7 days" action={<CardLink href="/calendar">Calendar</CardLink>} />
          {next.length === 0 ? (
            <Empty>Nothing due in the next week.</Empty>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {next.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/deliverables/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                    <span className="grid w-10 shrink-0 place-items-center rounded-lg border border-line py-1 text-center leading-tight">
                      <span className="text-[10.5px] text-muted uppercase">{weekdayShort(r.due_date)}</span>
                      <span className="text-[14px] font-semibold num">{dayNumber(r.due_date)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{r.title}</span>
                      <span className="block truncate text-[12px] text-muted">{r.client.name_en}</span>
                    </span>
                    {r.owner ? <Avatar name={r.owner.full_name} size={22} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Recent activity" subtitle="Status changes and comments" />
          <ul className="space-y-4 px-4 pb-5 sm:px-5">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <Avatar name={a.who ?? "System"} size={28} />
                <div className="min-w-0 text-[13px]">
                  <p className="leading-snug text-ink-2">
                    <span className="font-medium text-ink">{a.who ? firstName(a.who) : "System"}</span>{" "}
                    {a.kind === "comment" ? "commented on" : a.kind === "created" ? "created" : "moved"}{" "}
                    <Link href={`/deliverables/${a.row.id}`} className="font-medium text-ink hover:underline">
                      {a.row.title}
                    </Link>
                    {a.toStatus ? (
                      <>
                        {" "}to <span className="font-medium text-ink">{STATUS_META[a.toStatus].en}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {a.row.client.name_en} · {timeAgo(a.at, nowMs)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Kpi({
  href,
  label,
  value,
  delta,
  visual,
}: {
  href: string;
  label: string;
  value: ReactNode;
  delta: ReactNode;
  visual: ReactNode;
}) {
  return (
    <Link href={href} className="group rounded-xl border border-line bg-surface p-4 shadow-sm transition-colors hover:border-line-strong sm:p-5">
      <p className="truncate text-[12.5px] font-medium text-muted group-hover:text-ink-2">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[26px] leading-none font-semibold tracking-[-0.02em] num sm:text-[30px]">{value}</p>
        <div className="hidden shrink-0 sm:block">{visual}</div>
      </div>
      <div className="mt-2.5 min-h-[18px]">{delta}</div>
    </Link>
  );
}

function ReasonIcon({ reason }: { reason: AttentionReason }) {
  const map = {
    overdue: { icon: <TriangleAlert />, color: "var(--critical-ink)", label: "Late" },
    waiting: { icon: <Hourglass />, color: "var(--serious-ink)", label: "Waiting on client" },
    revisions: { icon: <RotateCcw />, color: "var(--warning-ink)", label: "2+ revisions" },
  }[reason];
  return (
    <span
      title={map.label}
      className="grid size-8 shrink-0 place-items-center rounded-lg [&>svg]:size-4"
      style={{ color: map.color, background: `color-mix(in oklab, ${map.color} 10%, transparent)` }}
    >
      {map.icon}
      <span className="sr-only">{map.label}</span>
    </span>
  );
}

