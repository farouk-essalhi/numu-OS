"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Button, Card, CardHeader, Empty, IconButton, PageHeader, Segmented, StatusPill } from "@/components/ui";
import { addDays, addMonths, dayNumber, formatLong, formatMonth, isWorkingDay, monthEnd, monthStart, weekStart } from "@/lib/dates";
import { cn } from "@/lib/format";
import { useStored } from "@/lib/hooks";
import { openNewTask } from "@/lib/new-task";
import { dayPlan, planningWeek, type BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { STATUS_META } from "@/lib/workflow";
import { taskHref } from "@/lib/routes";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { rows, me, today } = useNumu();
  const start = isWorkingDay(today) ? today : planningWeek(today).days[0];
  const [selected, setSelected] = useState(start);
  const [month, setMonth] = useState(monthStart(start));
  const [scope, setScope] = useStored<"all" | "mine">("numu.calendar.scope", "all", "local");

  const scoped = useMemo(() => (scope === "mine" ? rows.filter((r) => r.owner_id === me.id) : rows), [rows, scope, me.id]);
  const days = useMemo(() => {
    const first = weekStart(month);
    const last = addDays(weekStart(monthEnd(month)), 6);
    const out: string[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);
  const plan = useMemo(() => dayPlan(scoped, selected), [scoped, selected]);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="What's due each day, and when content goes live"
        actions={
          <>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "Everyone" },
                { value: "mine", label: "Mine" },
              ]}
            />
            <div className="flex items-center rounded-lg border border-line bg-surface shadow-sm">
              <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="size-9">
                <ChevronLeft />
              </IconButton>
              <span className="min-w-[124px] text-center text-[13px] font-medium">{formatMonth(month)}</span>
              <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="size-9">
                <ChevronRight />
              </IconButton>
            </div>
            <Button
              onClick={() => {
                setMonth(monthStart(start));
                setSelected(start);
              }}
            >
              Today
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-[11.5px] font-medium text-muted">
            {WEEKDAYS.map((d, i) => (
              <span key={d} className={cn("px-2 py-2 text-center sm:text-left", i >= 5 && "text-faint")}>
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === month.slice(0, 7);
              const due = scoped.filter((r) => r.due_date === day);
              const live = scoped.filter((r) => r.post_date === day && r.due_date !== day);
              const items: { r: BoardRow; live: boolean }[] = [...due.map((r) => ({ r, live: false })), ...live.map((r) => ({ r, live: true }))];
              const isSel = day === selected;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-pressed={isSel}
                  aria-label={`${formatLong(day)}: ${due.length} due, ${live.length} going live`}
                  className={cn(
                    "relative flex min-h-[64px] flex-col items-stretch gap-1 border-r border-b border-line p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[118px] sm:p-2 [&:nth-child(7n)]:border-r-0",
                    !isWorkingDay(day) && "bg-surface-2",
                    !inMonth && "opacity-45",
                    isSel ? "bg-surface-3" : "hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center self-center rounded-full text-[12px] num sm:self-start",
                      day === today ? "bg-primary font-semibold text-primary-ink" : "text-ink-2",
                    )}
                  >
                    {dayNumber(day)}
                  </span>
                  {/* Phones: dots. Larger screens: chips. */}
                  <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                    {items.slice(0, 4).map(({ r, live }) => (
                      <span key={`${r.id}-${live}`} className="size-1.5 rounded-full" style={{ background: live ? "var(--ink)" : STATUS_META[r.status].color }} />
                    ))}
                  </span>
                  <span className="hidden flex-col gap-1 sm:flex">
                    {items.slice(0, 3).map(({ r, live }) => (
                      <span key={`${r.id}-${live}`} className="flex items-center gap-1.5 truncate rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-2">
                        {live ? <Send className="size-3 shrink-0 text-muted" /> : <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_META[r.status].color }} />}
                        <span className="truncate">{r.title}</span>
                      </span>
                    ))}
                    {items.length > 3 ? <span className="px-1 text-[11px] font-medium text-muted">+{items.length - 3} more</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--series-1)]" /> Due (the dot shows its status)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Send className="size-3" /> Goes live
            </span>
            <span>Weekend shaded</span>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={formatLong(selected)}
            subtitle={
              selected === today
                ? "Today"
                : isWorkingDay(selected)
                  ? `${plan.due.length} due${plan.live.length ? ` · ${plan.live.length} going live` : ""}`
                  : "Weekend"
            }
            action={
              me.can_create_tasks && selected >= today ? (
                <Button size="sm" onClick={() => openNewTask({ due: selected })} title={`New task due ${formatLong(selected)}`}>
                  <Plus /> Add
                </Button>
              ) : null
            }
          />
          <div className="border-t border-line">
            <DayGroup title="Due" rows={plan.due} />
            <DayGroup title="Going live" rows={plan.live} />
            {plan.due.length === 0 && plan.live.length === 0 ? <Empty>Nothing due or going live.</Empty> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

function DayGroup({ title, rows }: { title: string; rows: BoardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="border-b border-line last:border-b-0">
      <h3 className="px-4 pt-3 pb-1 text-[11.5px] font-medium tracking-wide text-faint uppercase sm:px-5">{title}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={taskHref(r.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{r.title}</span>
                <span className="block truncate text-[12px] text-muted">{r.client.name_en}</span>
              </span>
              <StatusPill status={r.status} className="hidden sm:inline-flex xl:hidden 2xl:inline-flex" />
              {r.owner ? <Avatar name={r.owner.full_name} size={22} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
