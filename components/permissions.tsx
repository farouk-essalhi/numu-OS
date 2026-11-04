"use client";

import { CircleCheck, ListPlus, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { firstName } from "@/lib/format";
import { useNumu } from "@/lib/store";
import type { TeamMember } from "@/lib/types";
import { Avatar, Card, CardHeader, Pill, Switch } from "./ui";

type Key = "can_create_tasks" | "can_send_to_client" | "can_approve";

const PERMS: { key: Key; label: string; short: string; hint: string; icon: ReactNode }[] = [
  {
    key: "can_create_tasks",
    label: "Create & assign tasks",
    short: "Create tasks",
    hint: "Add tasks and deliverables and give them to anyone",
    icon: <ListPlus className="size-4" />,
  },
  {
    key: "can_send_to_client",
    label: "Send to client",
    short: "Send to client",
    hint: "Move work into Client review and record the changes a client asks for",
    icon: <Send className="size-4" />,
  },
  {
    key: "can_approve",
    label: "Approve content",
    short: "Approve",
    hint: "Mark work Approved: good to go",
    icon: <CircleCheck className="size-4" />,
  },
];

const ROLE_LABEL = { partner: "Partner", account_lead: "Account lead", creator: "Creator" } as const;
const ROLE_ORDER = { partner: 0, account_lead: 1, creator: 2 } as const;

/**
 * Team → Permissions. Partners switch what each person may do with work; the
 * database enforces it (private.can_approve() etc.), so this isn't just UI.
 */
export function PermissionsPanel() {
  const { data, role, save, notify } = useNumu();
  const isPartner = role === "partner";
  // Shown at once while saving; the store's reload brings the truth back.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const people = data.team
    .filter((m) => m.is_active)
    .sort((a, b) => ROLE_ORDER[a.access_level] - ROLE_ORDER[b.access_level] || a.full_name.localeCompare(b.full_name));
  const value = (m: TeamMember, k: Key) => pending[`${m.id}:${k}`] ?? m[k];

  async function toggle(m: TeamMember, k: Key, next: boolean) {
    const perm = PERMS.find((p) => p.key === k)!;
    if (!next && k !== "can_create_tasks" && !people.some((x) => x.id !== m.id && value(x, k))) {
      notify(`Someone has to keep "${perm.label}"`, "error");
      return;
    }
    const id = `${m.id}:${k}`;
    setPending((p) => ({ ...p, [id]: next }));
    const r = await save("team", { ...m, [k]: next });
    setPending((p) => {
      const rest = { ...p };
      delete rest[id];
      return rest;
    });
    if (!r.ok) notify(r.reason, "error");
    else notify(`${firstName(m.full_name)}: ${perm.label.toLowerCase()} ${next ? "on" : "off"}`, "success");
  }

  const who = (k: Key) => {
    const list = people.filter((m) => value(m, k));
    if (list.length === people.length && people.length > 1) return "everyone";
    return list.length ? list.map((m) => firstName(m.full_name)).join(", ") : "nobody";
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {PERMS.map((p) => (
          <div key={p.key} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <span className="text-muted">{p.icon}</span>
              {p.label}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold capitalize">{who(p.key)}</p>
            <p className="mt-1 text-[12px] text-muted">{p.hint}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Who can do what"
          subtitle={isPartner ? "Switch a permission on or off; it applies straight away." : "Only partners change permissions."}
        />

        {/* Desktop and tablet: one row per person */}
        <div className="scroll-thin hidden overflow-x-auto border-t border-line md:block">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-left text-[12px] text-muted">
              <tr>
                <th className="py-2.5 pr-3 pl-5 font-medium">Person</th>
                {PERMS.map((p) => (
                  <th key={p.key} className="w-[170px] px-3 font-medium" title={p.hint}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-3 pl-5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={m.full_name} size={30} />
                      <span>
                        <span className="block font-medium">{m.full_name}</span>
                        <span className="block text-[12px] text-muted">{ROLE_LABEL[m.access_level]}</span>
                      </span>
                    </span>
                  </td>
                  {PERMS.map((p) => (
                    <td key={p.key} className="px-3">
                      <Switch
                        checked={value(m, p.key)}
                        onChange={(v) => void toggle(m, p.key, v)}
                        disabled={!isPartner || `${m.id}:${p.key}` in pending}
                        label={`${p.label}: ${m.full_name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: a card per person */}
        <ul className="divide-y divide-line border-t border-line md:hidden">
          {people.map((m) => (
            <li key={m.id} className="px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2.5">
                <Avatar name={m.full_name} size={30} />
                <span className="text-[14px] font-medium">{m.full_name}</span>
                <Pill>{ROLE_LABEL[m.access_level]}</Pill>
              </div>
              <div className="space-y-2.5">
                {PERMS.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="text-muted">{p.icon}</span>
                      {p.short}
                    </span>
                    <Switch
                      checked={value(m, p.key)}
                      onChange={(v) => void toggle(m, p.key, v)}
                      disabled={!isPartner || `${m.id}:${p.key}` in pending}
                      label={`${p.label}: ${m.full_name}`}
                    />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted sm:px-5">
          Everyone can move their work along, comment and tick tasks done. The role (People tab) still decides the rest: partners
          see everything and manage the team; account leads manage clients, retainers and scope; creators don&apos;t see fees.
          Someone new starts with their role&apos;s defaults: partners approve, partners and account leads send to clients, everyone
          creates tasks.
        </p>
      </Card>
    </div>
  );
}
