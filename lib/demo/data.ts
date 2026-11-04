// Demo data for the UI until the Supabase project exists. Fictional clients
// and people only (CLAUDE.md: never real client data in the repo).
//
// Built the way the real system builds it: retainers -> scope lines ->
// generator (same due-date spread as public.generate_month_deliverables) ->
// work moved along relative to today, with a status history behind each item.

import {
  addDays,
  addMonths,
  dayNumber,
  monthEnd,
  monthStart,
  spreadDueDate,
} from "../dates";
import { PLATFORM_LABEL } from "../format";
import { flowFor, statusIndex, STATUSES } from "../workflow";
import type {
  Client,
  Comment,
  Contact,
  Dataset,
  Deliverable,
  DeliverableStatus,
  DeliverableType,
  IsoDate,
  Project,
  Retainer,
  ScopeLine,
  StatusEvent,
  TeamMember,
} from "../types";

export const DEMO_DEFAULT_USER = "tm-noor";

export const DELIVERABLE_TYPES: DeliverableType[] = [
  { code: "reel", name_en: "Reel", name_ar: "ريل", effort_points: 3, sort_order: 10 },
  { code: "static_post", name_en: "Static post", name_ar: "منشور ثابت", effort_points: 1, sort_order: 20 },
  { code: "carousel", name_en: "Carousel", name_ar: "منشور كاروسيل", effort_points: 2, sort_order: 30 },
  { code: "story_set", name_en: "Story set", name_ar: "مجموعة ستوريز", effort_points: 1, sort_order: 40 },
  { code: "long_video", name_en: "Long video", name_ar: "فيديو طويل", effort_points: 5, sort_order: 50 },
  { code: "shoot_day", name_en: "Shoot day", name_ar: "يوم تصوير", effort_points: 5, sort_order: 60 },
  { code: "ad_set", name_en: "Ad set", name_ar: "مجموعة إعلانات", effort_points: 2, sort_order: 70 },
  { code: "influencer_post", name_en: "Influencer post", name_ar: "منشور مؤثر", effort_points: 2, sort_order: 80 },
];

const TEAM: TeamMember[] = [
  member("tm-farouk", "Farouk", "Partner", "partner", "full_time", 10),
  member("tm-ali", "Ali", "Partner", "partner", "full_time", 5),
  member("tm-noor", "Noor Haddad", "Account lead", "account_lead", "full_time", 15),
  member("tm-yousef", "Yousef Karim", "Videographer", "creator", "full_time", 20),
  member("tm-mariam", "Mariam Saleh", "Video editor", "creator", "full_time", 20),
  member("tm-hamad", "Hamad Rashid", "Designer", "creator", "part_time", 12),
  member("tm-lina", "Lina Aziz", "Motion designer", "creator", "freelance", 10),
];

function member(
  id: string,
  full_name: string,
  job_title: string,
  access_level: TeamMember["access_level"],
  employment: TeamMember["employment"],
  weekly_capacity_points: number,
): TeamMember {
  const email = `${full_name.split(" ")[0].toLowerCase()}@example.com`;
  return { id, user_id: null, full_name, email, job_title, access_level, employment, weekly_capacity_points, is_active: true };
}

const CLIENTS: Client[] = [
  client("cl-dune", "Dune Coffee Roasters", "محمصة الكثبان للقهوة", "Food and beverage", "tm-noor"),
  client("cl-marina", "Marina Dental Clinic", "عيادة مارينا لطب الأسنان", "Healthcare", "tm-noor"),
  client("cl-falcon", "Falcon Motors", "فالكون موتورز", "Automotive", "tm-farouk"),
  client("cl-sidra", "Sidra Interiors", "سدرة للتصميم الداخلي", "Interior design", "tm-noor"),
  client("cl-sandline", "Sandline Padel", "ساندلاين بادل", "Sports", "tm-farouk"),
];

function client(id: string, name_en: string, name_ar: string, industry: string, lead: string): Client {
  return {
    id,
    name_en,
    name_ar,
    industry,
    status: "active",
    account_lead_id: lead,
    brand_kit_url: "https://drive.google.com/drive/folders/example-brand",
    drive_folder_url: "https://drive.google.com/drive/folders/example",
  };
}

