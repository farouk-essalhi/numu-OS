"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMonth } from "@/lib/dates";
import { PLATFORM_LABEL } from "@/lib/format";
import { useNumu, type EntityKey, type EntityRow, type Result, type ToastAction } from "@/lib/store";
import type {
  AccessLevel,
  Client,
  ClientStatus,
  Contact,
  DeliverableTypeCode,
  EmploymentType,
  LanguageCode,
  Platform,
  Project,
  ProjectStatus,
  Retainer,
  RetainerStatus,
  ScopeLine,
  TeamMember,
} from "@/lib/types";
import { badUrl, Check, control, Field, Input, moneyText, orNull, parseMoney, Select, Sheet, SheetForm, TextArea } from "./forms";

/** Which form is open. `row` absent = a new one. */
export type Edit =
  | { kind: "client"; row?: Client }
  | { kind: "contact"; clientId: string; row?: Contact }
  | { kind: "retainer"; clientId: string; row?: Retainer }
  | { kind: "scope"; retainerId: string; row?: ScopeLine }
  | { kind: "project"; clientId?: string; row?: Project }
  | { kind: "member"; row?: TeamMember };

export function EditSheet({ edit, onClose }: { edit: Edit | null; onClose: () => void }) {
  return (
    <Sheet open={edit !== null} onOpenChange={(o) => !o && onClose()}>
      {edit?.kind === "client" ? <ClientForm row={edit.row} onDone={onClose} /> : null}
      {edit?.kind === "contact" ? <ContactForm clientId={edit.clientId} row={edit.row} onDone={onClose} /> : null}
      {edit?.kind === "retainer" ? <RetainerForm clientId={edit.clientId} row={edit.row} onDone={onClose} /> : null}
      {edit?.kind === "scope" ? <ScopeForm retainerId={edit.retainerId} row={edit.row} onDone={onClose} /> : null}
      {edit?.kind === "project" ? <ProjectForm clientId={edit.clientId} row={edit.row} onDone={onClose} /> : null}
      {edit?.kind === "member" ? <MemberForm row={edit.row} onDone={onClose} /> : null}
    </Sheet>
  );
}

/** Save/delete with a busy flag, an error line and a toast. */
function useSubmit(onDone: () => void) {
  const { save, remove, notify } = useNumu();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<Result>, ok: string, after?: () => void, action?: ToastAction) {
    setSaving(true);
    setError(null);
    const r = await fn();
    setSaving(false);
    if (!r.ok) return setError(r.reason);
    notify(ok, "success", action);
    onDone();
    after?.();
  }

  return {
    saving,
    error,
    setError,
    submit: <K extends EntityKey>(entity: K, row: EntityRow<K>, ok: string, after?: () => void, action?: ToastAction) =>
      run(() => save(entity, row), ok, after, action),
    destroy: (entity: EntityKey, id: string, ok: string, after?: () => void) => run(() => remove(entity, id), ok, after),
  };
}

const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const CLIENT_STATUS: { value: ClientStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "ended", label: "Ended" },
];

