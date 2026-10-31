"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, Flame, Hourglass, PenLine, Search, SlidersHorizontal, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskCard } from "@/components/deliverable-card";
import { HeroCarousel, type HeroCardSpec } from "@/components/hero-carousel";
import { Card, Empty, IconButton, ProgressBar, SectionHeader } from "@/components/ui";
import { Heatmap, TypeBars, WeekOrbs } from "@/components/visuals";
import { daysBetween, formatHours, formatShort, greeting, weekdayShort } from "@/lib/dates";
import { firstName, percent } from "@/lib/format";
import { clientMonth, ledClientIds, myWork, pulse } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import { STATUS_META } from "@/lib/workflow";

function dueWords(due: string, today: string): string {
  const d = daysBetween(today, due);
  if (d === 0) return "Today";
  if (d === 1) return "Tmrw";
  if (d < 0) return `${-d}d late`;
  if (d < 7) return weekdayShort(due);
  return `${d} days`;
}

export default function MyWorkPage() {
  const { rows, data, me, role, today, hour, thisMonth } = useNumu();
  const work = useMemo(() => myWork(rows, data, me.id, role, today), [rows, data, me.id, role, today]);
  const month = useMemo(() => pulse(rows, data, "month", today, 12), [rows, data, today]);

  const clientCards = useMemo(() => {
    const led = ledClientIds(data, me.id, role);
    const mine = new Set(rows.filter((r) => r.owner_id === me.id && r.month === thisMonth).map((r) => r.client_id));
    return data.clients
      .filter((c) => (role === "creator" ? mine.has(c.id) : led.has(c.id)))
      .map((c) => clientMonth(rows, c, thisMonth, today))
      .filter((c) => c.total > 0);
  }, [rows, data, me.id, role, thisMonth, today]);

  const heroes: HeroCardSpec[] = [];
  if (work.nextDue) {
    const n = work.nextDue;
    heroes.push({
      key: "next",
      glow: "orange",
      chipIcon: <Clock3 />,
      chip: "Next due",
      big: dueWords(n.due_date, today),
      title: n.title,
      subtitle: `${n.client.name_en} · ${STATUS_META[n.status].en}`,
      href: `/d/${n.id}`,
      status: n.status,
    });
  }
  if (role !== "creator") {
    const first = work.signOff[0];
    heroes.push({
      key: "signoff",
      glow: "lavender",
      chipIcon: <PenLine />,
      chip: "Your sign-off",
      big: String(work.signOff.length),
      title: work.signOff.length === 1 ? "1 waiting for you" : `${work.signOff.length} waiting for you`,
      subtitle: first ? `${first.title} · ${first.client.name_en}` : "Nothing in internal review",
      href: "/board?status=internal_review",
    });
    const longest = work.waitingOnClient[0];
    heroes.push({
      key: "client",
      glow: "green",
      chipIcon: <Hourglass />,
      chip: "With clients",
      big: String(work.waitingOnClient.length),
      title: "Waiting on clients",
      subtitle:
        longest?.flags.waitingHours != null
          ? `Longest ${formatHours(longest.flags.waitingHours)} · ${longest.client.name_en}`
          : "No one is waiting",
      href: "/board?status=client_review",
    });
  }

  const list = [...work.overdue, ...work.thisWeek];
  const delta = month.onTimePct != null && month.prevOnTimePct != null ? month.onTimePct - month.prevOnTimePct : null;

  return (
    <>
      <header className="pt-3 pb-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-muted">{formatShort(today)}</p>
          <div className="flex gap-2">
            <IconButton href="/clients" label="Clients">
              <Users className="size-[18px]" />
            </IconButton>
            <IconButton href="/schedule" label="Schedule">
              <CalendarDays className="size-[18px]" />
            </IconButton>
          </div>
        </div>
        <h1 className="mt-3 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] lowercase">
          {greeting(hour)} <span className="text-muted">{firstName(me.full_name)}</span>
        </h1>
        <p className="mt-1.5 text-[14px] text-muted">
          {work.weekTotal === 0
            ? `Nothing of yours due ${work.weekLabel.toLowerCase()}.`
            : `${work.weekTotal} of yours due ${work.weekLabel.toLowerCase()}, ${work.weekDone} done.`}
        </p>
      </header>

      <SearchBar />

      <div className="mt-5">
        <HeroCarousel cards={heroes} />
      </div>

      <Card className="mt-5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-medium">{work.weekLabel}</h2>
          <span className="inline-flex items-center gap-1 text-[13px] text-muted">
            <Flame className="size-3.5 text-accent" />
            {work.weekDone} of {work.weekTotal} done
          </span>
        </div>
        <WeekOrbs days={work.week} today={today} />
      </Card>

      <Card className="mt-4 flex items-center justify-between gap-4 p-5">
        <div className="shrink-0">
          <p className="text-[16px] leading-snug font-medium">
            See the
            <br />
            team&apos;s pulse
          </p>
          <Link href="/pulse" className="pill-primary mt-3 inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium">
            Check now
          </Link>
        </div>
        <div className="relative">
          <Heatmap cells={month.heat} cell={9} gap={3} />
          {delta != null ? (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-raised px-2.5 py-1 text-[12px] font-medium whitespace-nowrap shadow-card">
              <span className={delta >= 0 ? "text-[var(--tone-green)]" : "text-danger"}>{delta >= 0 ? "▲" : "▼"}</span>{" "}
              {Math.abs(delta)}% on time
            </span>
          ) : null}
        </div>
      </Card>

      {clientCards.length > 0 ? (
        <>
          <SectionHeader title="Clients" href="/clients" />
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {clientCards.map((c) => (
              <Link
                key={c.client.id}
                href={`/clients/${c.client.id}`}
                className="w-[64%] shrink-0 snap-start rounded-[26px] bg-surface p-3 shadow-card sm:w-[260px]"
              >
                <TypeBars bars={c.byType.map((t) => ({ name: t.name, pct: percent(t.done, t.total) }))} />
                <div className="px-1 pt-3">
                  <p className="truncate text-[16px] font-medium">{c.client.name_en}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {c.waiting > 0 ? `${c.waiting} with client · ` : ""}
                    {c.overdue > 0 ? `${c.overdue} late` : `${c.total - c.done} to go`}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <ProgressBar value={percent(c.done, c.total)} className="flex-1" />
                    <span className="text-[12px] text-muted">
                      {c.done}/{c.total}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <SectionHeader title={`My work · ${work.weekLabel.toLowerCase()}`} href="/board?owner=me" />
      {list.length === 0 ? (
        <Empty>Nothing due {work.weekLabel.toLowerCase()}. {work.later.length > 0 ? `${work.later.length} coming up later.` : ""}</Empty>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <TaskCard key={r.id} row={r} today={today} />
          ))}
        </div>
      )}
      {work.later.length > 0 && list.length > 0 ? (
        <Link href="/board?owner=me" className="mt-3 block text-center text-[14px] text-muted">
          {work.later.length} more coming up
        </Link>
      ) : null}
    </>
  );
}

function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/board?q=${encodeURIComponent(q.trim())}` : "/board");
      }}
      className="flex items-center gap-2 rounded-full bg-raised py-1.5 pr-1.5 pl-4 shadow-card"
    >
      <Search className="size-[18px] shrink-0 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search deliverables, clients…"
        aria-label="Search"
        className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
      <Link
        href="/board"
        aria-label="Filters"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-2"
      >
        <SlidersHorizontal className="size-4" />
      </Link>
    </form>
  );
}