const CONTACTS: Contact[] = [
  { id: "ct-sara", client_id: "cl-dune", full_name: "Sara Al-Mansoori", job_title: "Marketing manager", phone: "+97455500001", email: "sara@dune.example", is_approver: true, preferred_language: "en" },
  { id: "ct-omar", client_id: "cl-dune", full_name: "Omar Fakhro", job_title: "Owner", phone: "+97455500002", email: "omar@dune.example", is_approver: false, preferred_language: "ar" },
  { id: "ct-hessa", client_id: "cl-marina", full_name: "Dr. Hessa Nasser", job_title: "Clinic director", phone: "+97455500003", email: "hessa@marina.example", is_approver: true, preferred_language: "ar" },
  { id: "ct-khalid", client_id: "cl-falcon", full_name: "Khalid Jaber", job_title: "Head of marketing", phone: "+97455500004", email: "khalid@falcon.example", is_approver: true, preferred_language: "en" },
  { id: "ct-reem", client_id: "cl-sidra", full_name: "Reem Al-Kuwari", job_title: "Founder", phone: "+97455500005", email: "reem@sidra.example", is_approver: true, preferred_language: "ar" },
  { id: "ct-jassim", client_id: "cl-sandline", full_name: "Jassim Darwish", job_title: "General manager", phone: "+97455500006", email: "jassim@sandline.example", is_approver: true, preferred_language: "en" },
];

type ScopeSpec = [ScopeLine["deliverable_type"], number, ScopeLine["platform"], string | null];

const RETAINER_SPECS: { id: string; client: string; monthsAgo: number; fee: number; scope: ScopeSpec[] }[] = [
  {
    id: "rt-dune", client: "cl-dune", monthsAgo: 5, fee: 1_800_000,
    scope: [["reel", 6, "instagram", "tm-mariam"], ["static_post", 8, "instagram", "tm-hamad"], ["story_set", 4, "instagram", "tm-noor"]],
  },
  {
    id: "rt-marina", client: "cl-marina", monthsAgo: 4, fee: 1_500_000,
    scope: [["reel", 4, "instagram", "tm-mariam"], ["carousel", 6, "instagram", "tm-hamad"], ["shoot_day", 1, null, "tm-yousef"]],
  },
  {
    id: "rt-falcon", client: "cl-falcon", monthsAgo: 8, fee: 3_200_000,
    scope: [["reel", 8, "instagram", "tm-mariam"], ["reel", 4, "tiktok", "tm-lina"], ["ad_set", 2, "instagram", "tm-hamad"], ["long_video", 1, "youtube", "tm-yousef"]],
  },
  {
    id: "rt-sidra", client: "cl-sidra", monthsAgo: 1, fee: 1_200_000,
    scope: [["carousel", 4, "instagram", "tm-hamad"], ["reel", 3, "instagram", "tm-lina"]],
  },
  {
    id: "rt-sandline", client: "cl-sandline", monthsAgo: 2, fee: 950_000,
    scope: [["reel", 4, "tiktok", "tm-lina"], ["static_post", 6, "instagram", "tm-hamad"], ["story_set", 4, "instagram", null]],
  },
];

// Small deterministic PRNG so the demo looks the same on every reload.
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Doha wall-clock time on a date, as an ISO timestamp (Doha is UTC+3, no DST). */
function at(day: IsoDate, hourDoha: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hourDoha - 3) * 3_600_000).toISOString();
}

/** Nearest status on this type's usual path at or before `status`. */
function onPath(type: Deliverable["deliverable_type"], status: DeliverableStatus): DeliverableStatus {
  const flow = flowFor(type);
  if (flow.includes(status)) return status;
  return [...flow].reverse().find((s) => statusIndex(s) < statusIndex(status)) ?? "planned";
}

