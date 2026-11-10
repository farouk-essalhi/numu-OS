"use client";

import Link from "next/link";
import { ArrowRight, PenLine, Plus } from "lucide-react";
import { useMemo } from "react";
import { TickMeter } from "@/components/charts";
import { DeliverableTable, type RowGroup } from "@/components/deliverables";
import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import { openNewTask } from "@/lib/new-task";
import { myWork, countsForCapacity } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { isDone } from "@/lib/workflow";

export default function MyWorkPage() {
  const { rows, data, me, role, today, thisMonth } = useNumu();
  const work = useMemo(() => myWork(rows, data, me.id, role, today), [rows, data, me.id, role, today]);
  const done = useMemo(
    () => rows.filter((r) => r.owner_id === me.id && r.month === thisMonth && isDone(r.status)),
    [rows, me.id, thisMonth],
  );
  const points = [...work.overdue, ...work.thisWeek].filter(countsForCapacity).reduce((n, r) => n + r.effort_points, 0);

  // One list, top to bottom in the order to do it: late, today, the week, later.
  const dueToday = work.thisWeek.filter((r) => r.due_date <= today);
  const restOfWeek = work.thisWeek.filter((r) => r.due_date > today);
  const groups: RowGroup[] = [
    { key: "late", title: "Late", rows: work.overdue, tone: "critical" },
    { key: "today", title: "Today", rows: dueToday },
    { key: "week", title: work.weekLabel === "This week" && dueToday.length ? "Rest of this week" : work.weekLabel, rows: restOfWeek },
    { key: "later", title: "Later", rows: work.later },
    { key: "done", title: `Done in ${formatMonth(thisMonth).split(" ")[0]}`, rows: done, collapsed: true },
  ];
  const nothingOpen = work.open.length === 0;

  const summary = [
    work.overdue.length ? `${work.overdue.length} late` : null,
    dueToday.length ? `${dueToday.length} due today` : null,
    `${work.open.length} open`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title="My work"
        subtitle={nothingOpen ? "Everything you own" : summary}
        actions={
          <div className="w-full min-w-[240px] rounded-xl border border-line bg-surface px-4 py-3 shadow-sm sm:w-auto">
            <div className="mb-2 flex items-center justify-between gap-6 text-[12.5px]">
              <span className="text-muted">Your load · {work.weekLabel.toLowerCase()}</span>
              <span className={points > me.weekly_capacity_points ? "font-medium text-serious num" : "font-medium num"}>
                {points}/{me.weekly_capacity_points} pts
              </span>
            </div>
            <TickMeter value={points} max={me.weekly_capacity_points || 1} ticks={24} />
          </div>
        }
      />

      {role !== "creator" && work.signOff.length > 0 ? (
        <Link
          href="/approvals"
          className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm hover:border-line-strong"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-surface-3">
            <PenLine className="size-4" />
          </span>
          <span className="flex-1 text-[13.5px]">
            <span className="font-medium">{work.signOff.length} waiting for your sign-off</span>
            <span className="text-muted"> · internal review on clients you lead</span>
          </span>
          <ArrowRight className="size-4 text-muted" />
        </Link>
      ) : null}

      <Card className="overflow-hidden">
        {nothingOpen ? (
          <Empty className="py-12">
            <span className="block text-[15px] font-medium text-ink">You&apos;re all caught up</span>
            <span className="mt-1 block">Nothing late, nothing waiting. New work shows up here as soon as it&apos;s yours.</span>
            {me.can_create_tasks ? (
              <Button variant="primary" className="mt-4" onClick={() => openNewTask({ ownerId: me.id })}>
                <Plus /> New task
              </Button>
            ) : null}
          </Empty>
        ) : null}
        {nothingOpen && done.length === 0 ? null : (
          <div className={nothingOpen ? "border-t border-line" : undefined}>
            <DeliverableTable groups={nothingOpen ? groups.filter((g) => g.key === "done") : groups} today={today} showOwner={false} quickMove />
          </div>
        )}
      </Card>
    </>
  );
}
