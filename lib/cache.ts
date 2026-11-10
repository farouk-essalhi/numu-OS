// A copy of the last loaded data, kept in this browser so NUMU OS opens at
// once and then catches up (decision 51). It holds only what this person was
// already allowed to load, is kept per login, and is wiped on sign-out, when
// the session is gone, and when the person is no longer on the team. The
// browser already keeps the sign-in that can load the same data, so this adds
// nothing an attacker on the device couldn't get anyway.

import type { Dataset } from "./types";

// Bump when the shape of Dataset changes, so an old copy is never read into new code.
const VERSION = 1;
const PREFIX = "numu.cache.";
const key = (userId: string) => `${PREFIX}v${VERSION}.${userId}`;
const MAX_CHARS = 3_000_000; // stay well inside the browser's ~5 MB allowance
const MAX_AGE_MS = 3 * 86_400_000; // older than this, wait for fresh data instead

export function readCache(userId: string): { at: number; data: Dataset } | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: unknown; data?: Dataset };
    if (typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) return null;
    if (!saved.data || !Array.isArray(saved.data.team) || !Array.isArray(saved.data.deliverables)) return null;
    return { at: saved.at, data: saved.data };
  } catch {
    return null;
  }
}

export function writeCache(userId: string, data: Dataset): void {
  try {
    const raw = JSON.stringify({ at: Date.now(), data });
    if (raw.length > MAX_CHARS) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), raw);
  } catch {
    // Private mode or storage full: the app just loads from the network.
  }
}

// Saving is put off until the browser has a quiet moment, so it never gets in
// the way of a tap or a drag; only the latest data is kept.
let queued: { userId: string; data: Dataset } | null = null;

export function writeCacheSoon(userId: string, data: Dataset): void {
  const waiting = queued !== null;
  queued = { userId, data };
  if (waiting) return;
  const run = () => {
    const q = queued;
    queued = null;
    if (q) writeCache(q.userId, q.data);
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 300);
}

/** Remove every saved copy (any login, any version). */
export function clearCache(): void {
  queued = null;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // nothing to clear
  }
}