export function buildDemoDataset(today: IsoDate, now: Date): Dataset {
  const thisMonth = monthStart(today);
  const typeByCode = new Map(DELIVERABLE_TYPES.map((t) => [t.code, t]));
  const clientById = new Map(CLIENTS.map((c) => [c.id, c]));

  const retainers: Retainer[] = [];
  const scopeLines: ScopeLine[] = [];
  for (const spec of RETAINER_SPECS) {
    retainers.push({
      id: spec.id,
      client_id: spec.client,
      status: "active",
      start_date: addMonths(thisMonth, -spec.monthsAgo),
      end_date: null,
      monthly_fee_minor: spec.fee,
      currency: "QAR",
      billing_day: null,
    });
    spec.scope.forEach(([type, qty, platform, owner], i) => {
      scopeLines.push({
        id: `${spec.id}-sl${i + 1}`,
        retainer_id: spec.id,
        deliverable_type: type,
        quantity_per_month: qty,
        platform,
        default_owner_id: owner,
      });
    });
  }

  // Months that exist: three months of history, this month, and next month
  // once the 25th has passed (that's when the generator creates it).
  const months = [-3, -2, -1, 0].map((n) => addMonths(thisMonth, n));
  if (dayNumber(today) >= 25) months.push(addMonths(thisMonth, 1));

  const deliverables: Deliverable[] = [];
  const events: StatusEvent[] = [];
  let eventId = 1;
  const nowIso = now.toISOString();

  const pushEvents = (d: Deliverable, path: { status: DeliverableStatus; at: string }[]) => {
    // Steps planned for the future are spread evenly between the last real
    // step and now, so the history always ends before today and reads naturally.
    const firstFuture = path.findIndex((p) => p.at > nowIso);
    let steps = path;
    if (firstFuture >= 0) {
      const startMs = firstFuture > 0 ? Date.parse(path[firstFuture - 1].at) : now.getTime() - 2 * 86_400_000;
      const endMs = now.getTime() - 25 * 60_000;
      const k = path.length - firstFuture;
      const span = Math.max(k * 60_000, endMs - startMs);
      steps = path.map((p, i) =>
        i < firstFuture ? p : { ...p, at: new Date(Math.min(endMs, startMs + (span * (i - firstFuture + 1)) / (k + 1))).toISOString() },
      );
    }
    let prev = "";
    steps.forEach((step, i) => {
      let when = step.at;
      if (when <= prev) when = new Date(Date.parse(prev) + 60_000).toISOString();
      events.push({
        id: eventId++,
        deliverable_id: d.id,
        from_status: i === 0 ? null : steps[i - 1].status,
        to_status: step.status,
        changed_by_team_member_id: i === 0 ? null : d.owner_id,
        changed_by_contact_id: null,
        changed_at: when,
      });
      prev = when;
    });
  };

  for (const month of months) {
    for (const r of retainers) {
      if (r.start_date > monthEnd(month)) continue;
      const lead = clientById.get(r.client_id)?.account_lead_id ?? null;
      for (const sl of scopeLines.filter((s) => s.retainer_id === r.id)) {
        const type = typeByCode.get(sl.deliverable_type)!;
        for (let seq = 1; seq <= sl.quantity_per_month; seq++) {
          const due = spreadDueDate(month, seq, sl.quantity_per_month);
          const d: Deliverable = {
            id: `dl-${sl.id}-${month.slice(0, 7)}-${seq}`,
            client_id: r.client_id,
            retainer_id: r.id,
            scope_line_id: sl.id,
            project_id: null,
            deliverable_type: sl.deliverable_type,
            title: `${type.name_en} ${seq}/${sl.quantity_per_month}${sl.platform ? ` · ${PLATFORM_LABEL[sl.platform]}` : ""}`,
            month,
            seq,
            platform: sl.platform,
            owner_id: sl.default_owner_id ?? lead,
            due_date: due,
            post_date: null,
            status: "planned",
            revision_count: 0,
            effort_points: type.effort_points,
            script_url: null,
            raw_url: null,
            final_url: null,
            post_url: null,
            posted_at: null,
            created_at: at(addDays(month, -6), 9),
          };
          moveAlong(d, today);
          deliverables.push(d);
          pushEvents(d, historyFor(d));
        }
      }
    }
  }

  // A one-off project
  const projects: Project[] = [
    {
      id: "pj-falcon-nd",
      client_id: "cl-falcon",
      name_en: "National Day campaign",
      name_ar: "حملة اليوم الوطني",
      status: "active",
      fixed_fee_minor: 3_000_000,
      currency: "QAR",
      start_date: addDays(today, -10),
      deadline: addDays(today, 25),
    },
  ];
  const projectItems: [string, Deliverable["deliverable_type"], Deliverable["platform"], string, number, DeliverableStatus][] = [
    ["Teaser reel", "reel", "instagram", "tm-mariam", 2, "editing"],
    ["Influencer post 1/2", "influencer_post", "instagram", "tm-noor", 9, "scripting"],
    ["Influencer post 2/2", "influencer_post", "tiktok", "tm-noor", 12, "planned"],
    ["Campaign film", "long_video", "youtube", "tm-yousef", 18, "shooting"],
  ];
  projectItems.forEach(([title, type, platform, owner, inDays, status], i) => {
    const t = typeByCode.get(type)!;
    const due = addDays(today, inDays);
    const d: Deliverable = {
      id: `dl-pj-falcon-nd-${i + 1}`,
      client_id: "cl-falcon",
      retainer_id: null,
      scope_line_id: null,
      project_id: "pj-falcon-nd",
      deliverable_type: type,
      title: `${title}${platform ? ` · ${PLATFORM_LABEL[platform]}` : ""}`,
      month: monthStart(due),
      seq: null,
      platform,
      owner_id: owner,
      due_date: due,
      post_date: null,
      status,
      revision_count: 0,
      effort_points: t.effort_points,
      script_url: status !== "planned" ? "https://docs.google.com/document/d/example" : null,
      raw_url: null,
      final_url: null,
      post_url: null,
      posted_at: null,
      created_at: at(addDays(today, -10), 11),
    };
    deliverables.push(d);
    pushEvents(d, historyFor(d));
  });

  // Make sure the board shows both flags from the spec.
  const nearToday = (d: Deliverable) => Math.abs(new Date(d.due_date).getTime() - new Date(today).getTime());
  const bounced = deliverables
    .filter((d) => d.client_id === "cl-dune" && d.deliverable_type === "reel" && d.month === thisMonth && d.due_date >= today)
    .sort((a, b) => nearToday(a) - nearToday(b))[0];
  if (bounced) {
    bounced.status = "editing";
    bounced.revision_count = 2;
    bounced.post_date = null;
    replaceEvents(bounced, historyFor(bounced));
  }
  const waiting = deliverables
    .filter((d) => d.client_id === "cl-marina" && d.deliverable_type === "carousel" && d.month === thisMonth && d.id !== bounced?.id)
    .sort((a, b) => nearToday(a) - nearToday(b))[0];
  if (waiting) {
    waiting.status = "client_review";
    waiting.post_date = null;
    waiting.posted_at = null;
    waiting.post_url = null;
    waiting.revision_count = 0;
    const path = historyFor(waiting);
    path[path.length - 1].at = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    path.forEach((p, i) => {
      if (i < path.length - 1) p.at = new Date(now.getTime() - (5 + path.length - i) * 86_400_000).toISOString();
    });
    replaceEvents(waiting, path);
  }

  function replaceEvents(d: Deliverable, path: { status: DeliverableStatus; at: string }[]) {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].deliverable_id === d.id) events.splice(i, 1);
    pushEvents(d, path);
  }

  const comments: Comment[] = [];
  if (bounced) {
    comments.push(
      { id: "cm-1", deliverable_id: bounced.id, author_team_member_id: "tm-noor", author_contact_id: null, body: "Client wants the logo bigger in the first 2 seconds, and the price on screen in Arabic too.", is_internal: true, created_at: new Date(now.getTime() - 26 * 3_600_000).toISOString() },
      { id: "cm-2", deliverable_id: bounced.id, author_team_member_id: "tm-mariam", author_contact_id: null, body: "On it. New cut on Drive by tomorrow noon.", is_internal: true, created_at: new Date(now.getTime() - 25 * 3_600_000).toISOString() },
    );
  }
  if (waiting) {
    comments.push({ id: "cm-3", deliverable_id: waiting.id, author_team_member_id: "tm-noor", author_contact_id: null, body: "Sent to Dr. Hessa on WhatsApp too. She's travelling until Thursday.", is_internal: true, created_at: new Date(now.getTime() - 50 * 3_600_000).toISOString() });
  }

  return {
    deliverableTypes: DELIVERABLE_TYPES,
    team: TEAM,
    clients: CLIENTS,
    contacts: CONTACTS,
    retainers,
    scopeLines,
    projects,
    deliverables,
    statusEvents: events.sort((a, b) => a.id - b.id),
    comments,
  };
}

