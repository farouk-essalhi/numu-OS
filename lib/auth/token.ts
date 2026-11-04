// Signed session tokens: base64url(payload).base64url(HMAC-SHA256(payload)).
// Web Crypto only, so the same code runs in the proxy and on the server.

export const SESSION_COOKIE = "numu_session";
export const SESSION_DAYS = 30;

export interface SessionPayload {
  /** team_members.id */
  sub: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Sign-in is on when both secrets are configured (on Netlify). Off locally. */
export function authConfig(): { accounts: string; secret: string } | null {
  const accounts = process.env.NUMU_ACCOUNTS;
  const secret = process.env.NUMU_SESSION_SECRET;
  return accounts && secret ? { accounts, secret } : null;
}
