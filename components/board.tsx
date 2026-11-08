"use client";

// The board. Cards can be dragged between columns: by status (moves the work
// along) or by person (reassigns it). Mouse drags start after a small move;
// on phones a short press-and-hold picks a card up, so swiping still scrolls.
//
// While dragging, a floating copy of the card follows the pointer on a spring
// and is pulled, like a magnet, into the slot where it will land (the slot
// sits where the card will really be, ordered by due date). Columns the card
// can't go to say why. Dropping springs the card into place and the column
// confirms with a pulse; an illegal drop flies back. Position updates run in
// requestAnimationFrame on the DOM, so React only renders when the target
// column changes.

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Lock, UserRound } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { formatRelative } from "@/lib/dates";
import { cn, PLATFORM_LABEL } from "@/lib/format";
import type { BoardRow } from "@/lib/selectors";
import { useNumu } from "@/lib/store";
import type { IsoDate } from "@/lib/types";
import { flowFor, STATUS_META, statusIndex } from "@/lib/workflow";
import { FlagPills, type Selection } from "./deliverables";
import { Avatar, Empty } from "./ui";

export interface BoardColumn {
  key: string;
  title: string;
  color?: string;
  avatar?: string;
  rows: BoardRow[];
}

export type DropCheck = { ok: true } | { ok: false; reason: string };

const COLUMN_LIMIT = 10;
const MAGNET_RADIUS = 260; // px from the slot where the pull starts
const LOCK_AT = 0.45; // pull strength that counts as "locked on"

interface DragState {
  row: BoardRow;
  from: string;
  w: number;
  h: number;
  x: number;
  y: number;
  over: string | null;
  check: DropCheck | null;
  locked: boolean;
  /** Slim (empty) columns opened by hovering them; they stay open until the drop. */
  opened: string[];
}

interface Session {
  pointerId: number;
  touch: boolean;
  row: BoardRow;
  from: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabDX: number;
  grabDY: number;
  w: number;
  h: number;
  phase: "pending" | "drag" | "drop" | "return";
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  rot: number;
  scale: number;
  over: string | null;
  overOk: boolean;
  locked: boolean;
  dest: { x: number; y: number } | null;
  dropTo: string | null;
  settleStart: number;
  timer: ReturnType<typeof setTimeout> | null;
  raf: number;
  lastT: number;
  cleanup: () => void;
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const byDue = (a: BoardRow, b: BoardRow) =>
  a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title);

