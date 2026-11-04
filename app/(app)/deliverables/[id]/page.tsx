"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, Check, ChevronRight, ExternalLink, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { FlagPills, StatusStepper } from "@/components/deliverables";
import { Avatar, Button, Card, CardHeader, Empty, Pill, StatusPill } from "@/components/ui";
import { formatMonth, formatShort, qatarDate, timeAgo } from "@/lib/dates";
import { cn, firstName, PLATFORM_LABEL } from "@/lib/format";
import { useNumu, type DeliverablePatch } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import { canMove, nextStatus, STATUSES, STATUS_META } from "@/lib/workflow";

export default function DeliverablePage() {
  const { id } = useParams<{ id: string }>();
  const { rows, data, role, today, now, move, update, comment } = useNumu();
  const row = rows.find((r) => r.id === id);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [nowMs] = useState(() => now.getTime());

  const history = useMemo(
    () => data.statusEvents.filter((e) => e.deliverable_id === id).sort((a, b) => b.changed_at.localeCompare(a.changed_at)),
    [data.statusEvents, id],
  );
  const comments = useMemo(
    () => data.comments.filter((c) => c.deliverable_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [data.comments, id],
  );
  const team = new Map(data.team.map((m) => [m.id, m]));

  if (!row) {
    return (
      <Card>
        <Empty>
          This task doesn&apos;t exist.{" "}
          <Link href="/deliverables" className="font-medium text-ink underline">
            Back to tasks
          </Link>
        </Empty>
      </Card>
    );
  }

  const next = nextStatus(row.deliverable_type, row.status);
  const nextOk = next ? canMove(role, row.status, next, row.deliverable_type) : null;
  const project = row.project_id ? data.projects.find((p) => p.id === row.project_id) : null;
  const isTask = !row.type.is_content;

  function go(to: DeliverableStatus) {
    const res = move(row!.id, to);
    setError(res.ok ? null : res.reason);
  }
  function patch(p: DeliverablePatch) {
    update(row!.id, p);
    setError(null);
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[12.5px] text-muted">
        <Link href="/deliverables" className="hover:text-ink">
          Tasks
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/clients/${row.client_id}`} className="truncate hover:text-ink">
          {row.client.name_en}
        </Link>
      </nav>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[24px]">{row.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={row.status} />
            <Pill>{row.type.name_en}</Pill>
            {row.platform ? <Pill>{PLATFORM_LABEL[row.platform]}</Pill> : null}
            {project ? <Pill tone="info">{project.name_en}</Pill> : null}
            {row.type.is_content && row.retainer_id && !row.scope_line_id ? <Pill tone="info">Extra outside scope</Pill> : null}
            {!row.type.is_content && row.scope_line_id ? <Pill>Repeats monthly</Pill> : null}
            <FlagPills row={row} today={today} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
{isTask ? null : (
          <label className="relative">
            <span className="sr-only">Move to</span>
            <select
              value=""
              onChange={(e) => e.target.value && go(e.target.value as DeliverableStatus)}
              className="h-9 cursor-pointer appearance-none rounded-lg border border-line bg-surface pr-8 pl-3 text-[13px] font-medium shadow-sm hover:bg-surface-2"
            >
              <option value="">Move to…</option>
              {STATUSES.filter((s) => s !== row.status).map((s) => {
                const c = canMove(role, row.status, s, row.deliverable_type);
                return (
                  <option key={s} value={s} disabled={!c.ok}>
                    {STATUS_META[s].en}
                    {!c.ok ? ` (${c.reason.toLowerCase()})` : ""}
                  </option>
                );
              })}
            </select>
            <ChevronRight className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 rotate-90 text-muted" />
          </label>
          )}
          {row.status === "client_review" && role !== "creator" ? (
            <>
              <Button onClick={() => go("editing")} title="Client asked for changes (counts a revision)">
                <RotateCcw /> Changes requested
              </Button>
              <Button variant="primary" onClick={() => go("approved")}>
                <Check /> Client approved
              </Button>
            </>
          ) : next && nextOk?.ok ? (
            <Button variant="primary" onClick={() => go(next)}>
              {next === "done" ? (
                <>
                  <Check /> Mark done
                </>
              ) : (
                <>
                  {STATUS_META[next].en} <ArrowRight />
                </>
              )}
            </Button>
          ) : isTask && row.status === "done" ? (
            <Button onClick={() => go("planned")}>
              <RotateCcw /> Reopen
            </Button>
          ) : null}
          {role !== "creator" ? <DeleteButton id={row.id} /> : null}
        </div>
      </div>

      {error ? <p className="-mt-2 mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-critical">{error}</p> : null}

      <Card className="mb-4 px-4 py-3 sm:px-5">
        <StatusStepper status={row.status} type={row.deliverable_type} />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={isTask ? "Link" : "Files and links"} subtitle="Google Drive stays the file store; NUMU OS keeps the links." />
            <ul className="divide-y divide-line border-t border-line">
              {isTask ? (
                <LinkRow label={row.deliverable_type === "report" ? "Report" : row.deliverable_type === "content_calendar" ? "Calendar" : "Link"} url={row.final_url} onSave={(v) => patch({ final_url: v })} />
              ) : (
                <>
                  <LinkRow label="Script" url={row.script_url} onSave={(v) => patch({ script_url: v })} />
                  <LinkRow label="Raw footage" url={row.raw_url} onSave={(v) => patch({ raw_url: v })} />
                  <LinkRow label="Final file" url={row.final_url} onSave={(v) => patch({ final_url: v })} />
                  <LinkRow label="Live post" url={row.post_url} onSave={(v) => patch({ post_url: v })} />
                </>
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Comments" subtitle="Internal. Clients never see these." action={<Pill>{comments.length}</Pill>} />
            <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
              {comments.length === 0 ? <p className="text-[13px] text-muted">No comments yet.</p> : null}
              {comments.map((c) => {
                const author = c.author_team_member_id ? team.get(c.author_team_member_id) : null;
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={author?.full_name ?? "Client"} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-muted">
                        <span className="font-medium text-ink">{author?.full_name ?? "Client"}</span> · {timeAgo(c.created_at, nowMs)}
                      </p>
                      <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{c.body}</p>
                    </div>
                  </div>
                );
              })}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  comment(row.id, draft);
                  setDraft("");
                }}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pr-1.5 pl-3 focus-within:border-focus"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a comment…"
                  aria-label="Comment"
                  className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted"
                />
                <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()} aria-label="Send">
                  <ArrowUp />
                </Button>
              </form>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-line border-t border-line text-[13px]">
              <Prop label="Owner">
                <span className="relative inline-flex items-center gap-2">
                  {row.owner ? <Avatar name={row.owner.full_name} size={22} /> : null}
                  <span className="font-medium">{row.owner ? row.owner.full_name : "Unassigned"}</span>
                  <Pencil className="size-3 text-faint" />
                  <select
                    aria-label="Owner"
                    value={row.owner_id ?? ""}
                    onChange={(e) => patch({ owner_id: e.target.value || null })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="">Unassigned</option>
                    {data.team.filter((m) => m.is_active).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </span>
              </Prop>
              <Prop label="Client">
                <Link href={`/clients/${row.client_id}`} className="font-medium hover:underline">
                  {row.client.name_en}
                </Link>
              </Prop>
              <Prop label={isTask ? "Part of" : "Counts against"}>
                {project ? project.name_en : row.retainer_id ? (isTask ? "Monthly scope" : `${formatMonth(row.month)} retainer`) : "Just the client"}
              </Prop>
              <Prop label={isTask ? "Due" : "Due for review"}>
                <DateEdit value={row.due_date} onChange={(v) => v && patch({ due_date: v })} danger={row.flags.overdue} />
              </Prop>
              {isTask ? null : (
                <Prop label="Goes live">
                  <DateEdit value={row.post_date} onChange={(v) => patch({ post_date: v || null })} />
                </Prop>
              )}
              <Prop label="Effort">{row.effort_points} points</Prop>
              {isTask ? null : <Prop label="Client revisions">{row.revision_count}</Prop>}
              {row.posted_at ? <Prop label="Posted">{formatShort(qatarDate(row.posted_at))}</Prop> : null}
            </dl>
          </Card>

          <Card>
            <CardHeader title="History" subtitle="Every status change is recorded" />
            <ol className="border-t border-line px-4 py-3 sm:px-5">
              {history.map((e, i) => {
                const who = e.changed_by_team_member_id ? team.get(e.changed_by_team_member_id)?.full_name : null;
                const revision = e.from_status === "client_review" && e.to_status !== "approved";
                return (
                  <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                    {i < history.length - 1 ? <span className="absolute top-3 left-[4.5px] h-full w-px bg-line" /> : null}
                    <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-surface" style={{ background: STATUS_META[e.to_status].color }} />
                    <div className="min-w-0 text-[12.5px]">
                      <p className="text-ink">
                        {e.from_status ? (
                          <>
                            <span className="text-muted">{STATUS_META[e.from_status].en} →</span> {STATUS_META[e.to_status].en}
                          </>
                        ) : (
                          "Created"
                        )}
                        {revision ? <span className="font-medium text-warning"> · revision</span> : null}
                      </p>
                      <p className="text-muted">
                        {who ? firstName(who) : "System"} · {timeAgo(e.changed_at, nowMs)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 sm:px-5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function DateEdit({ value, onChange, danger }: { value: string | null; onChange: (v: string) => void; danger?: boolean }) {
  return (
    <span className={cn("relative inline-flex items-center gap-1.5 font-medium num", danger && "text-critical")}>
      {value ? formatShort(value) : <span className="font-normal text-muted">Not set</span>}
      <Pencil className="size-3 text-faint" />
      <input type="date" aria-label="Change date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </span>
  );
}

function LinkRow({ label, url, onSave }: { label: string; url: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  let host = "";
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = url ?? "";
  }
  return (
    <li className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
      <span className="w-28 shrink-0 text-[13px] text-muted">{label}</span>
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(value.trim() || null);
            setEditing(false);
          }}
        >
          <input
            autoFocus
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://drive.google.com/…"
            aria-label={label}
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-focus"
          />
          <Button size="sm" type="submit" variant="primary">
            Save
          </Button>
        </form>
      ) : (
        <>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium hover:underline">
              <span className="truncate">{host}</span>
              <ExternalLink className="size-3.5 shrink-0 text-muted" />
            </a>
          ) : (
            <span className="flex-1 text-[13px] text-faint">Not added</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {url ? "Edit" : "Add"}
          </Button>
        </>
      )}
    </li>
  );
}

/** Leads and partners can delete planned work they don't need (e.g. trimming a generated month). Asks twice. */
function DeleteButton({ id }: { id: string }) {
  const { remove, notify } = useNumu();
  const router = useRouter();
  const [sure, setSure] = useState(false);
  return (
    <Button
      variant="ghost"
      className={sure ? "text-critical hover:text-critical" : "text-muted"}
      title="Delete"
      aria-label={sure ? "Confirm delete" : "Delete"}
      onClick={async () => {
        if (!sure) return setSure(true);
        const r = await remove("deliverables", id);
        if (!r.ok) return notify(r.reason, "error");
        notify("Deleted", "success");
        router.push("/deliverables");
      }}
      onBlur={() => setSure(false)}
    >
      <Trash2 /> {sure ? "Sure? Delete" : ""}
    </Button>
  );
}
