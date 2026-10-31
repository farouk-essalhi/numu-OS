"use client";

import { useParams } from "next/navigation";
import { ArrowUp, CalendarDays, Check, ExternalLink, Gauge, Pencil, RotateCcw, Send, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Drawer } from "vaul";
import { FlagChips } from "@/components/deliverable-card";
import {
  Avatar,
  Card,
  Chip,
  Empty,
  InsetGroup,
  InsetRow,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui";
import { StatusRuler } from "@/components/visuals";
import { formatHours, formatMonth, formatShort } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import { useNumu, type DeliverablePatch } from "@/lib/store";
import type { DeliverableStatus } from "@/lib/types";
import { canMove, isWithTeam, nextStatus, STATUSES, STATUS_META } from "@/lib/workflow";

function ago(ts: string, now: number): string {
  const h = (now - Date.parse(ts)) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function DeliverablePage() {
  const { id } = useParams<{ id: string }>();
  const { rows, data, role, move, update, comment } = useNumu();
  const row = rows.find((r) => r.id === id);
  const [error, setError] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [nowMs] = useState(() => Date.now());

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
      <>
        <PageHeader title="Deliverable" back />
        <Empty>This deliverable doesn&apos;t exist.</Empty>
      </>
    );
  }

  const next = nextStatus(row.deliverable_type, row.status);
  const project = row.project_id ? data.projects.find((p) => p.id === row.project_id) : null;

  function go(to: DeliverableStatus) {
    const result = move(row!.id, to);
    setError(result.ok ? null : result.reason);
    if (result.ok) setAllOpen(false);
  }

  function patch(p: DeliverablePatch) {
    update(row!.id, p);
    setError(null);
  }

  const inClientReview = row.status === "client_review";
  const nextCheck = next ? canMove(role, row.status, next) : null;

  return (
    <>
      <PageHeader title={row.client.name_en} back />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{row.type.name_en}</Chip>
        {row.platform ? <Chip>{PLATFORM_LABEL[row.platform]}</Chip> : null}
        <Chip>{row.effort_points} pts</Chip>
        {project ? <Chip tone="accent">{project.name_en}</Chip> : null}
        {row.retainer_id && !row.scope_line_id ? <Chip tone="accent">Extra outside scope</Chip> : null}
      </div>
      <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-[-0.02em]">{row.title}</h1>

      <Card className="mt-5 p-5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={row.status} />
          <span className="text-[13px] text-muted">{row.statusSince ? `since ${ago(row.statusSince, nowMs)}` : ""}</span>
        </div>
        <StatusRuler status={row.status} className="mt-4" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <FlagChips row={row} />
        </div>

        <div className="mt-4 flex gap-2.5">
          {inClientReview && role !== "creator" ? (
            <>
              <SecondaryButton className="flex-1 px-3" onClick={() => go("editing")}>
                <RotateCcw className="size-4" /> Changes
              </SecondaryButton>
              <PrimaryButton className="flex-1 px-3" onClick={() => go("approved")}>
                <Check className="size-4" /> Approved
              </PrimaryButton>
            </>
          ) : next && nextCheck?.ok ? (
            <>
              <SecondaryButton className="px-4" onClick={() => setAllOpen(true)}>
                More
              </SecondaryButton>
              <PrimaryButton className="flex-1" onClick={() => go(next)}>
                <ArrowUp className="size-4 rotate-90" /> {STATUS_META[next].en}
              </PrimaryButton>
            </>
          ) : (
            <SecondaryButton className="flex-1" onClick={() => setAllOpen(true)}>
              {next && nextCheck && !nextCheck.ok ? nextCheck.reason : "Change status"}
            </SecondaryButton>
          )}
        </div>
        {error ? <p className="mt-3 text-[14px] text-danger">{error}</p> : null}
      </Card>

      <SectionHeader title="Details" />
      <InsetGroup className="bg-surface shadow-card">
        <EditableRow icon={<UserRound />} label="Owner" value={row.owner ? (
          <span className="flex items-center gap-2"><Avatar name={row.owner.full_name} size={24} />{row.owner.full_name}</span>
        ) : "Unassigned"}>
          <select aria-label="Owner" value={row.owner_id ?? ""} onChange={(e) => patch({ owner_id: e.target.value || null })}>
            <option value="">Unassigned</option>
            {data.team.filter((m) => m.is_active).map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </EditableRow>
        <EditableRow icon={<CalendarDays />} label="Due for review" value={<span className={row.flags.overdue && isWithTeam(row.status) ? "text-danger" : ""}>{formatShort(row.due_date)}</span>}>
          <input type="date" aria-label="Due date" value={row.due_date} onChange={(e) => e.target.value && patch({ due_date: e.target.value })} />
        </EditableRow>
        <EditableRow icon={<Send />} label="Post date" value={row.post_date ? formatShort(row.post_date) : <span className="text-muted">Not set</span>}>
          <input type="date" aria-label="Post date" value={row.post_date ?? ""} onChange={(e) => patch({ post_date: e.target.value || null })} />
        </EditableRow>
        <InsetRow icon={<Gauge />} label="Counts against">{formatMonth(row.month)}</InsetRow>
        <InsetRow icon={<RotateCcw />} label="Client revisions">{row.revision_count}</InsetRow>
      </InsetGroup>

      <SectionHeader title="Links" />
      <Card className="divide-y divide-line px-4">
        <LinkRow label="Script" url={row.script_url} onSave={(v) => patch({ script_url: v })} />
        <LinkRow label="Raw footage" url={row.raw_url} onSave={(v) => patch({ raw_url: v })} />
        <LinkRow label="Final file" url={row.final_url} onSave={(v) => patch({ final_url: v })} />
        <LinkRow label="Live post" url={row.post_url} onSave={(v) => patch({ post_url: v })} />
      </Card>

      <SectionHeader title="Comments" />
      <div className="space-y-3">
        {comments.length === 0 ? <Empty>No comments yet. Internal only: clients never see these.</Empty> : null}
        {comments.map((c) => {
          const author = c.author_team_member_id ? team.get(c.author_team_member_id) : null;
          return (
            <div key={c.id} className="flex gap-3">
              <Avatar name={author?.full_name ?? "Client"} size={32} />
              <div className="min-w-0 flex-1 rounded-[18px] rounded-tl-[6px] bg-surface px-4 py-3 shadow-card">
                <p className="text-[13px] text-muted">
                  <span className="font-medium text-ink">{author?.full_name ?? "Client"}</span> · {ago(c.created_at, nowMs)}
                </p>
                <p className="mt-1 text-[15px] leading-snug whitespace-pre-wrap">{c.body}</p>
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
          className="flex items-center gap-2 rounded-full bg-raised py-1.5 pr-1.5 pl-4 shadow-card"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an internal comment…"
            aria-label="Comment"
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim()}
            className="pill-primary grid size-9 place-items-center rounded-full disabled:opacity-30"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
      </div>

      <SectionHeader title="History" />
      <Card className="px-4 py-2">
        <ol className="relative">
          {history.map((e, i) => {
            const who = e.changed_by_team_member_id ? team.get(e.changed_by_team_member_id)?.full_name : null;
            return (
              <li key={e.id} className={cn("relative flex gap-3 py-2.5", `tone-${STATUS_META[e.to_status].tone}`)}>
                <span className="relative mt-1.5 flex flex-col items-center">
                  <span className="size-2.5 rounded-full" style={{ background: "var(--tone)" }} />
                  {i < history.length - 1 ? <span className="absolute top-3.5 h-[calc(100%+4px)] w-px bg-line" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px]">
                    {e.from_status ? (
                      <>
                        <span className="text-muted">{STATUS_META[e.from_status].en} →</span> {STATUS_META[e.to_status].en}
                      </>
                    ) : (
                      "Created"
                    )}
                    {e.from_status === "client_review" && e.to_status !== "approved" ? (
                      <span className="text-accent"> · revision</span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-muted">
                    {who ?? "System"} · {formatShort(e.changed_at.slice(0, 10))} · {ago(e.changed_at, nowMs)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Drawer.Root open={allOpen} onOpenChange={setAllOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] rounded-t-[32px] bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] outline-none">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-faint/60" />
            <Drawer.Title className="mt-4 text-[20px] font-semibold">Move to</Drawer.Title>
            <Drawer.Description className="mt-1 text-[14px] text-muted">
              Every move is recorded. Client review back to an earlier step counts as a revision.
            </Drawer.Description>
            <div className="mt-4 divide-y divide-line overflow-hidden rounded-[20px] bg-inset">
              {STATUSES.map((s) => {
                const check = canMove(role, row.status, s);
                const current = s === row.status;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!check.ok}
                    onClick={() => go(s)}
                    className={cn(
                      `tone-${STATUS_META[s].tone} flex w-full items-center justify-between gap-3 px-4 py-3 text-left`,
                      !check.ok && "cursor-not-allowed",
                    )}
                  >
                    <span className={cn("flex items-center gap-2.5 text-[15px]", !check.ok && !current && "text-faint")}>
                      <span className="size-2 rounded-full" style={{ background: "var(--tone)" }} />
                      {STATUS_META[s].en}
                    </span>
                    <span className="text-[12px] text-muted">{current ? "Now" : !check.ok ? check.reason : ""}</span>
                  </button>
                );
              })}
            </div>
            {error ? <p className="mt-3 text-[14px] text-danger">{error}</p> : null}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <p className="mt-6 text-center text-[12px] text-muted">
        {row.post_url ? (
          <Link href={row.post_url} target="_blank" rel="noreferrer" className="underline">
            Open live post
          </Link>
        ) : (
          `Due ${formatShort(row.due_date)}${row.flags.waitingHours ? ` · ${formatHours(row.flags.waitingHours)} with client` : ""}`
        )}
      </p>
    </>
  );
}

function EditableRow({
  icon,
  label,
  value,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  children: ReactElement;
}) {
  return (
    <div className="relative">
      <InsetRow icon={icon} label={label} chevron>
        <span className="truncate">{value}</span>
      </InsetRow>
      <div className="absolute inset-0 opacity-0 [&>*]:h-full [&>*]:w-full [&>*]:cursor-pointer">{children}</div>
    </div>
  );
}

function LinkRow({ label, url, onSave }: { label: string; url: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  if (editing) {
    return (
      <form
        className="flex items-center gap-2 py-2.5"
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
          className="h-10 min-w-0 flex-1 rounded-full bg-inset px-4 text-[14px] outline-none"
        />
        <button type="submit" className="pill-primary h-10 rounded-full px-4 text-[14px] font-medium">
          Save
        </button>
      </form>
    );
  }
  let host = "";
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = url ?? "";
  }
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-[15px]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-[14px] text-ink-2">
            <span className="truncate">{host}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted" />
          </a>
        ) : (
          <span className="text-[14px] text-muted">None</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
          className="grid size-8 place-items-center rounded-full bg-inset text-ink-2"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
