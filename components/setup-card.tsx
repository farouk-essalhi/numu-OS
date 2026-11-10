"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { formatMonth } from "@/lib/dates";
import { cn } from "@/lib/format";
import { openNewTask } from "@/lib/new-task";
import { useNumu } from "@/lib/store";
import { Card, CardHeader } from "./ui";

/**
 * Overview, while NUMU OS is still being filled in: the three things that
 * get a month of work onto the board. Goes away once all three are done.
 * Partners and account leads only (creators don't see retainers).
 */
export function SetupCard() {
  const { data, rows, role, me, thisMonth } = useNumu();
  if (role === "creator") return null;

  const clients = data.clients.filter((c) => c.status === "active");
  const withScope = clients.filter((c) =>
    data.retainers.some((r) => r.client_id === c.id && r.status === "active" && data.scopeLines.some((s) => s.retainer_id === r.id)),
  );
  const thisMonthWork = rows.filter((r) => r.month === thisMonth).length;

  const steps = [
    {
      done: clients.length > 0,
      title: clients.length ? `${clients.length} ${clients.length === 1 ? "client" : "clients"} added` : "Add your clients",
      detail: clients.length ? "Add the rest as you go." : "Each active client, with who leads the account.",
      href: "/clients",
      action: clients.length ? "Clients" : "Add a client",
    },
    {
      done: clients.length > 0 && withScope.length === clients.length,
      title: `Retainer and monthly scope: ${withScope.length} of ${clients.length} ${clients.length === 1 ? "client" : "clients"}`,
      detail: "What each client buys a month (6 reels, 8 posts, 1 report). The month's work is made from it.",
      href: "/clients",
      action: "Open a client",
    },
    {
      done: thisMonthWork > 0,
      title: thisMonthWork ? `${thisMonthWork} tasks in ${formatMonth(thisMonth)}` : `Put ${formatMonth(thisMonth)} on the board`,
      detail: 'Open a client and press "Generate", or add single tasks with New task.',
      href: "/clients",
      action: "Generate from scope",
    },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <Card className="mb-4">
      <CardHeader
        title="Getting NUMU OS ready"
        subtitle={`${steps.filter((s) => s.done).length} of ${steps.length} done. This card goes away when the month is on the board.`}
      />
      <ol className="divide-y divide-line border-t border-line">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-[12px] font-semibold num",
                s.done ? "border-[var(--good)] bg-[var(--good)] text-white" : i === next ? "border-ink text-ink" : "border-line-strong text-muted",
              )}
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[13.5px] font-medium", s.done && "text-muted")}>{s.title}</span>
              {s.done ? null : <span className="block text-[12.5px] text-muted">{s.detail}</span>}
            </span>
            {i === next ? (
              <span className="flex shrink-0 items-center gap-2">
                {i === 2 && me.can_create_tasks ? (
                  <button type="button" onClick={() => openNewTask()} className="hidden h-9 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3 sm:block md:h-8">
                    New task
                  </button>
                ) : null}
                <Link
                  href={s.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-ink shadow-sm hover:opacity-90 md:h-8"
                >
                  {s.action}
                  <ArrowRight className="size-4" />
                </Link>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
