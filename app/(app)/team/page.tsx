"use client";

import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { TickMeter } from "@/components/charts";
import { EditSheet, type Edit } from "@/components/entity-forms";
import { Avatar, Button, Card, CardHeader, Empty, IconButton, PageHeader, Pill } from "@/components/ui";
import { addDays, dayNumber, formatShort, isWorkingDay, weekdayShort } from "@/lib/dates";
import { cn, percent } from "@/lib/format";
import { capacityWeek } from "@/lib/insights";
import { planningWeek } from "@/lib/selectors";
import { useNumu } from "@/lib/store";

/** Sunday planning: who has room this week, day by day. */
const ROLE_LABEL = { partner: "Partner", account_lead: "Account lead", creator: "Creator" } as const;

export default function TeamPage() {
  const { rows, data, today, role, isDemo } = useNumu();
  const [edit, setEdit] = useState<Edit | null>(null);
  const isPartner = role === "partner";
  const [offset, setOffset] = useState(0);
  const days = useMemo(() => planningWeek(today).days.map((d) => addDays(d, offset * 7)), [today, offset]);
  const cap = useMemo(() => capacityWeek(rows, data, days), [rows, data, days]);
  const booked = cap.reduce((n, c) => n + c.booked, 0);
  const available = cap.reduce((n, c) => n + c.available, 0);
  const maxDay = Math.max(1, ...cap.flatMap((c) => c.byDay));

  return (
    <>
      <PageHeader
        title="Capacity"
        subtitle={`Week of ${formatShort(days[0])} · ${booked} of ${available} points booked (${percent(booked, available)}%)`}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line bg-surface shadow-sm">
              <IconButton label="Previous week" onClick={() => setOffset((o) => o - 1)} className="size-9">
                <ChevronLeft />
              </IconButton>
              <span className="min-w-[132px] text-center text-[13px] font-medium">
                {formatShort(days[0]).split(", ")[1]} – {formatShort(days[6]).split(", ")[1]}
              </span>
              <IconButton label="Next week" onClick={() => setOffset((o) => o + 1)} className="size-9">
                <ChevronRight />
              </IconButton>
            </div>
            {offset !== 0 ? <Button onClick={() => setOffset(0)}>This week</Button> : null}
          </>
        }
      />

      <EditSheet edit={edit} onClose={() => setEdit(null)} />
      <Card className="overflow-hidden">
        {cap.length === 0 ? (
          <Empty>
            Nobody has a weekly capacity yet. {isPartner ? "Set each person's points a week below." : "Partners set it in Team below."}
          </Empty>
        ) : null}
        <div className={cn("scroll-thin hidden overflow-x-auto", cap.length && "md:block")}>
          <table className="w-full min-w-[880px] text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-muted">
              <tr>
                <th className="py-2.5 pr-3 pl-5 text-left font-medium">Person</th>
                {days.map((d) => (
                  <th key={d} className={cn("w-[64px] px-1 text-center font-medium", !isWorkingDay(d) && "text-faint")}>
                    {weekdayShort(d)} <span className="num">{dayNumber(d)}</span>
                  </th>
                ))}
                <th className="w-[240px] px-3 text-left font-medium">Booked / available</th>
                <th className="px-3 text-right font-medium">Open</th>
                <th className="py-2.5 pr-5 pl-3 text-right font-medium">Late</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cap.map((c) => (
                <tr key={c.member.id}>
                  <td className="py-3 pr-3 pl-5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={c.member.full_name} size={30} />
                      <span>
                        <span className="block font-medium">{c.member.full_name}</span>
                        <span className="block text-[12px] text-muted">
                          {c.member.job_title} · {c.member.employment.replace("_", " ")}
                        </span>
                      </span>
                    </span>
                  </td>
                  {c.byDay.map((p, i) => (
                    <td key={days[i]} className={cn("px-1 py-2", !isWorkingDay(days[i]) && "bg-surface-2")}>
                      <span
                        title={`${formatShort(days[i])}: ${p} points due`}
                        className="mx-auto grid h-8 w-11 place-items-center rounded-md text-[12px] font-medium num"
                        style={{
                          background: p ? `var(--seq-${Math.min(4, Math.ceil((p / maxDay) * 4))})` : "transparent",
                          color: p / maxDay > 0.5 ? "#fff" : "var(--ink-2)",
                        }}
                      >
                        {p || <span className="text-faint">·</span>}
                      </span>
                    </td>
                  ))}
                  <td className="px-3">
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span className={c.booked > c.available ? "font-medium text-serious num" : "font-medium num"}>
                        {c.booked} / {c.available} pts
                      </span>
                      <span className="text-muted num">{percent(c.booked, c.available)}%</span>
                    </div>
                    <TickMeter value={c.booked} max={c.available} ticks={24} />
                  </td>
                  <td className="px-3 text-right num">{c.open}</td>
                  <td className="py-3 pr-5 pl-3 text-right num">{c.overdue ? <span className="font-medium text-critical">{c.overdue}</span> : <span className="text-faint">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line md:hidden">
          {cap.map((c) => (
            <li key={c.member.id} className="px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2.5">
                  <Avatar name={c.member.full_name} size={30} />
                  <span>
                    <span className="block text-[13.5px] font-medium">{c.member.full_name}</span>
                    <span className="block text-[12px] text-muted">
                      {c.open} open{c.overdue ? ` · ${c.overdue} late` : ""}
                    </span>
                  </span>
                </span>
                <span className={c.booked > c.available ? "text-[13px] font-medium text-serious num" : "text-[13px] font-medium num"}>
                  {c.booked}/{c.available} pts
                </span>
              </div>
              <TickMeter value={c.booked} max={c.available} ticks={24} />
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted sm:px-5">
          Points come from each deliverable&apos;s type (Reel 3, Static 1…) on its due date. Partners aren&apos;t counted. Weekend shaded.
        </p>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Team"
          subtitle={isPartner ? "Who's in NUMU OS, their role and weekly capacity" : "Partners manage the team"}
          action={
            isPartner ? (
              <Button size="sm" variant="primary" onClick={() => setEdit({ kind: "member" })}>
                <Plus /> Add person
              </Button>
            ) : null
          }
        />
        <ul className="divide-y divide-line border-t border-line">
          {[...data.team]
            .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name))
            .map((m) => (
              <li key={m.id} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", !m.is_active && "opacity-60")}>
                <Avatar name={m.full_name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                    {m.full_name}
                    <Pill tone={m.access_level === "creator" ? "neutral" : "info"}>{ROLE_LABEL[m.access_level]}</Pill>
                    {!m.is_active ? <Pill>Inactive</Pill> : null}
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {[m.job_title, m.email, isDemo ? null : m.user_id ? "can sign in" : "no login yet"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="hidden text-right text-[12.5px] text-muted sm:block num">
                  {m.weekly_capacity_points ? `${m.weekly_capacity_points} pts / week` : "capacity not set"}
                </span>
                {isPartner ? (
                  <IconButton label={`Edit ${m.full_name}`} onClick={() => setEdit({ kind: "member", row: m })}>
                    <Pencil />
                  </IconButton>
                ) : null}
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}
