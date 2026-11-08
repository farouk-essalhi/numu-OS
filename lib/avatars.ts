// Avatar colours. Kept out of components/ so tests can import it.

/** Clearly different pastel hues, so two people never look alike. */
export const AVATAR_TINTS = [
  "#f3d3c2", // peach
  "#c8e6cc", // mint
  "#c9d9f5", // blue
  "#f1e1a3", // yellow
  "#e2cdf2", // lilac
  "#bfe3e3", // teal
  "#f5c7c7", // rose
  "#dfe3b0", // olive
];

export function hashOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * One colour per person: each team member gets their own tint (their name's
 * usual tint, or the next free one if a teammate already has it), so Rand and
 * Ruba never look alike. Same colour on every screen.
 */
export function avatarTints(names: string[]): Map<string, string> {
  const taken = new Set<number>();
  const out = new Map<string, string>();
  for (const name of [...names].sort()) {
    let i = hashOf(name) % AVATAR_TINTS.length;
    for (let tries = 0; taken.has(i) && tries < AVATAR_TINTS.length; tries++) i = (i + 1) % AVATAR_TINTS.length;
    taken.add(i);
    out.set(name, AVATAR_TINTS[i]);
  }
  return out;
}