export function KanbanBoard({
  columns,
  today,
  hideClient,
  collapseEmpty,
  canDrop: canDropProp,
  onDrop,
  selection,
}: {
  columns: BoardColumn[];
  today: IsoDate;
  hideClient?: boolean;
  /** Empty columns shrink to a slim rail until a drag starts. */
  collapseEmpty?: boolean;
  /** Whether a card may go to a column. Without it, cards aren't draggable. */
  canDrop?: (row: BoardRow, to: string) => DropCheck;
  onDrop?: (row: BoardRow, to: string) => DropCheck;
  /** Select mode: a tap picks the card (no dragging, no opening). */
  selection?: Selection;
}) {
  const { notify } = useNumu();
  const canDrop = selection ? undefined : canDropProp;
  // Is there more board to the left or right? (fades + arrows)
  const [edges, setEdges] = useState({ left: false, right: false });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [landed, setLanded] = useState<{ id: string; to: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLAnchorElement>(null);
  const colEls = useRef(new Map<string, HTMLElement>());
  const session = useRef<Session | null>(null);
  const suppressClick = useRef(false);
  // Latest props for the animation loop, which outlives a render.
  const latest = useRef({ canDrop, onDrop, notify });
  useEffect(() => {
    latest.current = { canDrop, onDrop, notify };
  });

  useEffect(() => () => session.current?.cleanup(), []);

  const hasBoard = columns.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [hasBoard, columns.length]);

  function nudge(dir: -1 | 1) {
    scrollRef.current?.scrollBy({ left: dir * 560, behavior: "smooth" });
  }

  // Phones: once a card is picked up, the finger moves the card, not the page.
  // This listener must exist before the touch starts (and not be passive), or
  // the browser commits to scrolling and cancels the drag.
  const hasColumns = columns.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (session.current && session.current.phase !== "pending")
        e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, [hasColumns]);

  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), 900);
    return () => clearTimeout(t);
  }, [landed]);

  if (columns.length === 0)
    return <Empty>Nothing matches these filters.</Empty>;

  // ---------------------------------------------------------------------------
  // Drag engine (event handlers + animation frame; never runs during render)
  // ---------------------------------------------------------------------------
  function hitTest(x: number, y: number, from: string): string | null {
    const board = scrollRef.current?.getBoundingClientRect();
    if (!board || y < board.top - 48 || y > board.bottom + 160) return null;
    let best: string | null = null;
    let bestDist = 28; // tolerance for the gaps between columns
    for (const [key, el] of colEls.current) {
      const r = el.getBoundingClientRect();
      if (r.right < board.left || r.left > board.right) continue;
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < bestDist) {
        bestDist = d;
        best = key;
      }
    }
    return best === from ? null : best;
  }

  function apply(s: Session) {
    const g = ghostRef.current;
    if (!g) return;
    g.style.transform = `translate3d(${s.pos.x}px, ${s.pos.y}px, 0) rotate(${s.rot}deg) scale(${s.scale})`;
  }

  function tick(t: number) {
    const s = session.current;
    if (!s) return;
    const dt = Math.min(0.032, Math.max(0.001, (t - (s.lastT || t)) / 1000));
    s.lastT = t;
    const calm = reducedMotion();

    if (s.phase === "drag") {
      autoScroll(s, dt);
      const over = hitTest(s.x, s.y, s.from);
      if (over !== s.over) {
        const check = over
          ? (latest.current.canDrop?.(s.row, over) ?? {
              ok: false as const,
              reason: "Can't move here",
            })
          : null;
        s.over = over;
        s.overOk = Boolean(check?.ok);
        if (check?.ok) navigator.vibrate?.(6);
        setDrag((d) =>
          d
            ? {
                ...d,
                over,
                check,
                locked: false,
                opened:
                  over && !d.opened.includes(over)
                    ? [...d.opened, over]
                    : d.opened,
              }
            : d,
        );
        s.locked = false;
      }

      // Where the hand is, and how hard the slot pulls.
      const hand = { x: s.x - s.grabDX, y: s.y - s.grabDY };
      let target = hand;
      let pull = 0;
      const slot = s.overOk ? slotRef.current?.getBoundingClientRect() : null;
      if (slot) {
        const dx = hand.x + s.w / 2 - (slot.left + slot.width / 2);
        const dy = hand.y + s.h / 2 - (slot.top + s.h / 2);
        const near = clamp(1 - Math.hypot(dx, dy) / MAGNET_RADIUS, 0, 1);
        pull = Math.pow(near, 1.4) * 0.78 + 0.08;
        target = {
          x: hand.x + (slot.left - hand.x) * pull,
          y: hand.y + (slot.top - hand.y) * pull,
        };
        const locked = pull > LOCK_AT;
        if (locked !== s.locked) {
          s.locked = locked;
          if (locked) navigator.vibrate?.(4);
          setDrag((d) => (d ? { ...d, locked } : d));
        }
      }
      if (calm) {
        s.pos = target;
        s.vel = { x: 0, y: 0 };
      } else {
        spring(s, target, 760, 48, dt);
      }
      s.rot = calm
        ? 0
        : s.rot +
          (clamp(s.vel.x * 0.011, -7, 7) - s.rot) * Math.min(1, dt * 14);
      s.scale = 1.035 - pull * 0.035;
    } else if (s.phase === "drop" || s.phase === "return") {
      if (s.settleStart < 0) s.settleStart = t;
      if (s.phase === "drop") {
        const slot = slotRef.current?.getBoundingClientRect();
        if (slot) s.dest = { x: slot.left, y: slot.top };
      }
      const dest = s.dest ?? s.pos;
      if (calm) s.pos = dest;
      else
        spring(
          s,
          dest,
          s.phase === "drop" ? 520 : 340,
          s.phase === "drop" ? 26 : 30,
          dt,
        );
      s.rot += (0 - s.rot) * Math.min(1, dt * 16);
      s.scale += (1 - s.scale) * Math.min(1, dt * 16);
      const settled =
        Math.hypot(dest.x - s.pos.x, dest.y - s.pos.y) < 0.75 &&
        Math.hypot(s.vel.x, s.vel.y) < 30;
      if (calm || settled || t - s.settleStart > 700) {
        s.pos = dest;
        apply(s);
        finish(s);
        return;
      }
    }
    apply(s);
    s.raf = requestAnimationFrame(tick);
  }

  function spring(
    s: Session,
    target: { x: number; y: number },
    k: number,
    c: number,
    dt: number,
  ) {
    for (const axis of ["x", "y"] as const) {
      const a = k * (target[axis] - s.pos[axis]) - c * s.vel[axis];
      s.vel[axis] += a * dt;
      s.pos[axis] += s.vel[axis] * dt;
    }
  }

  function autoScroll(s: Session, dt: number) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const edge = 72;
    const speed = 650 * dt;
    if (s.x < r.left + edge)
      el.scrollLeft -= speed * (1 - (s.x - r.left) / edge);
    else if (s.x > r.right - edge)
      el.scrollLeft += speed * (1 - (r.right - s.x) / edge);
    if (s.y < 72) window.scrollBy(0, -speed);
    else if (s.y > window.innerHeight - 72) window.scrollBy(0, speed);
  }

  function begin(s: Session) {
    s.phase = "drag";
    s.lastT = 0;
    s.scale = 1;
    document.body.classList.add("is-dragging");
    if (s.touch) navigator.vibrate?.(12);
    setDrag({
      row: s.row,
      from: s.from,
      w: s.w,
      h: s.h,
      x: s.pos.x,
      y: s.pos.y,
      over: null,
      check: null,
      locked: false,
      opened: [],
    });
    s.raf = requestAnimationFrame(tick);
  }

  function release(s: Session, cancelled = false) {
    if (s.phase === "pending") {
      s.cleanup();
      return;
    }
    if (s.phase !== "drag") return;
    suppressClick.current = true;
    s.settleStart = -1; // stamped by the next animation frame
    if (!cancelled && s.over && s.overOk) {
      s.phase = "drop";
      s.dropTo = s.over;
    } else {
      if (!cancelled && s.over) {
        const check = latest.current.canDrop?.(s.row, s.over);
        if (check && !check.ok) latest.current.notify(check.reason, "error");
      }
      s.phase = "return";
      const hole = holeRef.current?.getBoundingClientRect();
      s.dest = hole
        ? { x: hole.left, y: hole.top }
        : { x: s.pos.x, y: s.pos.y };
      setDrag((d) =>
        d ? { ...d, over: null, check: null, locked: false } : d,
      );
    }
  }

  function finish(s: Session) {
    const to = s.phase === "drop" ? s.dropTo : null;
    s.cleanup();
    if (to) {
      const r = latest.current.onDrop?.(s.row, to) ?? {
        ok: false as const,
        reason: "Can't move here",
      };
      if (r.ok) setLanded({ id: s.row.id, to });
      else latest.current.notify(r.reason, "error");
    }
    setDrag(null);
  }

  function onPointerDown(
    e: ReactPointerEvent<HTMLElement>,
    row: BoardRow,
    from: string,
  ) {
    suppressClick.current = false;
    if (
      !canDrop ||
      session.current ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.pointerType !== "mouse";

    const onMove = (ev: PointerEvent) => {
      const s = session.current;
      if (!s || ev.pointerId !== s.pointerId) return;
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (s.phase === "pending") {
        const moved = Math.hypot(s.x - s.startX, s.y - s.startY);
        if (s.touch && moved > 10)
          s.cleanup(); // a swipe: let the page scroll
        else if (!s.touch && moved > 5) begin(s);
      }
    };
    const onUp = (ev: PointerEvent) => {
      const s = session.current;
      if (s && ev.pointerId === s.pointerId) release(s);
    };
    const onCancel = (ev: PointerEvent) => {
      const s = session.current;
      if (s && ev.pointerId === s.pointerId) release(s, true);
    };
    const onKey = (ev: KeyboardEvent) => {
      const s = session.current;
      if (s && ev.key === "Escape") release(s, true);
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (session.current && session.current.phase !== "pending")
        ev.preventDefault();
    };
    const onContext = (ev: Event) => {
      if (session.current) ev.preventDefault();
    };

    const s: Session = {
      pointerId: e.pointerId,
      touch,
      row,
      from,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      grabDX: e.clientX - rect.left,
      grabDY: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      phase: "pending",
      pos: { x: rect.left, y: rect.top },
      vel: { x: 0, y: 0 },
      rot: 0,
      scale: 1,
      over: null,
      overOk: false,
      locked: false,
      dest: null,
      dropTo: null,
      settleStart: 0,
      timer: null,
      raf: 0,
      lastT: 0,
      cleanup: () => {
        if (s.timer) clearTimeout(s.timer);
        cancelAnimationFrame(s.raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("contextmenu", onContext);
        document.body.classList.remove("is-dragging");
        if (session.current === s) session.current = null;
      },
    };
    session.current = s;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("contextmenu", onContext);
    if (touch)
      s.timer = setTimeout(
        () => session.current === s && s.phase === "pending" && begin(s),
        240,
      );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const dragging = drag !== null;

  return (
    <>
      <div className="relative -mx-4 sm:mx-0">
      <div
        ref={scrollRef}
        className={cn(
          "scroll-thin flex items-start gap-3 overflow-x-auto px-4 pb-4 sm:px-0",
          selection && "selecting",
          !dragging && "snap-x snap-mandatory md:snap-none",
        )}
      >
        {columns.map((col, ci) => {
          const empty = col.rows.length === 0;
          // Empty columns stay slim rails; dragging over one opens it (and it
          // stays open until the drop), so nothing shifts under the pointer.
          const slim = Boolean(
            collapseEmpty && empty && !drag?.opened.includes(col.key),
          );
          const isOver = drag?.over === col.key;
          const ok = Boolean(isOver && drag?.check?.ok);
          const blocked =
            isOver && drag?.check && !drag.check.ok ? drag.check.reason : null;
          const accent = col.color ?? "var(--focus)";
          const shown = expanded.has(col.key)
            ? col.rows
            : col.rows.slice(0, COLUMN_LIMIT);
          let slotAt = -1;
          if (ok && drag) {
            slotAt = shown.findIndex(
              (r) => r.id !== drag.row.id && byDue(drag.row, r) < 0,
            );
            if (slotAt === -1) slotAt = shown.length;
          }
          const points = col.rows.reduce((n, r) => n + r.effort_points, 0);
          const justLanded = landed?.to === col.key;

          const slot = (
            <div
              key="__slot"
              ref={slotRef}
              aria-hidden
              className={cn(
                "slot-open rounded-lg border-2 border-dashed",
                drag?.locked && "slot-locked",
              )}
              style={{ height: drag?.h, "--c": accent } as CSSProperties}
            />
          );

          return (
            <section
              key={col.key}
              ref={(el) => {
                if (el) colEls.current.set(col.key, el);
                else colEls.current.delete(col.key);
              }}
              aria-label={`${col.title}, ${col.rows.length} tasks`}
              className={cn(
                "relative flex shrink-0 snap-start flex-col rounded-xl border bg-surface-2 transition-[width,max-width,background-color,border-color,box-shadow] duration-200 ease-out",
                slim
                  ? "w-11 max-w-11 cursor-default"
                  : "w-[82vw] max-w-[300px] sm:w-[272px]",
                ok
                  ? "col-target"
                  : blocked
                    ? "col-blocked"
                    : dragging && drag?.from !== col.key
                      ? "border-dashed border-line-strong"
                      : "border-line",
              )}
              style={{ "--c": accent } as CSSProperties}
            >
              {slim ? (
                <header
                  className="flex flex-col items-center gap-2 py-3"
                  title={`${col.title}: empty`}
                >
                  {col.color ? (
                    <span
                      className="size-2 rounded-full"
                      style={{ background: col.color }}
                    />
                  ) : null}
                  {col.avatar ? <Avatar name={col.avatar} size={20} /> : null}
                  <span className="text-[12px] font-semibold text-muted [writing-mode:vertical-rl]">
                    {col.title}
                  </span>
                  <span className="text-[11.5px] text-faint num">0</span>
                </header>
              ) : (
                <>
                  <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      {col.color ? (
                        <span
                          className={cn(
                            "size-2 rounded-full transition-transform duration-200",
                            ok && "scale-150",
                          )}
                          style={{ background: col.color }}
                        />
                      ) : null}
                      {col.avatar ? (
                        <Avatar name={col.avatar} size={20} />
                      ) : col.key === "none" ? (
                        <UserRound className="size-4 text-muted" />
                      ) : null}
                      <span className="truncate text-[13px] font-semibold">
                        {col.title}
                      </span>
                      <span
                        key={justLanded ? `l${col.rows.length}` : "n"}
                        className={cn(
                          "text-[12px] text-muted num",
                          justLanded && "count-pop",
                        )}
                      >
                        {col.rows.length}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-muted num">
                      {points} pts
                    </span>
                  </header>
                  <div className="space-y-2 px-2 pb-2">
                    {shown.map((r, i) => {
                      const isDragged = drag?.row.id === r.id;
                      return (
                        <div key={r.id} className="space-y-2">
                          {slotAt === i ? slot : null}
                          {/* The card stays mounted while dragged (shown as the empty
                              slot it came from): a phone keeps sending the touch to
                              the element it started on. */}
                          <Link
                            ref={isDragged ? holeRef : undefined}
                            aria-hidden={isDragged || undefined}
                            href={`/deliverables/${r.id}`}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={(e) => onPointerDown(e, r, col.key)}
                            onClickCapture={(e) => {
                              if (suppressClick.current) {
                                e.preventDefault();
                                suppressClick.current = false;
                              } else if (selection) {
                                e.preventDefault();
                                selection.toggle(r.id);
                              }
                            }}
                            aria-pressed={selection ? selection.ids.has(r.id) : undefined}
                            className={cn(
                              "board-card group relative block overflow-hidden rounded-lg border border-line bg-surface p-3 pl-3.5 shadow-sm select-none [-webkit-touch-callout:none]",
                              "transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-md",
                              canDrop && "cursor-grab active:cursor-grabbing",
                              landed?.id === r.id ? "card-land" : "card-in",
                              isDragged && "card-hole",
                              selection && "cursor-pointer",
                              selection?.ids.has(r.id) &&
                                "border-ink ring-2 ring-ink/15 hover:border-ink",
                            )}
                            style={
                              {
                                "--land": STATUS_META[r.status].color,
                                animationDelay:
                                  landed?.id === r.id
                                    ? undefined
                                    : `${Math.min(ci * 30 + i * 18, 320)}ms`,
                              } as CSSProperties
                            }
                          >
                            {selection ? (
                              <span
                                aria-hidden
                                className={cn(
                                  "absolute top-2.5 right-2.5 z-10 grid size-[22px] place-items-center rounded-full border-[1.5px] transition-all duration-150",
                                  selection.ids.has(r.id)
                                    ? "scale-105 border-primary bg-primary text-primary-ink"
                                    : "border-line-strong bg-surface",
                                )}
                              >
                                {selection.ids.has(r.id) ? (
                                  <Check className="size-3" strokeWidth={3} />
                                ) : null}
                              </span>
                            ) : null}
                            <CardBody
                              row={r}
                              today={today}
                              hideClient={hideClient}
                            />
                          </Link>
                        </div>
                      );
                    })}
                    {slotAt === shown.length ? slot : null}
                    {empty && !ok ? (
                      <p
                        className={cn(
                          "px-2 py-5 text-center text-[12px]",
                          dragging ? "text-muted" : "text-faint",
                        )}
                      >
                        {dragging ? "Drop here" : "Empty"}
                      </p>
                    ) : null}
                    {col.rows.length > COLUMN_LIMIT &&
                    !expanded.has(col.key) ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((p) => new Set(p).add(col.key))
                        }
                        className="w-full rounded-lg py-2 text-[12.5px] font-medium text-muted hover:bg-surface-3 hover:text-ink"
                      >
                        Show {col.rows.length - COLUMN_LIMIT} more
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
        <EdgeFade side="left" show={edges.left} onClick={() => nudge(-1)} />
        <EdgeFade side="right" show={edges.right} onClick={() => nudge(1)} />
      </div>

      {drag
        ? createPortal(
            <div
              ref={ghostRef}
              aria-hidden
              className={cn(
                "board-ghost pointer-events-none fixed top-0 left-0 z-[90] overflow-hidden rounded-lg border bg-surface p-3 pl-3.5 shadow-lg will-change-transform",
                drag.locked
                  ? "ghost-locked"
                  : drag.check && !drag.check.ok
                    ? "ghost-blocked"
                    : "border-line-strong",
              )}
              style={
                {
                  width: drag.w,
                  transform: `translate3d(${drag.x}px, ${drag.y}px, 0)`,
                  "--c":
                    drag.over && drag.check?.ok
                      ? (columns.find((c) => c.key === drag.over)?.color ??
                        "var(--focus)")
                      : "var(--focus)",
                } as CSSProperties
              }
            >
              <CardBody row={drag.row} today={today} hideClient={hideClient} />
              {drag.check && !drag.check.ok ? (
                <p className="col-lock -mx-3 -mb-3 mt-3 flex items-start gap-1.5 border-t border-line bg-surface-2 px-3 py-2 text-[12px] font-medium text-critical">
                  <Lock className="mt-px size-3.5 shrink-0" />
                  {drag.check.reason}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** The inside of a card: status accent, title, owner, client, step progress, due date and flags. */
function CardBody({
  row,
  today,
  hideClient,
}: {
  row: BoardRow;
  today: IsoDate;
  hideClient?: boolean;
}) {
  const meta = STATUS_META[row.status];
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: meta.color }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">
          {row.title}
        </p>
        {row.owner ? (
          <Avatar name={row.owner.full_name} size={22} className="card-owner" />
        ) : (
          <span
            title="Unassigned"
            className="card-owner grid size-[22px] shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-faint"
          >
            <UserRound className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[12px] text-muted">
        {hideClient
          ? [
              row.type.name_en,
              row.platform ? PLATFORM_LABEL[row.platform] : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : row.type.is_content || row.title.startsWith(row.type.name_en)
            ? row.client.name_en
            : `${row.client.name_en} · ${row.type.name_en}`}
      </p>
      <Steps row={row} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "text-[12px] num",
            row.flags.overdue ? "font-medium text-critical" : "text-muted",
          )}
        >
          {formatRelative(row.due_date, today)}
        </span>
        <FlagPills row={row} today={today} />
      </div>
    </>
  );
}

/** Where the card is in its own workflow, as segments in the status colour. */
function Steps({ row }: { row: BoardRow }) {
  const flow = flowFor(row.deliverable_type);
  const at = flow.includes(row.status)
    ? flow.indexOf(row.status)
    : flow.filter((s) => statusIndex(s) <= statusIndex(row.status)).length - 1;
  const color = STATUS_META[row.status].color;
  return (
    <div
      className="mt-2.5 flex items-center gap-[3px]"
      role="img"
      aria-label={`Step ${at + 1} of ${flow.length}: ${STATUS_META[row.status].en}`}
    >
      {flow.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-300",
            i === at && "step-now",
          )}
          style={{
            background: i <= at ? color : "var(--surface-3)",
            opacity: i < at ? 0.45 : 1,
          }}
        />
      ))}
    </div>
  );
}

/** A soft fade at a side of the board when there's more to scroll, with an arrow on desktop. */
function EdgeFade({ side, show, onClick }: { side: "left" | "right"; show: boolean; onClick: () => void }) {
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-12 transition-opacity duration-200",
        side === "left" ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l",
        "from-[var(--bg)] to-transparent",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        tabIndex={show ? 0 : -1}
        onClick={onClick}
        aria-label={side === "left" ? "Scroll the board left" : "Scroll the board right"}
        className={cn(
          "pointer-events-auto absolute top-3 hidden size-8 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-md transition-transform hover:scale-105 hover:text-ink md:grid",
          side === "left" ? "left-1" : "right-1",
          !show && "pointer-events-none",
        )}
      >
        {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
    </div>
  );
}
