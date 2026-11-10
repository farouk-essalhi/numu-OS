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

const STORAGE_KEY = "numu.auth";

let client: Supabase | null = null;

export function supabase(): Supabase {
  if (!url || !key) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  client ??= createClient<Database>(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: STORAGE_KEY },
  });
  return client;
}

/**
 * Who this browser is signed in as, read from the saved sign-in without
 * waiting for the network. The sign-in itself may have run out (it is renewed
 * on the next request); use this only to decide what to show first.
 */
export function savedUser(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const user = (JSON.parse(raw) as { user?: { id?: unknown; email?: unknown } } | null)?.user;
    if (!user || typeof user.id !== "string") return null;
    return { id: user.id, email: typeof user.email === "string" ? user.email : "" };
  } catch {
    return null;
  }
}
