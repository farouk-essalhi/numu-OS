"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { DeliverableStatus } from "@/lib/types";
import { DotNumber, StatusRuler } from "./visuals";

export interface HeroCardSpec {
  key: string;
  glow: "orange" | "lavender" | "green";
  chipIcon: ReactNode;
  chip: string;
  big: string;
  title: string;
  subtitle: string;
  href: string;
  status?: DeliverableStatus;
}

/** Swipeable focus cards with page dots (screenshot 1's top carousel). */
export function HeroCarousel({ cards }: { cards: HeroCardSpec[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const width = el.firstElementChild?.getBoundingClientRect().width ?? el.clientWidth;
    setActive(Math.round(el.scrollLeft / (width + 12)));
  }

  if (cards.length === 0) return null;

  return (
    <div className="-mx-4">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2"
      >
        {cards.map((c, i) => (
          <article
            key={c.key}
            className={cn(
              "relative w-[86%] shrink-0 snap-center overflow-hidden rounded-[30px] p-5 shadow-card ring-1 ring-white/40 transition-transform duration-300 dark:ring-white/5 sm:w-[360px]",
              c.glow === "orange" ? "hero-glow" : c.glow === "lavender" ? "hero-glow-lavender" : "hero-glow-green",
              i !== active && "scale-[0.97] opacity-90",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-raised/70 px-3 text-[13px] font-medium text-ink-2 ring-1 ring-white/50 backdrop-blur [&>svg]:size-3.5">
                {c.chipIcon}
                {c.chip}
              </span>
              <Link
                href={c.href}
                aria-label={`Open: ${c.title}`}
                className="grid size-9 place-items-center rounded-full bg-primary text-primary-ink shadow-float"
              >
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <Link href={c.href} className="block">
              <div className="mt-5 text-center">
                <DotNumber className="text-[54px]">{c.big}</DotNumber>
              </div>
              <p className="mt-5 truncate text-[20px] font-medium tracking-[-0.01em]">{c.title}</p>
              <p className="mt-0.5 truncate text-[14px] text-muted">{c.subtitle}</p>
            </Link>
            {c.status ? <StatusRuler status={c.status} className="mt-4" /> : <div className="h-4" />}
          </article>
        ))}
      </div>
      {cards.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {cards.map((c, i) => (
            <span
              key={c.key}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-ink" : "w-1.5 bg-faint")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