/** Move a generated item to where it would plausibly be today. */
function moveAlong(d: Deliverable, today: IsoDate) {
  const rand = seeded(d.id);
  const r1 = rand();
  const r2 = rand();
  const r3 = rand();

  if (d.due_date < addDays(today, 7)) d.post_date = addDays(d.due_date, 2);

  let status: DeliverableStatus;
  if (d.post_date && d.post_date < today) {
    // Mostly live; the odd one is late to post.
    status = r1 < 0.05 && d.post_date >= addDays(today, -6) ? "scheduled" : "posted";
  } else if (d.due_date < today) {
    status = r1 < 0.5 ? "approved" : "scheduled";
  } else if (d.due_date < addDays(today, 3)) {
    status = (["editing", "internal_review", "client_review"] as const)[(d.seq ?? 0) % 3];
  } else if (d.due_date < addDays(today, 7)) {
    status = (["scripting", "shooting", "editing"] as const)[(d.seq ?? 0) % 3];
  } else {
    status = "planned";
  }
  d.status = onPath(d.deliverable_type, status);

  if (statusIndex(d.status) >= statusIndex("approved")) {
    d.revision_count = r2 < 0.68 ? 0 : r2 < 0.93 ? 1 : 2;
  }
  if (d.status === "posted" && d.post_date) {
    const lateDays = r3 < 0.86 ? 0 : r3 < 0.96 ? 1 : 2;
    d.posted_at = at(addDays(d.post_date, lateDays), 18);
    d.post_url = `https://www.instagram.com/p/example-${d.id.slice(-6)}`;
  }
  if (statusIndex(d.status) >= statusIndex("editing")) {
    d.final_url = "https://drive.google.com/file/d/example-final";
    d.raw_url = d.deliverable_type === "reel" || d.deliverable_type === "long_video" ? "https://drive.google.com/drive/folders/example-raw" : null;
  }
  if (statusIndex(d.status) >= statusIndex("scripting") && flowFor(d.deliverable_type).includes("scripting")) {
    d.script_url = "https://docs.google.com/document/d/example-script";
  }
}

