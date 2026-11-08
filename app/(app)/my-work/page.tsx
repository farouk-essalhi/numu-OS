"use client";

import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { TickMeter } from "@/components/charts";
import { DeliverableTable } from "@/components/deliverables";
import { Card, PageHeader, Tabs } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import { myWork, countsForCapacity } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { isDone } from "@/lib/workflow";

type Tab = "overdue" | "week" | "later" | "done";

export default function MyWorkPage() {
  const { rows, data, me, role, today, thisMonth } = useNumu();
  const work = useMemo(() => myWork(rows, data, me.id, role, today), [rows, data, me.id, role, today]);
  const done = useMemo(
    () => rows.filter((r) => r.owner_id === me.id && r.month === thisMonth && isDone(r.status)),
    [rows, me.id, thisMonth],
  );
  // Open on the first tab with something in it.
  const [tab, setTab] = useState<Tab>(work.overdue.length ? "overdue" : work.thisWeek.length || !work.later.length ? "week" : "later");
  const points = [...work.overdue, ...work.thisWeek].filter(countsForCapacity).reduce((n, r) => n + r.effort_points, 0);

  const list = { overdue: work.overdue, week: work.thisWeek, later: work.later, done }[tab];

  return (
    <>
      <PageHeader
        title="My work"
        subtitle={`Everything you own · ${work.open.length} open`}
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

      <Card>
        <Tabs
          className="px-2 sm:px-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "overdue", label: "Late", count: work.overdue.length },
            { value: "week", label: work.weekLabel, count: work.thisWeek.length },
            { value: "later", label: "Later", count: work.later.length },
            { value: "done", label: `Done in ${formatMonth(thisMonth).split(" ")[0]}`, count: done.length },
          ]}
        />
        <DeliverableTable
          rows={list}
          today={today}
          showOwner={false}
          quickMove={tab !== "done"}
          empty={tab === "overdue" ? "Nothing late. Nice." : tab === "done" ? "Nothing approved yet this month." : "Nothing here."}
        />
      </Card>
    </>
  );
}
