"use client";

import Link from "next/link";
import { ListTree, TriangleAlert } from "lucide-react";
import { formatRelative } from "@/lib/dates";
import { firstName } from "@/lib/format";
import type { BoardRow } from "@/lib/selectors";
import { isDone } from "@/lib/workflow";
import { Avatar, Card, CardHeader, Pill } from "./ui";
import { taskHref } from "@/lib/routes";

/**
 * Overview: every task that has subtasks and isn't finished, with how far
 * along it is, what's late and who still has steps. The partners' check on
 * bigger jobs (a website build, a launch) without opening each one.
 */
export function BigTasksCard({ rows, today }: { rows: BoardRow[]; today: string }) {
  const big = rows
    .filter((r) => r.progress.total > 0 && !isDone(r.status))
    .sort((a, b) => b.progress.late - a.progress.late || a.due_date.localeCompare(b.due_date));
  if (big.length === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader
        icon={<ListTree />}
        title="Bigger jobs"
        subtitle="Tasks broken into subtasks: how far along each is, and who's on it"
        action={<span className="text-[12.5px] text-muted num">{big.length}</span>}
      />
      <ul className="divide-y divide-line border-t border-line">
        {big.slice(0, 6).map((r) => {
          const { done, total, late } = r.progress;
          const open = new Map<string, number>();
          for (const s of r.subtasks) if (!isDone(s.status) && s.owner) open.set(s.owner.full_name, (open.get(s.owner.full_name) ?? 0) + 1);
          const next = r.subtasks.find((s) => !isDone(s.status));
          return (
            <li key={r.id}>
              <Link
                href={taskHref(r.id)}
                className="grid gap-x-5 gap-y-2 px-4 py-3.5 hover:bg-surface-2 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{r.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {r.client.name_en} · due {formatRelative(r.due_date, today).toLowerCase()}
                    {next ? ` · next: ${next.title}${next.owner ? ` (${firstName(next.owner.full_name)})` : ""}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2.5">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(done / total) * 100}%`, background: late ? "var(--serious)" : "var(--good)" }}
                    />
                  </span>
                  <span className="w-12 text-right text-[12.5px] font-medium num">
                    {done}/{total}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {late ? (
                    <Pill tone="critical" icon={<TriangleAlert />}>
                      {late} late
                    </Pill>
                  ) : null}
                  <span className="flex -space-x-1.5">
                    {[...open.keys()].slice(0, 5).map((n) => (
                      <span key={n} title={`${n}: ${open.get(n)} open`}>
                        <Avatar name={n} size={24} />
                      </span>
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
