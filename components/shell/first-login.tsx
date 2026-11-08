"use client";

import { Check, Eye, EyeOff, LoaderCircle, LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { firstName } from "@/lib/format";
import { normalizeUsername, PASSWORD_HINT, passwordProblem, USERNAME_HINT, usernameProblem } from "@/lib/logins";
import type { Result } from "@/lib/store";
import type { TeamMember } from "@/lib/types";
import { Logo } from "./app-shell";

export interface LoginActions {
  /** Whether someone else already has this username. */
  isTaken: (username: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<Result>;
  setUsername: (username: string) => Promise<Result>;
  signOut: () => void;
}

const field =
  "h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[14px] text-ink shadow-sm outline-none placeholder:text-faint focus:border-focus focus:ring-2 focus:ring-focus/20";

/**
 * First sign-in: before anything else, choose a username and a password only
 * you know. Shown again if a partner asks (Team → People → Sign-in).
 */
export function FirstLogin({
  member,
  email,
  actions,
  onDone,
}: {
  member: TeamMember;
  email: string;
  actions: LoginActions;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(member.username ?? firstName(member.full_name).toLowerCase());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // If the password went through but the username didn't (taken a second ago), don't ask for the password again.
  const [passwordSaved, setPasswordSaved] = useState(false);

  const nameIssue = username ? usernameProblem(username) : null;
  const pwIssue = password ? passwordProblem(password.trim(), username) : null;
  const mismatch = confirm && password.trim() !== confirm.trim() ? "The two passwords are different" : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = normalizeUsername(username);
    const pw = password.trim();
    const problem =
      usernameProblem(name) ?? (passwordSaved ? null : (passwordProblem(pw, name) ?? (pw !== confirm.trim() ? "The two passwords are different" : null)));
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (name !== member.username && (await actions.isTaken(name))) return setError("That username is taken. Try another");
      if (!passwordSaved) {
        const r = await actions.setPassword(pw);
        if (!r.ok) return setError(r.reason);
        setPasswordSaved(true);
      }
      const r = await actions.setUsername(name);
      if (!r.ok) return setError(r.reason);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-in grid min-h-dvh place-items-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-[400px]">
        <Logo size={34} />
        <h1 className="mt-8 text-[24px] font-semibold tracking-[-0.02em]">Welcome, {firstName(member.full_name)}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          Choose a username and a password only you know. You&apos;ll sign in with these from now on, on every device.
        </p>

        <div className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className={field}
              aria-invalid={Boolean(nameIssue)}
            />
            <span className={`mt-1 block text-[12px] ${nameIssue ? "text-critical" : "text-muted"}`}>{nameIssue ?? USERNAME_HINT}</span>
          </label>

          {passwordSaved ? (
            <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]">
              <Check className="size-4 text-[var(--good)]" /> Your new password is saved.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-2">New password</span>
                <span className="relative block">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`${field} pr-11`}
                    aria-invalid={Boolean(pwIssue)}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
                <span className={`mt-1 block text-[12px] ${pwIssue ? "text-critical" : "text-muted"}`}>{pwIssue ?? PASSWORD_HINT}</span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Type it again</span>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={field}
                  aria-invalid={Boolean(mismatch)}
                />
                {mismatch ? <span className="mt-1 block text-[12px] text-critical">{mismatch}</span> : null}
              </label>
            </>
          )}

          {error ? (
            <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-critical">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-ink shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Save and continue
          </button>
          <p className="text-center text-[12.5px] text-muted">
            Signed in as {email}.{" "}
            <button type="button" onClick={actions.signOut} className="inline-flex items-center gap-1 font-medium text-ink hover:underline">
              <LogOut className="size-3.5" /> Not you?
            </button>
          </p>
        </div>
      </form>
    </main>
  );
}
