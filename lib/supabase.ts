// The browser's Supabase client. Only the public URL and publishable key reach
// the browser; every read and write goes through row-level security as the
// signed-in person. The service role key is never used by the app.
//
// Without these two env vars (local development, tests) the app runs on demo
// data instead and sign-in is off.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

export type Supabase = SupabaseClient<Database>;

let client: Supabase | null = null;

export function supabase(): Supabase {
  if (!url || !key) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  client ??= createClient<Database>(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "numu.auth" },
  });
  return client;
}
