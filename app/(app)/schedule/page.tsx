"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Chip, Empty, IconButton, PageHeader } from "@/components/ui";
import { addDays, formatMonth, formatShort, isWorkingDay, weekDays, weekdayShort } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import { dayPlan, planningWeek, type BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { STATUS_META } from "@/lib/workflow";
import { DayCircle } from "@/components/visuals";

/** Screenshot 4. Deliverables have dates, not times, so the day is split into
 *  "due for review" and "going live" instead of an hourly timeline. */
export default function SchedulePage() {
  const { rows, today, me } = useNumu();
  // On the weekend, open on Sunday: the start of the week being planned.
  const [selected, setSelected] = useState(() => (isWorkingDay(today) ? today : planningWeek(today).days[0]));
  const [onlyMine, setOnlyMine] = useState(false);
  const days = weekDays(selected);

  const scoped = useMemo(() => (onlyMine ? rows.filter((r) => r.owner_id === me.id) : rows), [rows, onlyMine, me.id]);
  const plan = useMemo(() => dayPlan(scoped, selected), [scoped, selected]);
  const countFor = (day: string) => scoped.filter((r) => r.due_date === day || r.post_date === day).length;

  return (
    <>
      <PageHeader
        title="Schedule"
        back
        actions={
          <button
            type="button"
            onClick={() => setOnlyMine((v) => !v)}
            className={cn(
              "h-10 rounded-full px-3.5 text-[13px] font-medium shadow-card",
              onlyMine ? "bg-primary text-primary-ink" : "bg-raised text-ink-2",
            )}
          >
            {onlyMine ? "Mine" : "Everyone"}
          </button>
        }
      />

      <div className="flex items-center justify-between">
        <p className="text-[17px] font-semibold">{formatMonth(selected)}</p>
        <div className="flex gap-2">
          <IconButton label="Previous week" onClick={() => setSelected(addDays(selected, -7))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Next week" onClick={() => setSelected(addDays(selected, 7))}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 border-b border-line pb-4">
        {days.map((day) => {
          const n = countFor(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelected(day)}
              className={cn("flex flex-col items-center gap-1.5", !isWorkingDay(day) && "opacity-55")}
            >
              <span className="text-[13px] text-muted">{weekdayShort(day)}</span>
              <DayCircle day={day} selected={day === selected} today={day === today} />
              <span className={cn("h-1.5 w-1.5 rounded-full", n > 0 ? "bg-ink/50" : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-[14px] text-muted">
        {formatShort(selected)}
        {!isWorkingDay(selected) ? " · Weekend" : ""}
      </p>

      <Group title="Due for client review" rows={plan.due} kind="due" />
      <Group title="Going live" rows={plan.live} kind="live" />
      {plan.due.length === 0 && plan.live.length === 0 ? <div className="mt-4"><Empty>Nothing due or going live.</Empty></div> : null}
    </>
  );
}

function Group({ title, rows, kind }: { title: string; rows: BoardRow[]; kind: "due" | "live" }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="mb-3 text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h2>
      <div className="relative space-y-3 pl-14">
        {rows.map((r, i) => {
          const meta = STATUS_META[r.status];
          return (
            <div key={r.id} className="relative">
              {i === 0 ? (
                <span className="absolute top-3 -left-14 w-12 text-[12px] text-muted">{kind === "due" ? "Review" : "Live"}</span>
              ) : null}
              <Link
                href={`/d/${r.id}`}
                className={`tone-${meta.tone} relative block rounded-[22px] bg-surface py-3.5 pr-4 pl-5 shadow-card`}
              >
                <span className="absolute top-4 bottom-4 left-2.5 w-[3px] rounded-full" style={{ background: "var(--tone)" }} />
                <p className="truncate text-[16px] font-medium">{r.title}</p>
                <p className="mt-0.5 truncate text-[14px] text-muted">
                  {meta.en} · {r.client.name_en}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    {r.owner ? <Avatar name={r.owner.full_name} size={26} /> : null}
                    {r.platform ? <Chip>{PLATFORM_LABEL[r.platform]}</Chip> : null}
                  </span>
                  <span className="text-[13px] text-muted">{r.effort_points} pts</span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
