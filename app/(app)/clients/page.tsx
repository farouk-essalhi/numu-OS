"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Edit } from "@/components/entity-forms";
import { EditSheet } from "@/components/lazy";
import { Avatar, Button, Card, Empty, PageHeader, Pill, Progress, TONE_ICON } from "@/components/ui";
import { formatMonth, formatRelative } from "@/lib/dates";
import { firstName, formatMoney, percent } from "@/lib/format";
import { clientSummaries, HEALTH_META, type Health } from "@/lib/insights";
import { useNumu } from "@/lib/store";
import { clientHref } from "@/lib/routes";

export default function ClientsPage() {
  const { rows, data, role, today, thisMonth } = useNumu();
  const router = useRouter();
  const [q, setQ] = useState("");
  const seesFees = role !== "creator";
  const all = useMemo(() => clientSummaries(rows, data, thisMonth, today), [rows, data, thisMonth, today]);
  const list = all.filter((c) => !q || c.client.name_en.toLowerCase().includes(q.toLowerCase()) || (c.client.name_ar ?? "").includes(q));
  const counts = (h: Health) => all.filter((c) => c.health === h).length;
  const [edit, setEdit] = useState<Edit | null>(null);
  const active = data.clients.filter((c) => c.status === "active").length;

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${active} active ${active === 1 ? "client" : "clients"} · ${formatMonth(thisMonth)}`}
        actions={
          <>
          <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 shadow-sm sm:w-[240px]">
            <Search className="size-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients"
              aria-label="Search clients"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
            />
          </label>
          {seesFees ? (
            <Button variant="primary" onClick={() => setEdit({ kind: "client" })}>
              <Plus /> New client
            </Button>
          ) : null}
          </>
        }
      />
      <EditSheet edit={edit} onClose={() => setEdit(null)} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {(["on_track", "at_risk", "behind"] as Health[]).map((h) => (
          <div key={h} className="rounded-xl border border-line bg-surface p-3 shadow-sm sm:p-4">
            <Pill tone={HEALTH_META[h].tone} icon={TONE_ICON[HEALTH_META[h].tone]}>
              {HEALTH_META[h].label}
            </Pill>
            <p className="mt-2 text-[24px] leading-none font-semibold num">{counts(h)}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        {all.length === 0 ? (
          <Empty className="py-14">
            <span className="block text-[15px] font-medium text-ink">No clients yet</span>
            <span className="mt-1 block">
              {seesFees ? "Add your first client, then their retainer and what it buys each month." : "Partners and account leads add clients."}
            </span>
            {seesFees ? (
              <Button variant="primary" className="mt-4" onClick={() => setEdit({ kind: "client" })}>
                <Plus /> Add a client
              </Button>
            ) : null}
          </Empty>
        ) : null}
        {list.length === 0 && all.length > 0 ? <Empty>No client matches “{q}”.</Empty> : null}
        <div className={all.length ? "scroll-thin relative hidden overflow-x-auto md:block" : "hidden"}>
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-left text-[12px] text-muted">
              <tr>
                <th className="py-2.5 pr-3 pl-5 font-medium">Client</th>
                <th className="px-3 font-medium">Lead</th>
                {seesFees ? <th className="px-3 text-right font-medium">Retainer</th> : null}
                <th className="px-3 font-medium">This month</th>
                <th className="px-3 text-right font-medium">With client</th>
                <th className="px-3 text-right font-medium">Late</th>
                <th className="px-3 font-medium">Next due</th>
                <th className="py-2.5 pr-5 pl-3 font-medium">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => (
                <tr key={c.client.id} onClick={() => router.push(clientHref(c.client.id))} className="cursor-pointer hover:bg-surface-2">
                  <td className="py-3 pr-3 pl-5">
                    <span className="flex items-center gap-3">
                      <Avatar name={c.client.name_en} size={32} square />
                      <span className="min-w-0">
                        <Link href={clientHref(c.client.id)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                          {c.client.name_en}
                          {c.client.status !== "active" ? <span className="ml-2 text-[11.5px] font-normal text-muted capitalize">{c.client.status}</span> : null}
                        </Link>
                        <span lang="ar" dir="rtl" className="block truncate text-left text-[12px] text-muted">
                          {c.client.name_ar}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 text-ink-2">
                    {c.lead ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={c.lead.full_name} size={22} />
                        {firstName(c.lead.full_name)}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  {seesFees ? <td className="px-3 text-right font-medium num">{c.feeMinor != null ? formatMoney(c.feeMinor, c.currency) : "–"}</td> : null}
                  <td className="w-[200px] px-3">
                    <span className="flex items-center gap-2.5">
                      <Progress value={percent(c.done, c.total)} className="flex-1" />
                      <span className="w-12 text-right text-[12px] text-muted num">
                        {c.done}/{c.total}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 text-right num">{c.waiting || <span className="text-faint">0</span>}</td>
                  <td className="px-3 text-right num">{c.overdue ? <span className="font-medium text-critical">{c.overdue}</span> : <span className="text-faint">0</span>}</td>
                  <td className="px-3 text-ink-2">{c.nextDue ? formatRelative(c.nextDue.due_date, today) : "–"}</td>
                  <td className="py-3 pr-5 pl-3">
                    <Pill tone={HEALTH_META[c.health].tone} icon={TONE_ICON[HEALTH_META[c.health].tone]}>
                      {HEALTH_META[c.health].label}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line md:hidden">
          {list.map((c) => (
            <li key={c.client.id}>
              <Link href={clientHref(c.client.id)} className="block px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={c.client.name_en} size={36} square />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{c.client.name_en}</p>
                    <p className="truncate text-[12px] text-muted">
                      {c.lead ? `Led by ${firstName(c.lead.full_name)}` : "No lead"}
                      {seesFees && c.feeMinor != null ? ` · ${formatMoney(c.feeMinor, c.currency)}` : ""}
                    </p>
                  </div>
                  <Pill tone={HEALTH_META[c.health].tone} icon={TONE_ICON[HEALTH_META[c.health].tone]}>
                    {HEALTH_META[c.health].label}
                  </Pill>
                </div>
                <div className="mt-2.5 flex items-center gap-2.5">
                  <Progress value={percent(c.done, c.total)} className="flex-1" />
                  <span className="text-[12px] text-muted num">
                    {c.done}/{c.total} done{c.waiting ? ` · ${c.waiting} with client` : ""}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