function ClientForm({ row, onDone }: { row?: Client; onDone: () => void }) {
  const { data, me, role } = useNumu();
  const router = useRouter();
  const { saving, error, setError, submit, destroy } = useSubmit(onDone);
  const leads = data.team.filter((m) => m.is_active && m.access_level !== "creator");
  const [f, setF] = useState({
    name_en: row?.name_en ?? "",
    name_ar: row?.name_ar ?? "",
    industry: row?.industry ?? "",
    status: row?.status ?? ("active" as ClientStatus),
    account_lead_id: row?.account_lead_id ?? (role === "account_lead" ? me.id : (leads.find((m) => m.access_level === "account_lead")?.id ?? me.id)),
    brand_kit_url: row?.brand_kit_url ?? "",
    drive_folder_url: row?.drive_folder_url ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function onSubmit() {
    if (!f.name_en.trim()) return setError("Add the client's name");
    if (badUrl(f.brand_kit_url) || badUrl(f.drive_folder_url)) return setError("Links must start with https://");
    const id = row?.id ?? newId();
    void submit(
      "clients",
      {
        id,
        name_en: f.name_en.trim(),
        name_ar: orNull(f.name_ar),
        industry: orNull(f.industry),
        status: f.status,
        account_lead_id: f.account_lead_id || null,
        brand_kit_url: orNull(f.brand_kit_url),
        drive_folder_url: orNull(f.drive_folder_url),
      },
      row ? "Client saved" : "Client added",
      row ? undefined : () => router.push(`/clients/${id}`),
    );
  }

  return (
    <SheetForm
      title={row ? "Edit client" : "New client"}
      description={row ? undefined : "Next you'll add their retainer and monthly scope."}
      onClose={onDone}
      onSubmit={onSubmit}
      onDelete={row && role === "partner" ? () => void destroy("clients", row.id, "Client deleted", () => router.push("/clients")) : undefined}
      saving={saving}
      error={error}
      submitLabel={row ? "Save" : "Add client"}
    >
      <Field label="Name (English)">
        <Input value={f.name_en} onChange={(e) => set("name_en", e.target.value)} autoFocus required />
      </Field>
      <Field label="Name (Arabic)" hint="Shown on anything the client sees">
        <Input value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} dir="rtl" lang="ar" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Industry">
          <Input value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Hospitality" />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(v) => set("status", v)} options={CLIENT_STATUS} />
        </Field>
      </div>
      <Field label="Account lead" hint="Gets the client's deliverables when a scope line has no default owner">
        <Select
          value={f.account_lead_id}
          onChange={(v) => set("account_lead_id", v)}
          options={[{ value: "", label: "No lead yet" }, ...leads.map((m) => ({ value: m.id, label: m.full_name }))]}
        />
      </Field>
      <Field label="Drive folder link">
        <Input value={f.drive_folder_url} onChange={(e) => set("drive_folder_url", e.target.value)} placeholder="https://drive.google.com/…" inputMode="url" />
      </Field>
      <Field label="Brand kit link">
        <Input value={f.brand_kit_url} onChange={(e) => set("brand_kit_url", e.target.value)} placeholder="https://…" inputMode="url" />
      </Field>
    </SheetForm>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------
const LANGS: { value: LanguageCode; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
];

function ContactForm({ clientId, row, onDone }: { clientId: string; row?: Contact; onDone: () => void }) {
  const { saving, error, setError, submit, destroy } = useSubmit(onDone);
  const [f, setF] = useState({
    full_name: row?.full_name ?? "",
    job_title: row?.job_title ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    is_approver: row?.is_approver ?? false,
    preferred_language: row?.preferred_language ?? ("en" as LanguageCode),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function onSubmit() {
    if (!f.full_name.trim()) return setError("Add their name");
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+$/.test(f.email.trim())) return setError("That email doesn't look right");
    void submit(
      "contacts",
      {
        id: row?.id ?? newId(),
        client_id: clientId,
        full_name: f.full_name.trim(),
        job_title: orNull(f.job_title),
        phone: orNull(f.phone.replace(/[^\d+]/g, "")),
        email: orNull(f.email.toLowerCase()),
        is_approver: f.is_approver,
        preferred_language: f.preferred_language,
      },
      row ? "Contact saved" : "Contact added",
    );
  }

  return (
    <SheetForm
      title={row ? "Edit contact" : "New contact"}
      description="Someone at the client: who approves, who to WhatsApp."
      onClose={onDone}
      onSubmit={onSubmit}
      onDelete={row ? () => void destroy("contacts", row.id, "Contact removed") : undefined}
      deleteLabel="Remove"
      saving={saving}
      error={error}
      submitLabel={row ? "Save" : "Add contact"}
    >
      <Field label="Full name">
        <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} autoFocus />
      </Field>
      <Field label="Job title">
        <Input value={f.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="e.g. Marketing manager" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="WhatsApp" hint="With country code">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+974 5555 0000" inputMode="tel" />
        </Field>
        <Field label="Email">
          <Input value={f.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" />
        </Field>
      </div>
      <Field label="Emails in">
        <Select value={f.preferred_language} onChange={(v) => set("preferred_language", v)} options={LANGS} />
      </Field>
      <Check checked={f.is_approver} onChange={(v) => set("is_approver", v)} label="Approves content" hint="Their sign-off moves work out of Client review" />
    </SheetForm>
  );
}

// ---------------------------------------------------------------------------
// Retainer
// ---------------------------------------------------------------------------
const RETAINER_STATUS: { value: RetainerStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft (not generating yet)" },
  { value: "paused", label: "Paused" },
  { value: "ended", label: "Ended" },
];
const CURRENCIES = [
  { value: "QAR", label: "QAR" },
  { value: "USD", label: "USD" },
] as const;

function RetainerForm({ clientId, row, onDone }: { clientId: string; row?: Retainer; onDone: () => void }) {
  const { thisMonth, role } = useNumu();
  const { saving, error, setError, submit, destroy } = useSubmit(onDone);
  const [f, setF] = useState({
    status: row?.status ?? ("active" as RetainerStatus),
    start_date: row?.start_date ?? thisMonth,
    end_date: row?.end_date ?? "",
    fee: moneyText(row?.monthly_fee_minor),
    currency: (row?.currency ?? "QAR") as "QAR" | "USD",
    billing_day: row?.billing_day ? String(row.billing_day) : "",
    notes: row?.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function onSubmit() {
    const fee = parseMoney(f.fee);
    if (fee === null) return setError("Enter the monthly fee as a number, e.g. 18000");
    if (!f.start_date) return setError("Add a start date");
    if (f.end_date && f.end_date < f.start_date) return setError("The end date must be after the start date");
    const day = f.billing_day.trim() ? Number(f.billing_day) : null;
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return setError("Billing day must be between 1 and 31");
    void submit(
      "retainers",
      {
        id: row?.id ?? newId(),
        client_id: clientId,
        status: f.status,
        start_date: f.start_date,
        end_date: f.end_date || null,
        monthly_fee_minor: fee,
        currency: f.currency,
        billing_day: day,
        notes: orNull(f.notes),
      },
      row ? "Retainer saved" : "Retainer added. Now add what it buys each month",
    );
  }

  return (
    <SheetForm
      title={row ? "Edit retainer" : "New retainer"}
      description="The monthly contract. A price change is a new retainer, so invoice history stays true."
      onClose={onDone}
      onSubmit={onSubmit}
      onDelete={row && role === "partner" ? () => void destroy("retainers", row.id, "Retainer deleted") : undefined}
      saving={saving}
      error={error}
      submitLabel={row ? "Save" : "Add retainer"}
    >
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Monthly fee">
          <Input value={f.fee} onChange={(e) => set("fee", e.target.value)} inputMode="decimal" placeholder="18000" autoFocus className="num" />
        </Field>
        <Field label="Currency">
          <Select value={f.currency} onChange={(v) => set("currency", v)} options={CURRENCIES} />
        </Field>
      </div>
      <Field label="Status" hint="Only active retainers of active clients generate deliverables">
        <Select value={f.status} onChange={(v) => set("status", v)} options={RETAINER_STATUS} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        <Field label="Ends" hint="Empty = ongoing">
          <Input type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} min={f.start_date} />
        </Field>
      </div>
      <Field label="Billing day" hint="Day of the month the invoice goes out. Empty = last working day">
        <Input value={f.billing_day} onChange={(e) => set("billing_day", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 1" />
      </Field>
      <Field label="Notes">
        <TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything about the contract worth remembering" />
      </Field>
    </SheetForm>
  );
}

// ---------------------------------------------------------------------------
// Scope line
// ---------------------------------------------------------------------------
const PLATFORM_OPTIONS: { value: Platform | ""; label: string }[] = [
  ...(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => ({ value: p, label: PLATFORM_LABEL[p] })),
  { value: "", label: "No platform" },
];

function ScopeForm({ retainerId, row, onDone }: { retainerId: string; row?: ScopeLine; onDone: () => void }) {
  const { data, thisMonth } = useNumu();
  const { saving, error, setError, submit, destroy } = useSubmit(onDone);
  const [f, setF] = useState({
    deliverable_type: row?.deliverable_type ?? ("reel" as DeliverableTypeCode),
    quantity: row ? String(row.quantity_per_month) : "4",
    platform: (row ? (row.platform ?? "") : "instagram") as Platform | "",
    default_owner_id: row?.default_owner_id ?? "",
    due_day: row?.due_day ? String(row.due_day) : "",
    notes: row?.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const type = data.deliverableTypes.find((t) => t.code === f.deliverable_type);
  const isTask = type ? !type.is_content : false;
  const qty = Number(f.quantity);
  const generated = row ? data.deliverables.filter((d) => d.scope_line_id === row.id && d.month >= thisMonth).length : 0;

  function onSubmit() {
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) return setError("Quantity must be between 1 and 100");
    const day = qty === 1 && f.due_day.trim() ? Number(f.due_day) : null;
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return setError("The due day must be between 1 and 31");
    void submit(
      "scopeLines",
      {
        id: row?.id ?? newId(),
        retainer_id: retainerId,
        deliverable_type: f.deliverable_type,
        quantity_per_month: qty,
        platform: isTask ? null : f.platform || null,
        default_owner_id: f.default_owner_id || null,
        due_day: day,
        notes: orNull(f.notes),
      },
      row ? "Scope saved" : "Added to the monthly scope",
    );
  }

  return (
    <SheetForm
      title={row ? "Edit scope line" : "Add to monthly scope"}
      description="What happens for this client every month: content they buy, and recurring tasks like the report or the content calendar. Each line is created with the month."
      onClose={onDone}
      onSubmit={onSubmit}
      onDelete={row ? () => void destroy("scopeLines", row.id, "Removed from scope") : undefined}
      deleteLabel="Remove"
      saving={saving}
      error={error}
      submitLabel={row ? "Save" : "Add"}
    >
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Type">
          <select
            value={f.deliverable_type}
            onChange={(e) => {
              const code = e.target.value as DeliverableTypeCode;
              const next = data.deliverableTypes.find((t) => t.code === code);
              setF((x) => ({ ...x, deliverable_type: code, quantity: next && !next.is_content && x.quantity === "4" && !row ? "1" : x.quantity }));
            }}
            className={control}
          >
            <optgroup label="Content">
              {data.deliverableTypes.filter((t) => t.is_content).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name_en}
                </option>
              ))}
            </optgroup>
            <optgroup label="Recurring tasks">
              {data.deliverableTypes.filter((t) => !t.is_content).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name_en}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Per month">
          <Input value={f.quantity} onChange={(e) => set("quantity", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="num" />
        </Field>
      </div>
      {qty === 1 ? (
        <Field label="Due on day" hint="Of the month, e.g. 3 for the report, 20 for next month's calendar. Moves to the next working day when needed. Empty = mid-month.">
          <Input value={f.due_day} onChange={(e) => set("due_day", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="e.g. 20" className="num" />
        </Field>
      ) : (
        <p className="text-[12px] text-muted">More than one a month: they&apos;re spread evenly over the working days{qty === 4 ? " (about one a week)" : ""}.</p>
      )}
      {!isTask ? (
        <Field label="Platform">
          <Select value={f.platform} onChange={(v) => set("platform", v)} options={PLATFORM_OPTIONS} />
        </Field>
      ) : null}
      <Field label={isTask ? "Usually done by" : "Usually made by"} hint="Empty = the client's account lead">
        <Select
          value={f.default_owner_id}
          onChange={(v) => set("default_owner_id", v)}
          options={[{ value: "", label: "The account lead" }, ...data.team.filter((m) => m.is_active).map((m) => ({ value: m.id, label: m.full_name }))]}
        />
      </Field>
      <Field label="Notes">
        <TextArea
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder={isTask ? "e.g. send as PDF to the marketing manager" : "e.g. one of the reels is always a product feature"}
        />
      </Field>
      {type && Number.isInteger(qty) && qty > 0 ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          {qty} × {type.name_en} = <span className="font-medium text-ink num">{qty * type.effort_points} pts</span> a month.
          {row && generated ? ` Changes apply to months not generated yet; ${formatMonth(thisMonth)} already has ${generated}.` : ""}
        </p>
      ) : null}
    </SheetForm>
  );
}

// ---------------------------------------------------------------------------
// Project (campaign)
// ---------------------------------------------------------------------------
const PROJECT_STATUS: { value: ProjectStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function ProjectForm({ clientId, row, onDone }: { clientId?: string; row?: Project; onDone: () => void }) {
  const { data, role } = useNumu();
  const { saving, error, setError, submit, destroy } = useSubmit(onDone);
  const clients = data.clients.filter((c) => c.status !== "ended" || c.id === (row?.client_id ?? clientId));
  const [f, setF] = useState({
    client_id: row?.client_id ?? clientId ?? clients[0]?.id ?? "",
    name_en: row?.name_en ?? "",
    name_ar: row?.name_ar ?? "",
    status: row?.status ?? ("planned" as ProjectStatus),
    fee: moneyText(row?.fixed_fee_minor),
    currency: (row?.currency ?? "QAR") as "QAR" | "USD",
    start_date: row?.start_date ?? "",
    deadline: row?.deadline ?? "",
    notes: row?.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function onSubmit() {
    if (!f.client_id) return setError("Add the client first");
    if (!f.name_en.trim()) return setError("Name the campaign");
    const fee = parseMoney(f.fee || "0");
    if (fee === null) return setError("Enter the fee as a number, e.g. 30000");
    if (f.start_date && f.deadline && f.deadline < f.start_date) return setError("The deadline must be after the start");
    const id = row?.id ?? newId();
    void submit(
      "projects",
      {
        id,
        client_id: f.client_id,
        name_en: f.name_en.trim(),
        name_ar: orNull(f.name_ar),
        status: f.status,
        fixed_fee_minor: fee,
        currency: f.currency,
        start_date: f.start_date || null,
        deadline: f.deadline || null,
        notes: orNull(f.notes),
      },
      row ? "Campaign saved" : "Campaign added. Add its deliverables and tasks with New task",
      undefined,
      { label: "Open", href: `/deliverables?project=${id}` },
    );
  }

  return (
    <SheetForm
      title={row ? "Edit campaign" : "New campaign"}
      description="A one-off project: a fixed fee, a deliverable list and a deadline."
      onClose={onDone}
      onSubmit={onSubmit}
      onDelete={row && role === "partner" ? () => void destroy("projects", row.id, "Campaign deleted") : undefined}
      saving={saving}
      error={error}
      submitLabel={row ? "Save" : "Add campaign"}
    >
      {!clientId || row ? (
        <Field label="Client">
          <Select
            value={f.client_id}
            onChange={(v) => set("client_id", v)}
            options={clients.length ? clients.map((c) => ({ value: c.id, label: c.name_en })) : [{ value: "", label: "No clients yet" }]}
            disabled={Boolean(row)}
          />
        </Field>
      ) : null}
      <Field label="Name (English)">
        <Input value={f.name_en} onChange={(e) => set("name_en", e.target.value)} placeholder="e.g. National Day campaign" autoFocus />
      </Field>
      <Field label="Name (Arabic)">
        <Input value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} dir="rtl" lang="ar" />
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Fixed fee">
          <Input value={f.fee} onChange={(e) => set("fee", e.target.value)} inputMode="decimal" placeholder="30000" className="num" />
        </Field>
        <Field label="Currency">
          <Select value={f.currency} onChange={(v) => set("currency", v)} options={CURRENCIES} />
        </Field>
      </div>
      <Field label="Status">
        <Select value={f.status} onChange={(v) => set("status", v)} options={PROJECT_STATUS} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        <Field label="Deadline">
          <Input type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} min={f.start_date || undefined} />
        </Field>
      </div>
      <Field label="Notes">
        <TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </SheetForm>
  );
}

// ---------------------------------------------------------------------------
// Team member (partners only)
// ---------------------------------------------------------------------------
const ROLES: { value: AccessLevel; label: string }[] = [
  { value: "creator", label: "Creator: makes content, moves cards, no fees" },
  { value: "account_lead", label: "Account lead: clients, scope, sign-off" },
  { value: "partner", label: "Partner: everything" },
];
const EMPLOYMENT: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "freelance", label: "Freelance" },
];

function MemberForm({ row, onDone }: { row?: TeamMember; onDone: () => void }) {
  const { me, isDemo } = useNumu();
  const { saving, error, setError, submit, destroy } = useSubmit(onDone);
  const isMe = row?.id === me.id;
  const [f, setF] = useState({
    full_name: row?.full_name ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    job_title: row?.job_title ?? "",
    access_level: row?.access_level ?? ("creator" as AccessLevel),
    employment: row?.employment ?? ("full_time" as EmploymentType),
    capacity: row ? String(row.weekly_capacity_points) : "",
    is_active: row?.is_active ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function onSubmit() {
    if (!f.full_name.trim()) return setError("Add their name");
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+$/.test(f.email.trim())) return setError("That email doesn't look right");
    const capacity = f.capacity.trim() ? Number(f.capacity) : 0;
    if (!Number.isInteger(capacity) || capacity < 0) return setError("Capacity is a whole number of points");
    void submit(
      "team",
      {
        id: row?.id ?? newId(),
        user_id: row?.user_id ?? null,
        full_name: f.full_name.trim(),
        email: orNull(f.email.toLowerCase()),
        phone: orNull(f.phone.replace(/[^\d+]/g, "")),
        job_title: orNull(f.job_title),
        access_level: f.access_level,
        employment: f.employment,
        weekly_capacity_points: capacity,
        is_active: f.is_active,
        // New people get their role's defaults (the database sets them too); partners change them in Permissions.
        can_create_tasks: row?.can_create_tasks ?? true,
        can_send_to_client: row?.can_send_to_client ?? f.access_level !== "creator",
        can_approve: row?.can_approve ?? f.access_level === "partner",
        // Theirs to choose (Settings, or the first sign-in screen); not written from here.
        username: row?.username ?? null,
        credentials_set_at: row?.credentials_set_at ?? null,
      },
      row ? "Saved" : `${f.full_name.trim()} added`,
    );
  }

  return (
    <SheetForm
      title={row ? `Edit ${row.full_name}` : "Add a team member"}
      description={
        isDemo
          ? undefined
          : row?.user_id
            ? "Can sign in."
            : "To let them sign in, create a login with this exact email in Supabase (Authentication → Users). It links by email."
      }
      onClose={onDone}
      onSubmit={onSubmit}
      onDelete={row && !isMe ? () => void destroy("team", row.id, "Removed from the team") : undefined}
      deleteLabel="Remove"
      saving={saving}
      error={error}
      submitLabel={row ? "Save" : "Add"}
    >
      <Field label="Name">
        <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} autoFocus />
      </Field>
      <Field label="Login email">
        <Input value={f.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" placeholder="name@numu.test" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job title">
          <Input value={f.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="e.g. Video editor" />
        </Field>
        <Field label="WhatsApp">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="+974…" />
        </Field>
      </div>
      <Field label="Role" hint={isMe ? "You can't change your own role" : undefined}>
        <Select value={f.access_level} onChange={(v) => set("access_level", v)} options={ROLES} disabled={isMe} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Works">
          <Select value={f.employment} onChange={(v) => set("employment", v)} options={EMPLOYMENT} />
        </Field>
        <Field label="Points a week" hint="Reel 3, Static 1, Long video 5…">
          <Input value={f.capacity} onChange={(e) => set("capacity", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 20" className="num" />
        </Field>
      </div>
      <Check
        checked={f.is_active}
        onChange={(v) => set("is_active", v)}
        disabled={isMe}
        label="Active"
        hint="Inactive people can't sign in and don't get new work, but their history stays"
      />
      {row?.user_id && !isMe ? <LoginSetup member={row} onDone={onDone} /> : null}
    </SheetForm>
  );
}

/**
 * How someone signs in, and a way to make them choose a new username and
 * password next time (e.g. after resetting their password in Supabase).
 */
function LoginSetup({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const { askToSetUpAgain, notify } = useNumu();
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border border-line px-3 py-2.5 text-[13px]">
      <p className="font-medium">Sign-in</p>
      <p className="mt-0.5 text-[12px] text-muted">
        {member.credentials_set_at
          ? `Signs in as @${member.username ?? "…"} with a password they chose.`
          : "Will choose their own username and password the next time they sign in."}
      </p>
      {member.credentials_set_at ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await askToSetUpAgain(member.id);
            setBusy(false);
            if (!r.ok) return notify(r.reason, "error");
            notify(`${member.full_name} will choose a new username and password next time`, "success");
            onDone();
          }}
          className="mt-2 text-[12.5px] font-medium text-focus hover:underline disabled:opacity-50"
        >
          Ask them to choose a new one next sign-in
        </button>
      ) : null}
      <p className="mt-1.5 text-[11.5px] text-faint">
        Forgot their password? Set a temporary one in Supabase (Authentication → Users), then ask them to choose a new one here.
      </p>
    </div>
  );
}
