// Generated from the Supabase project (public schema), trimmed to what the app
// uses: tables, the generator RPC and enums. Regenerate after a migration
// (Supabase MCP generate_typescript_types, or `supabase gen types typescript`).
// Relationships are left empty: the app does not use embedded joins.

type Enums = {
  access_level: "partner" | "account_lead" | "creator";
  client_status: "active" | "paused" | "ended";
  deliverable_status:
    | "planned"
    | "scripting"
    | "shooting"
    | "editing"
    | "internal_review"
    | "client_review"
    | "approved"
    | "scheduled"
    | "posted"
    | "done";
  employment_type: "full_time" | "part_time" | "freelance";
  language_code: "ar" | "en";
  platform: "instagram" | "tiktok" | "snapchat" | "youtube" | "x" | "linkedin" | "facebook";
  project_status: "planned" | "active" | "delivered" | "cancelled";
  retainer_status: "draft" | "active" | "paused" | "ended";
};

/** Row type -> Insert type: columns with database defaults become optional. */
type Table<Row, Optional extends keyof Row> = {
  Row: Row;
  Insert: Omit<Row, Optional> & Partial<Pick<Row, Optional>>;
  Update: Partial<Row>;
  Relationships: [];
};

type Stamps = { created_at: string; updated_at: string };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      deliverable_types: Table<
        { code: string; name_en: string; name_ar: string; effort_points: number; sort_order: number; is_content: boolean },
        "sort_order" | "is_content"
      >;
      team_members: Table<
        {
          id: string;
          user_id: string | null;
          full_name: string;
          email: string | null;
          phone: string | null;
          job_title: string | null;
          access_level: Enums["access_level"];
          employment: Enums["employment_type"];
          weekly_capacity_points: number;
          is_active: boolean;
        } & Stamps,
        | "id"
        | "user_id"
        | "email"
        | "phone"
        | "job_title"
        | "access_level"
        | "employment"
        | "weekly_capacity_points"
        | "is_active"
        | keyof Stamps
      >;
      clients: Table<
        {
          id: string;
          name_en: string;
          name_ar: string | null;
          industry: string | null;
          status: Enums["client_status"];
          account_lead_id: string | null;
          brand_kit_url: string | null;
          drive_folder_url: string | null;
        } & Stamps,
        "id" | "name_ar" | "industry" | "status" | "account_lead_id" | "brand_kit_url" | "drive_folder_url" | keyof Stamps
      >;
      contacts: Table<
        {
          id: string;
          client_id: string;
          user_id: string | null;
          full_name: string;
          job_title: string | null;
          phone: string | null;
          email: string | null;
          is_approver: boolean;
          preferred_language: Enums["language_code"];
        } & Stamps,
        "id" | "user_id" | "job_title" | "phone" | "email" | "is_approver" | "preferred_language" | keyof Stamps
      >;
      retainers: Table<
        {
          id: string;
          client_id: string;
          status: Enums["retainer_status"];
          start_date: string;
          end_date: string | null;
          monthly_fee_minor: number;
          currency: string;
          billing_day: number | null;
          notes: string | null;
        } & Stamps,
        "id" | "status" | "end_date" | "currency" | "billing_day" | "notes" | keyof Stamps
      >;
      scope_lines: Table<
        {
          id: string;
          retainer_id: string;
          deliverable_type: string;
          quantity_per_month: number;
          platform: Enums["platform"] | null;
          default_owner_id: string | null;
          due_day: number | null;
          notes: string | null;
        } & Stamps,
        "id" | "platform" | "default_owner_id" | "due_day" | "notes" | keyof Stamps
      >;
      projects: Table<
        {
          id: string;
          client_id: string;
          name_en: string;
          name_ar: string | null;
          status: Enums["project_status"];
          fixed_fee_minor: number;
          currency: string;
          start_date: string | null;
          deadline: string | null;
          notes: string | null;
        } & Stamps,
        "id" | "name_ar" | "status" | "currency" | "start_date" | "deadline" | "notes" | keyof Stamps
      >;
      deliverables: Table<
        {
          id: string;
          client_id: string;
          retainer_id: string | null;
          scope_line_id: string | null;
          project_id: string | null;
          deliverable_type: string;
          title: string;
          month: string;
          seq: number | null;
          platform: Enums["platform"] | null;
          owner_id: string | null;
          due_date: string;
          post_date: string | null;
          status: Enums["deliverable_status"];
          revision_count: number;
          effort_points: number;
          script_url: string | null;
          raw_url: string | null;
          final_url: string | null;
          post_url: string | null;
          posted_at: string | null;
        } & Stamps,
        | "id"
        | "retainer_id"
        | "scope_line_id"
        | "project_id"
        | "seq"
        | "platform"
        | "owner_id"
        | "post_date"
        | "status"
        | "revision_count"
        | "script_url"
        | "raw_url"
        | "final_url"
        | "post_url"
        | "posted_at"
        | keyof Stamps
      >;
      status_events: {
        Row: {
          id: number;
          deliverable_id: string;
          from_status: Enums["deliverable_status"] | null;
          to_status: Enums["deliverable_status"];
          changed_by_team_member_id: string | null;
          changed_by_contact_id: string | null;
          changed_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      comments: Table<
        {
          id: string;
          deliverable_id: string;
          author_team_member_id: string | null;
          author_contact_id: string | null;
          body: string;
          is_internal: boolean;
        } & Stamps,
        "id" | "author_team_member_id" | "author_contact_id" | "is_internal" | keyof Stamps
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      generate_month_deliverables: {
        Args: { p_month?: string; p_retainer_id?: string };
        Returns: number;
      };
    };
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
};
