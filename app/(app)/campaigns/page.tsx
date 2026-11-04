"use client";

import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EditSheet, type Edit } from "@/components/entity-forms";
import { Avatar, Button, Card, Empty, IconButton, PageHeader, Pill, Progress } from "@/components/ui";
import { daysBetween, formatShort } from "@/lib/dates";
import { formatMoney, percent } from "@/lib/format";
import { useNumu } from "@/lib/store";
import { isDone } from "@/lib/workflow";

const STATUS_TONE = { planned: "neutral", active: "info", delivered: "good", cancelled: "neutral" } as const;

export default function CampaignsPage() {
  const { rows, data, role, today } = useNumu();
  const [edit, setEdit] = useState<Edit | null>(null);
  const campaigns = useMemo(
    () =>
      data.projects.map((p) => {
        const items = rows.filter((r) => r.project_id === p.id);
        return {
          project: p,
          client: data.clients.find((c) => c.id === p.client_id) ?? { name_en: "Unknown client" },
          total: items.length,
          done: items.filter((r) => isDone(r.status)).length,
          late: items.filter((r) => r.flags.overdue).length,
        };
      }),
    [rows, data],
  );

  if (role === "creator") {
    return (
      <>
        <PageHeader title="Campaigns" />
        <Card>
          <Empty>Campaign fees are visible to partners and account leads. Your campaign work is on the board.</Empty>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="One-off projects: a client, a fixed fee, a deliverable list and a deadline"
        actions={
          <Button variant="primary" onClick={() => setEdit({ kind: "project" })} disabled={data.clients.length === 0} title={data.clients.length ? undefined : "Add a client first"}>
            <Plus /> New campaign
          </Button>
        }
      />
      <EditSheet edit={edit} onClose={() => setEdit(null)} />
      <Card className="overflow-hidden">
        {campaigns.length === 0 ? (
          <Empty>{data.clients.length ? "No campaigns yet. Add one, then add its deliverables and tasks with New task." : "Add a client first, then their campaigns."}</Empty>
        ) : null}
        <ul className="divide-y divide-line">
          {campaigns.map(({ project: p, client, total, done, late }) => {
            const left = p.deadline ? daysBetween(today, p.deadline) : null;
            return (
              <li key={p.id} className="flex items-center pr-2 hover:bg-surface-2 sm:pr-3">
                <Link
                  href={`/deliverables?project=${p.id}`}
                  className="grid min-w-0 flex-1 gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-6"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={client.name_en} size={36} square />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{p.name_en}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {client.name_en}
                        {p.deadline ? ` · deadline ${formatShort(p.deadline)}` : ""}
                        {left != null ? ` (${left >= 0 ? `${left} days left` : `${-left} days over`})` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <Progress value={percent(done, total)} className="flex-1" />
                    <span className="w-24 text-right text-[12px] text-muted num">
                      {done}/{total} done{late ? ` · ${late} late` : ""}
                    </span>
                  </span>
                  <span className="text-[13.5px] font-medium num">{formatMoney(p.fixed_fee_minor, p.currency)}</span>
                  <Pill tone={STATUS_TONE[p.status]} className="capitalize">
                    {p.status}
                  </Pill>
                </Link>
                <IconButton label={`Edit ${p.name_en}`} onClick={() => setEdit({ kind: "project", row: p })}>
                  <Pencil />
                </IconButton>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
