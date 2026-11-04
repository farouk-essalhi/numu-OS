import "server-only";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { authConfig, SESSION_COOKIE, verifySession } from "./token";

/**
 * Interim sign-in until the Supabase project exists (docs/decisions.md #30).
 * NUMU_ACCOUNTS (Netlify env var, never in the repo) holds, per person:
 * { email, memberId, salt, hash } where hash = scrypt(password, salt, 32) in hex.
 */
interface Account {
  email: string;
  memberId: string;
  salt: string;
  hash: string;
}

function accounts(raw: string): Account[] {
  try {
    const list = JSON.parse(raw) as Account[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function checkPassword(email: string, password: string): string | null {
  const config = authConfig();
  if (!config) return null;
  const account = accounts(config.accounts).find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  // Always run scrypt so unknown emails take as long as wrong passwords.
  const salt = account?.salt ?? "0000000000000000";
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(account?.hash ?? "00".repeat(32), "hex");
  if (!account || expected.length !== actual.length) return null;
  return timingSafeEqual(actual, expected) ? account.memberId : null;
}

/** The signed-in team member's id, or null (also null when sign-in is off). */
export async function currentMemberId(): Promise<string | null> {
  // Read the cookie before anything else: that makes this render per request.
  // Checking the env first would let Next prerender a "nobody signed in"
  // result at build time (when the secrets aren't set) and serve it to all.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const config = authConfig();
  if (!config) return null;
  const session = await verifySession(token, config.secret);
  return session?.sub ?? null;
}