/** A plausible status history ending in the deliverable's current status. */
function historyFor(d: Deliverable): { status: DeliverableStatus; at: string }[] {
  const flow = flowFor(d.deliverable_type);
  const target = flow.includes(d.status) ? flow.indexOf(d.status) : flow.length - 1;
  const offset: Partial<Record<DeliverableStatus, number>> = {
    scripting: -6, shooting: -4, editing: -2, internal_review: -1, client_review: 0, approved: 1,
  };
  const path: { status: DeliverableStatus; at: string }[] = [{ status: "planned", at: d.created_at }];
  let extraDays = 0;
  for (let i = 1; i <= target; i++) {
    const s = flow[i];
    if (s === "scheduled" && d.post_date) {
      path.push({ status: s, at: at(addDays(d.post_date, -1), 15) });
      continue;
    }
    if (s === "posted" && d.posted_at) {
      path.push({ status: s, at: d.posted_at });
      continue;
    }
    path.push({ status: s, at: at(addDays(d.due_date, (offset[s] ?? 0) + extraDays), 10 + i) });
    // Revisions: back to Editing and round again before approval.
    if (s === "client_review" && d.revision_count > 0 && (i < target || d.status !== "client_review")) {
      for (let r = 0; r < d.revision_count; r++) {
        extraDays += 1;
        path.push({ status: "editing", at: at(addDays(d.due_date, extraDays), 9) });
        path.push({ status: "internal_review", at: at(addDays(d.due_date, extraDays), 15) });
        path.push({ status: "client_review", at: at(addDays(d.due_date, extraDays), 17) });
      }
    }
  }
  // An item sent back from the client and now in Editing again.
  if (d.revision_count > 0 && statusIndex(d.status) < statusIndex("client_review") && d.status !== "planned") {
    const base = addDays(d.due_date, -3);
    return [
      { status: "planned", at: d.created_at },
      ...STATUSES.slice(1, 6)
        .filter((s) => flow.includes(s))
        .map((s, i) => ({ status: s, at: at(addDays(base, i), 10) })),
      ...Array.from({ length: d.revision_count }, (_, r) => [
        { status: "editing" as const, at: at(addDays(base, 5 + r * 2), 11) },
        ...(r < d.revision_count - 1
          ? [
              { status: "internal_review" as const, at: at(addDays(base, 5 + r * 2), 16) },
              { status: "client_review" as const, at: at(addDays(base, 6 + r * 2), 10) },
            ]
          : []),
      ]).flat(),
    ];
  }
  return path;
}

