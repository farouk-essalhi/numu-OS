"use client";

import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar, Button, Card, CardHeader, PageHeader, Pill, Segmented } from "@/components/ui";
import { useNumu } from "@/lib/store";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

const ROLE_LABEL = { partner: "Partner", account_lead: "Account lead", creator: "Creator" } as const;

export default function SettingsPage() {
  const { me, role, data, viewAs, isDemo } = useNumu();
  const [theme, setTheme] = useState<Theme>(readTheme);

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile and how NUMU OS looks on this device" />
      <div className="grid max-w-[880px] gap-4">
        <Card>
          <CardHeader title="Profile" />
          <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:flex-row sm:items-center sm:px-5">
            <Avatar name={me.full_name} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold">{me.full_name}</p>
              <p className="text-[13px] text-muted">
                {me.job_title} · {me.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill tone="info">{ROLE_LABEL[role]}</Pill>
              <Pill>{me.weekly_capacity_points} pts / week</Pill>
              <Pill className="capitalize">{me.employment.replace("_", " ")}</Pill>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Appearance" subtitle="Follows your device unless you choose" />
          <div className="border-t border-line px-4 py-4 sm:px-5">
            <Segmented
              value={theme}
              onChange={(t) => {
                applyTheme(t);
                setTheme(t);
              }}
              options={[
                { value: "system", label: <><Monitor /> System</> },
                { value: "light", label: <><Sun /> Light</> },
                { value: "dark", label: <><Moon /> Dark</> },
              ]}
            />
          </div>
        </Card>

        {isDemo ? (
          <Card>
            <CardHeader title="Demo" subtitle="Until sign-in is connected, preview the app as anyone on the team" />
            <div className="divide-y divide-line border-t border-line">
              <Row label="View as">
                <select
                  value={me.id}
                  onChange={(e) => viewAs(e.target.value)}
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] shadow-sm"
                  aria-label="View as"
                >
                  {data.team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} · {ROLE_LABEL[m.access_level]}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Reset demo data">
                <Button
                  onClick={() => {
                    try {
                      localStorage.removeItem("numu.demo.viewAs");
                    } catch {}
                    location.reload();
                  }}
                >
                  <RotateCcw /> Reset
                </Button>
              </Row>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="About" />
          <p className="border-t border-line px-4 py-4 text-[13px] text-muted sm:px-5">
            NUMU OS · Phase 0 preview on fictional demo data. Sign-in with team accounts arrives with the Supabase project.
          </p>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <span className="text-[13.5px]">{label}</span>
      {children}
    </div>
  );
}
