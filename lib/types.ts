// Types that mirror the database (supabase/migrations). Keep in sync with
// docs/schema.md. Dates are ISO calendar dates ("2026-11-05", Doha time) and
// timestamps are ISO strings, exactly as Supabase returns them.

export type AccessLevel = "partner" | "account_lead" | "creator";
export type EmploymentType = "full_time" | "part_time" | "freelance";
export type ClientStatus = "active" | "paused" | "ended";
export type RetainerStatus = "draft" | "active" | "paused" | "ended";
export type ProjectStatus = "planned" | "active" | "delivered" | "cancelled";
export type LanguageCode = "ar" | "en";

export type DeliverableStatus =
  | "planned"
  | "scripting"
  | "shooting"
  | "editing"
  | "internal_review"
  | "client_review"
  | "approved"
  | "scheduled"
  | "posted"
  | "done"; // tasks only

export type Platform =
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube"
  | "x"
  | "linkedin"
  | "facebook";

export type DeliverableTypeCode =
  | "reel"
  | "static_post"
  | "carousel"
  | "story_set"
  | "long_video"
  | "shoot_day"
  | "ad_set"
  | "influencer_post"
  // Tasks: work that isn't content (to do or done)
  | "follow_up"
  | "content_calendar"
  | "report"
  | "meeting"
  | "task";

export type IsoDate = string; // "YYYY-MM-DD"
export type IsoTimestamp = string;

export interface DeliverableType {
  code: DeliverableTypeCode;
  name_en: string;
  name_ar: string;
  effort_points: number;
  sort_order: number;
  /** false = a task (to do or done), not content. */
  is_content: boolean;
}

export interface TeamMember {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  access_level: AccessLevel;
  employment: EmploymentType;
  weekly_capacity_points: number;
  is_active: boolean;
  /** Permissions partners set per person (Team → Permissions). */
  can_create_tasks: boolean;
  can_send_to_client: boolean;
  can_approve: boolean;
}

export interface Client {
  id: string;
  name_en: string;
  name_ar: string | null;
  industry: string | null;
  status: ClientStatus;
  account_lead_id: string | null;
  brand_kit_url: string | null;
  drive_folder_url: string | null;
}

export interface Contact {
  id: string;
  client_id: string;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  email: string | null;
  is_approver: boolean;
  preferred_language: LanguageCode;
}

export interface Retainer {
  id: string;
  client_id: string;
  status: RetainerStatus;
  start_date: IsoDate;
  end_date: IsoDate | null;
  monthly_fee_minor: number;
  currency: string;
  billing_day: number | null;
  notes: string | null;
}

export interface ScopeLine {
  id: string;
  retainer_id: string;
  deliverable_type: DeliverableTypeCode;
  quantity_per_month: number;
  platform: Platform | null;
  default_owner_id: string | null;
  /** Day of the month it's due (quantity 1 only); null = spread evenly. */
  due_day: number | null;
  notes: string | null;
}

export interface Project {
  id: string;
  client_id: string;
  name_en: string;
  name_ar: string | null;
  status: ProjectStatus;
  fixed_fee_minor: number;
  currency: string;
  start_date: IsoDate | null;
  deadline: IsoDate | null;
  notes: string | null;
}

export interface Deliverable {
  id: string;
  client_id: string;
  retainer_id: string | null;
  scope_line_id: string | null;
  project_id: string | null;
  deliverable_type: DeliverableTypeCode;
  title: string;
  month: IsoDate;
  seq: number | null;
  platform: Platform | null;
  owner_id: string | null;
  due_date: IsoDate;
  post_date: IsoDate | null;
  status: DeliverableStatus;
  revision_count: number;
  effort_points: number;
  script_url: string | null;
  raw_url: string | null;
  final_url: string | null;
  post_url: string | null;
  posted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

export interface StatusEvent {
  id: number;
  deliverable_id: string;
  from_status: DeliverableStatus | null;
  to_status: DeliverableStatus;
  changed_by_team_member_id: string | null;
  changed_by_contact_id: string | null;
  changed_at: IsoTimestamp;
}

export interface Comment {
  id: string;
  deliverable_id: string;
  author_team_member_id: string | null;
  author_contact_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: IsoTimestamp;
}

/** Everything the app reads. One object so the data source can be swapped. */
export interface Dataset {
  deliverableTypes: DeliverableType[];
  team: TeamMember[];
  clients: Client[];
  contacts: Contact[];
  retainers: Retainer[];
  scopeLines: ScopeLine[];
  projects: Project[];
  deliverables: Deliverable[];
  statusEvents: StatusEvent[];
  comments: Comment[];
}
