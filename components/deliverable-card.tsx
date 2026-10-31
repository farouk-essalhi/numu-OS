"use client";

import Link from "next/link";
import { Ellipsis, Hourglass, RotateCcw, TriangleAlert } from "lucide-react";
import { formatHours, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/format";
import type { BoardRow } from "@/lib/selectors";
import type { IsoDate } from "@/lib/types";
import { STATUS_META } from "@/lib/workflow";
import { Avatar, Chip } from "./ui";

export function FlagChips({ row }: { row: BoardRow }) {
  return (
    <>
      {row.flags.overdue ? (
        <Chip tone="danger">
          <TriangleAlert className="size-3" /> Late
        </Chip>
      ) : null}
      {row.flags.manyRevisions ? (
        <Chip tone="accent">
          <RotateCcw className="size-3" /> {row.revision_count} revisions
        </Chip>
      ) : null}
      {row.flags.waitingOnClient && row.flags.waitingHours ? (
        <Chip tone="accent">
          <Hourglass className="size-3" /> {formatHours(row.flags.waitingHours)} with client
        </Chip>
      ) : null}
    </>
  );
}

/** "Today's tasks" card from screenshot 2: status bar on the left. */
export function TaskCard({ row, today, showClient = true }: { row: BoardRow; today: IsoDate; showClient?: boolean }) {
  const meta = STATUS_META[row.status];
  return (
    <Link
      href={`/d/${row.id}`}
      className={`tone-${meta.tone} relative block rounded-[22px] bg-surface py-3.5 pr-4 pl-5 shadow-card transition active:scale-[0.99]`}
    >
      <span className="absolute top-4 bottom-4 left-2.5 w-[3px] rounded-full" style={{ background: "var(--tone)" }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-medium">{row.title}</p>
          <p className="mt-0.5 truncate text-[14px] text-muted">
            {meta.en}
            {showClient ? <> · {row.client.name_en}</> : null}
          </p>
        </div>
        <Ellipsis className="mt-1 size-5 shrink-0 text-faint" aria-hidden />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {row.owner ? <Avatar name={row.owner.full_name} size={26} /> : null}
          <FlagChips row={row} />
        </div>
        <span className={cn("shrink-0 text-[13px]", row.flags.overdue ? "font-medium text-danger" : "text-muted")}>
          Due {formatRelative(row.due_date, today)}
        </span>
      </div>
    </Link>
  );
}

/** Compact card for board columns. */
export function BoardCard({ row, today, hideClient }: { row: BoardRow; today: IsoDate; hideClient?: boolean }) {
  const meta = STATUS_META[row.status];
  return (
    <Link
      href={`/d/${row.id}`}
      className={`tone-${meta.tone} block rounded-[18px] bg-raised p-3 shadow-card transition active:scale-[0.99]`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[15px] leading-snug font-medium">{row.title}</p>
        {row.owner ? <Avatar name={row.owner.full_name} size={24} /> : null}
      </div>
      <p className="mt-1 truncate text-[13px] text-muted">
        {hideClient ? meta.en : row.client.name_en}
        {row.project_id ? " · Campaign" : row.retainer_id && !row.scope_line_id ? " · Extra" : ""}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={cn("text-[12px]", row.flags.overdue ? "font-medium text-danger" : "text-muted")}>
          {formatRelative(row.due_date, today)}
        </span>
        <FlagChips row={row} />
      </div>
    </Link>
  );
}
