"use client";

import Link from "next/link";
import { Check, Hourglass, RotateCcw, Send } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar, Button, Card, CardHeader, Empty, PageHeader, Pill } from "@/components/ui";
import { formatHours, formatRelative, timeAgo } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { ledClientIds, type BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import { taskHref } from "@/lib/routes";

export default function ApprovalsPage() {
  const { rows, data, me, role, today, now, move } = useNumu();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nowMs] = useState(() => now.getTime());
  const isLead = role !== "creator";

  const led = useMemo(() => (isLead ? ledClientIds(data, me.id, role) : new Set<string>()), [data, me.id, role, isLead]);
  const signOff = rows
    .filter((r) => r.status === "internal_review" && (isLead ? led.has(r.client_id) : r.owner_id === me.id))
    .sort((a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? ""));
  const withClient = rows
    .filter((r) => r.status === "client_review" && (isLead ? led.has(r.client_id) : r.owner_id === me.id))
    .sort((a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? ""));

  function act(r: BoardRow, to: DeliverableStatus) {
    const res = move(r.id, to);
    setErrors((e) => ({ ...e, [r.id]: res.ok ? "" : res.reason }));
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={
          isLead
            ? me.can_approve
              ? "Send internal reviews to the client, then record their answer."
              : "Send internal reviews to the client and record changes. Approving is for people a partner allows."
            : "Your work in review."
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={isLead ? "Waiting for your sign-off" : "In internal review"}
            subtitle="Internal review → send to the client, or back to editing"
            action={<Pill>{signOff.length}</Pill>}
          />
          {signOff.length === 0 ? (
            <Empty>Nothing waiting for sign-off.</Empty>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {signOff.map((r) => (
                <ApprovalRow
                  key={r.id}
                  r={r}
                  today={today}
                  error={errors[r.id]}
                  actions={
                    isLead ? (
                      <>
                        <span className="mr-1 text-[12px] text-muted">{r.statusSince ? timeAgo(r.statusSince, nowMs) : ""}</span>
                        <Button size="sm" onClick={() => act(r, "editing")}>
                          <RotateCcw /> Back to editing
                        </Button>
                        {me.can_send_to_client ? (
                          <Button size="sm" variant="primary" onClick={() => act(r, "client_review")}>
                            <Send /> Send to client
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-[12px] text-muted">{r.statusSince ? `since ${timeAgo(r.statusSince, nowMs)}` : ""}</span>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="With clients"
            subtitle="Oldest first · flagged after 48 hours"
            action={<Pill tone={withClient.some((r) => r.flags.waitingOnClient) ? "serious" : "neutral"}>{withClient.length}</Pill>}
          />
          {withClient.length === 0 ? (
            <Empty>Nothing with clients right now.</Empty>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {withClient.map((r) => (
                <ApprovalRow
                  key={r.id}
                  r={r}
                  today={today}
                  error={errors[r.id]}
                  actions={
                    <>
                      <Pill tone={r.flags.waitingOnClient ? "serious" : "neutral"} icon={<Hourglass />}>
                        {r.flags.waitingHours != null ? formatHours(r.flags.waitingHours) : "–"}
                      </Pill>
                      {isLead ? (
                        <>
                          {me.can_send_to_client ? (
                            <Button size="sm" onClick={() => act(r, "editing")} title="Client asked for changes (counts a revision)">
                              <RotateCcw /> Changes
                            </Button>
                          ) : null}
                          {me.can_approve ? (
                            <Button size="sm" variant="primary" onClick={() => act(r, "approved")}>
                              <Check /> Approved
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ApprovalRow({ r, actions, today, error }: { r: BoardRow; actions: ReactNode; today: string; error?: string }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 2xl:flex-row 2xl:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {r.owner ? <Avatar name={r.owner.full_name} size={32} /> : null}
        <div className="min-w-0">
          <Link href={taskHref(r.id)} className="line-clamp-2 text-[13.5px] leading-snug font-medium hover:underline">
            {r.title}
          </Link>
          <p className="truncate text-[12px] text-muted">
            {r.client.name_en}
            {r.owner ? ` · ${firstName(r.owner.full_name)}` : ""} · due {formatRelative(r.due_date, today)}
            {r.revision_count > 0 ? ` · ${r.revision_count} revision${r.revision_count > 1 ? "s" : ""}` : ""}
          </p>
          {error ? <p className="mt-1 text-[12px] text-critical">{error}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 2xl:pl-0">{actions}</div>
    </li>
  );
}
