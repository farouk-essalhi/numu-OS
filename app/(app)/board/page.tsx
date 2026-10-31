"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BoardCard } from "@/components/deliverable-card";
import { Avatar, PageHeader, Segmented } from "@/components/ui";
import { addMonths, formatMonth, monthStart } from "@/lib/dates";
import { cn } from "@/lib/format";
import { planningWeek, type BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import { isWithTeam, STATUSES, STATUS_META } from "@/lib/workflow";

type Mode = "status" | "client" | "person";

const COLUMN_LIMIT = 8;

interface Column {
  key: string;
  title: string;
  tone?: string;
  avatar?: string;
  meta?: string;
  rows: BoardRow[];
}

export default function BoardPage() {
  const { rows, data, me, today } = useNumu();
  // Open on the month being planned: on the weekend after month-end that's next month.
  const planningMonth = monthStart(planningWeek(today).days[0]);
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("status");
  const [month, setMonth] = useState(planningMonth);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const q = params.get("q")?.toLowerCase() ?? "";
  const onlyStatus = params.get("status") as DeliverableStatus | null;
  const mine = params.get("owner") === "me";

  const visible = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.month === month ||
            // Unfinished or late work from earlier months stays on the current board.
            (month === planningMonth && r.month < month && (isWithTeam(r.status) || r.flags.overdue)),
        )
        .filter((r) => !onlyStatus || r.status === onlyStatus)
        .filter((r) => !mine || r.owner_id === me.id)
        .filter(
          (r) =>
            !q ||
            r.title.toLowerCase().includes(q) ||
            r.client.name_en.toLowerCase().includes(q) ||
            (r.owner?.full_name.toLowerCase().includes(q) ?? false),
        )
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [rows, month, planningMonth, onlyStatus, mine, me.id, q],
  );

  const columns: Column[] = useMemo(() => {
    if (mode === "status") {
      return STATUSES.filter((s) => !onlyStatus || s === onlyStatus)
        .map((s) => ({
          key: s,
          title: STATUS_META[s].en,
          tone: STATUS_META[s].tone,
          rows: visible.filter((r) => r.status === s),
        }))
        .filter((c) => c.rows.length > 0 || c.key === onlyStatus);
    }
    if (mode === "client") {
      return data.clients
        .map((c) => ({ key: c.id, title: c.name_en, rows: visible.filter((r) => r.client_id === c.id) }))
        .filter((c) => c.rows.length > 0);
    }
    const people = data.team
      .map((m) => {
        const list = visible.filter((r) => r.owner_id === m.id);
        return {
          key: m.id,
          title: m.full_name,
          avatar: m.full_name,
          meta: `${list.reduce((n, r) => n + r.effort_points, 0)} pts`,
          rows: list,
        };
      })
      .filter((c) => c.rows.length > 0);
    const unassigned = visible.filter((r) => !r.owner_id);
    return unassigned.length ? [...people, { key: "none", title: "Unassigned", rows: unassigned }] : people;
  }, [mode, visible, data, onlyStatus]);

  const filters = [
    mine && { key: "owner", label: "Mine" },
    onlyStatus && { key: "status", label: STATUS_META[onlyStatus].en },
    q && { key: "q", label: `“${params.get("q")}”` },
  ].filter(Boolean) as { key: string; label: string }[];

  function clear(key: string) {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    router.replace(next.size ? `/board?${next}` : "/board", { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Board"
        subtitle={`${visible.length} deliverables`}
        actions={
          <div className="flex items-center gap-1 rounded-full bg-raised p-1 shadow-card">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
              className="grid size-8 place-items-center rounded-full text-ink-2"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[88px] text-center text-[13px] font-medium">{formatMonth(month).replace(/ \d+$/, "")}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
              className="grid size-8 place-items-center rounded-full text-ink-2"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "status", label: "Status" },
          { value: "client", label: "Client" },
          { value: "person", label: "Person" },
        ]}
      />

      {filters.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => clear(f.key)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-medium text-primary-ink"
            >
              {f.label}
              <X className="size-3.5" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="no-scrollbar -mx-4 mt-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 md:snap-none">
        {columns.map((col) => (
          <section
            key={col.key}
            className="flex w-[82%] shrink-0 snap-start flex-col rounded-[24px] bg-surface/70 p-2.5 ring-1 ring-line sm:w-[300px]"
          >
            <header className={cn("flex items-center justify-between px-1.5 pt-1 pb-2.5", col.tone && `tone-${col.tone}`)}>
              <span className="flex min-w-0 items-center gap-2">
                {col.tone ? <span className="size-2 rounded-full" style={{ background: "var(--tone)" }} /> : null}
                {col.avatar ? <Avatar name={col.avatar} size={24} /> : null}
                <span className="truncate text-[15px] font-medium">{col.title}</span>
              </span>
              <span className="shrink-0 text-[13px] text-muted">
                {col.meta ? `${col.meta} · ` : ""}
                {col.rows.length}
              </span>
            </header>
            <div className="space-y-2">
              {col.rows.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-faint">Nothing here</p>
              ) : (
                (expanded.has(col.key) ? col.rows : col.rows.slice(0, COLUMN_LIMIT)).map((r) => (
                  <BoardCard key={r.id} row={r} today={today} hideClient={mode === "client"} />
                ))
              )}
              {col.rows.length > COLUMN_LIMIT && !expanded.has(col.key) ? (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => new Set(prev).add(col.key))}
                  className="w-full rounded-[14px] py-2.5 text-[13px] font-medium text-muted hover:text-ink"
                >
                  Show {col.rows.length - COLUMN_LIMIT} more
                </button>
              ) : null}
            </div>
          </section>
        ))}
        {columns.length === 0 ? <p className="w-full py-10 text-center text-[14px] text-muted">No deliverables match.</p> : null}
      </div>
    </>
  );
}
