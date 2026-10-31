"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, PageHeader } from "@/components/ui";
import { formatRelative } from "@/lib/dates";
import { cn, firstName } from "@/lib/format";
import { clientMonth, ledClientIds } from "@/lib/selectors";
import { useNumu } from "@/lib/store";

/** Screenshot 6's list layout, used for clients (chat is out of scope). */
export default function ClientsPage() {
  const { rows, data, me, role, today, thisMonth } = useNumu();
  const [q, setQ] = useState("");

  const all = useMemo(
    () =>
      data.clients
        .map((c) => clientMonth(rows, c, thisMonth, today))
        .sort((a, b) => b.overdue + b.waiting - (a.overdue + a.waiting) || a.client.name_en.localeCompare(b.client.name_en)),
    [rows, data.clients, thisMonth, today],
  );
  const led = ledClientIds(data, me.id, role);
  const yours = role === "creator" ? [] : all.filter((c) => led.has(c.client.id));
  const list = all.filter((c) => !q || c.client.name_en.toLowerCase().includes(q.toLowerCase()) || (c.client.name_ar ?? "").includes(q));

  return (
    <>
      <PageHeader title="Clients" back />

      <div className="flex items-center gap-2 rounded-full bg-raised py-1.5 pr-4 pl-4 shadow-card">
        <Search className="size-[18px] text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
      </div>

      {yours.length > 0 ? (
        <>
          <div className="mt-6 mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-semibold">You lead</h2>
            <span className="text-[13px] text-muted">{yours.length}</span>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
            {yours.map((c) => (
              <Link key={c.client.id} href={`/clients/${c.client.id}`} className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                <span className="relative">
                  <Avatar name={c.client.name_en} size={52} />
                  <span
                    className={cn(
                      "absolute right-0 bottom-0 size-3.5 rounded-full ring-2 ring-bg",
                      c.overdue > 0 ? "bg-danger" : c.waiting > 0 ? "bg-accent" : "bg-[var(--tone-green)]",
                    )}
                  />
                </span>
                <span className="w-full truncate text-center text-[12px] text-ink-2">{firstName(c.client.name_en)}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-6 mb-3 flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold">All clients</h2>
        <span className="text-[13px] text-muted">This month</span>
      </div>
      <div className="divide-y divide-line rounded-[26px] bg-surface px-4 shadow-card">
        {list.map((c) => {
          const open = c.rows.filter((r) => r.flags.overdue || r.status === "client_review").length;
          const summary =
            c.overdue > 0
              ? `${c.overdue} late · ${c.done} of ${c.total} done`
              : c.waiting > 0
                ? `${c.waiting} waiting on client · ${c.done} of ${c.total} done`
                : `${c.done} of ${c.total} done this month`;
          return (
            <Link key={c.client.id} href={`/clients/${c.client.id}`} className="flex items-center gap-3 py-3.5">
              <Avatar name={c.client.name_en} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-medium">{c.client.name_en}</p>
                  <span className="shrink-0 text-[12px] text-muted">
                    {c.nextDue ? formatRelative(c.nextDue.due_date, today).replace(/^\w+, /, "") : ""}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] text-muted">{summary}</p>
                  {open > 0 ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-ink">
                      {open}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
        {list.length === 0 ? <p className="py-6 text-center text-[14px] text-muted">No clients match.</p> : null}
      </div>
    </>
  );
}
