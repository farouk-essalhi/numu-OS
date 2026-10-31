"use client";

import { Eye, Info, Monitor, Moon, RotateCcw, Sun, Users } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { isDone, isWithTeam } from "@/lib/workflow";
import { useNumu } from "@/lib/store";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { ChevronRight } from "lucide-react";

const ROLE_LABEL = { partner: "Partner", account_lead: "Account lead", creator: "Creator" } as const;
const THEMES: Theme[] = ["system", "light", "dark"];

export default function ProfilePage() {
  const { me, role, rows, data, thisMonth, viewAs } = useNumu();
  const [theme, setTheme] = useState<Theme>(readTheme);

  const mine = rows.filter((r) => r.owner_id === me.id && r.month === thisMonth);
  const stats = [
    { label: "This month", value: mine.length },
    { label: "Done", value: mine.filter((r) => isDone(r.status)).length },
    { label: "Open", value: mine.filter((r) => isWithTeam(r.status)).length },
  ];

  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(next);
    setTheme(next);
  }

  return (
    <>
      <PageHeader title="Profile" />

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={me.full_name} size={56} />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-semibold">{me.full_name}</p>
            <p className="truncate text-[14px] text-muted">
              {me.job_title && me.job_title !== ROLE_LABEL[role] ? `${me.job_title} · ${ROLE_LABEL[role]}` : ROLE_LABEL[role]}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-line border-t border-line pt-4">
          {stats.map((s) => (
            <div key={s.label} className="px-3 first:pl-0">
              <p className="text-[22px] font-semibold tracking-[-0.01em]">{s.value}</p>
              <p className="text-[13px] text-muted">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted">Capacity {me.weekly_capacity_points} points a week</p>
      </Card>

      <h2 className="mt-7 mb-3 text-[19px] font-semibold">Settings</h2>
      <Card className="divide-y divide-line px-4">
        <SettingRow
          icon={theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />}
          label="Appearance"
          value={theme[0].toUpperCase() + theme.slice(1)}
          onClick={cycleTheme}
        />
        <div className="relative">
          <SettingRow icon={<Eye />} label="View as (demo)" value={me.full_name.split(" ")[0]} />
          <select
            aria-label="View as"
            value={me.id}
            onChange={(e) => viewAs(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {data.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} · {ROLE_LABEL[m.access_level]}
              </option>
            ))}
          </select>
        </div>
        <SettingRow icon={<Users />} label="Clients" value={String(data.clients.length)} href="/clients" />
        <SettingRow icon={<Info />} label="About" value="Demo data · v0.1" />
      </Card>

      <button
        type="button"
        onClick={() => {
          try {
            localStorage.removeItem("numu.demo.viewAs");
          } catch {}
          location.reload();
        }}
        className="mx-auto mt-6 flex items-center gap-2 text-[15px] font-medium text-danger"
      >
        <RotateCcw className="size-4" /> Reset demo
      </button>
      <p className="mt-2 text-center text-[12px] text-muted">Sign-in with a magic link arrives with the Supabase project.</p>
    </>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onClick,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <span className="grid size-9 place-items-center rounded-full bg-inset text-ink-2 [&>svg]:size-[18px]">{icon}</span>
      <span className="flex-1 text-left text-[15px]">{label}</span>
      <span className="text-[14px] text-muted">{value}</span>
      <ChevronRight className="size-4 text-faint" />
    </>
  );
  const classes = "flex w-full items-center gap-3 py-3";
  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}
