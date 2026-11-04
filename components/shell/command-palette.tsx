"use client";

import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { useNumu } from "@/lib/store";
import { STATUS_META } from "@/lib/workflow";
import { Kbd } from "../ui";
import { NAV, SETTINGS_ITEM } from "./nav";

interface Result {
  key: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  icon: ReactNode;
}

/** ⌘K: jump to any page, client, deliverable or task. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Palette onClose={onClose} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { rows, data, role } = useNumu();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const pages: Result[] = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM]
      .filter((p) => !(p.leadsOnly && role === "creator") && match(p.label))
      .map((p) => ({ key: p.href, group: "Pages", label: p.label, href: p.href, icon: <p.icon className="size-4" /> }));
    const clients: Result[] = data.clients
      .filter((c) => match(c.name_en) || (!!c.name_ar && c.name_ar.includes(q.trim())))
      .slice(0, 5)
      .map((c) => ({ key: c.id, group: "Clients", label: c.name_en, hint: c.industry ?? undefined, href: `/clients/${c.id}`, icon: <Building2 className="size-4" /> }));
    const deliverables: Result[] = needle
      ? rows
          .filter((r) => match(r.title) || match(r.client.name_en))
          .sort((a, b) => b.due_date.localeCompare(a.due_date))
          .slice(0, 8)
          .map((r) => ({
            key: r.id,
            group: "Tasks",
            label: r.title,
            hint: `${r.client.name_en} · ${STATUS_META[r.status].en}`,
            href: `/deliverables/${r.id}`,
            icon: <FileText className="size-4" />,
          }))
      : [];
    return [...pages, ...clients, ...deliverables];
  }, [q, rows, data.clients, role]);

  function go(r: Result | undefined) {
    if (!r) return;
    onClose();
    router.push(r.href);
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                go(results[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search tasks, clients, pages…"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="scroll-thin max-h-[min(420px,60vh)] overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? <li className="px-3 py-8 text-center text-[13px] text-muted">No results for “{q}”.</li> : null}
          {results.map((r, i) => {
            const header = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <li key={r.key} role="option" aria-selected={i === active}>
                {header ? <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{r.group}</p> : null}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active ? "bg-surface-3" : "")}
                >
                  <span className="text-muted">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{r.label}</span>
                    {r.hint ? <span className="block truncate text-[12px] text-muted">{r.hint}</span> : null}
                  </span>
                  {i === active ? <CornerDownLeft className="size-3.5 text-muted" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
