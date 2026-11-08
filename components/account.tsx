"use client";

import { AtSign, Eye, EyeOff, KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { normalizeUsername, PASSWORD_HINT, passwordProblem, USERNAME_HINT, usernameProblem } from "@/lib/logins";
import { useNumu } from "@/lib/store";
import { control } from "./forms";
import { Button, Card, CardHeader } from "./ui";

/** Settings → Account: your username, your password, sign out. */
export function AccountCard() {
  const { me, signedIn, signOut } = useNumu();
  const [open, setOpen] = useState<"username" | "password" | null>(null);

  return (
    <Card>
      <CardHeader title="Account" subtitle={signedIn ? `Signed in as ${me.username ? `@${me.username}` : me.email}` : "How you sign in"} />
      <div className="divide-y divide-line border-t border-line">
        <Line icon={<AtSign />} label="Username" value={me.username ? `@${me.username}` : "Not chosen yet"}>
          <Button size="sm" onClick={() => setOpen(open === "username" ? null : "username")}>
            {open === "username" ? "Cancel" : "Change"}
          </Button>
        </Line>
        {open === "username" ? <UsernameForm onDone={() => setOpen(null)} /> : null}
        <Line icon={<KeyRound />} label="Password" value="••••••••">
          <Button size="sm" onClick={() => setOpen(open === "password" ? null : "password")}>
            {open === "password" ? "Cancel" : "Change"}
          </Button>
        </Line>
        {open === "password" ? <PasswordForm onDone={() => setOpen(null)} /> : null}
        {signedIn ? (
          <div className="px-4 py-3 sm:px-5">
            <Button onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Line({ icon, label, value, children }: { icon: ReactNode; label: string; value: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="text-muted [&>svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-muted">{label}</span>
        <span className="block truncate text-[13.5px] font-medium">{value}</span>
      </span>
      {children}
    </div>
  );
}

function UsernameForm({ onDone }: { onDone: () => void }) {
  const { me, setMyUsername, notify } = useNumu();
  const [value, setValue] = useState(me.username ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issue = value ? usernameProblem(value) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = usernameProblem(value);
    if (problem) return setError(problem);
    if (normalizeUsername(value) === me.username) return onDone();
    setBusy(true);
    const r = await setMyUsername(value);
    setBusy(false);
    if (!r.ok) return setError(r.reason);
    notify(`You now sign in as @${normalizeUsername(value)}`, "success");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-2 bg-surface-2/60 px-4 py-3 sm:px-5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="New username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        className={control}
      />
      <p className={`text-[12px] ${issue || error ? "text-critical" : "text-muted"}`}>{error ?? issue ?? USERNAME_HINT}</p>
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : null} Save username
      </Button>
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { me, setMyPassword, notify } = useNumu();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issue = pw ? passwordProblem(pw.trim(), me.username ?? undefined) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(pw.trim(), me.username ?? undefined) ?? (pw.trim() !== again.trim() ? "The two passwords are different" : null);
    if (problem) return setError(problem);
    setBusy(true);
    const r = await setMyPassword(pw.trim());
    setBusy(false);
    if (!r.ok) return setError(r.reason);
    notify("Password changed. Use it next time you sign in", "success");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-2 bg-surface-2/60 px-4 py-3 sm:px-5">
      <span className="relative block">
        <input
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          type={show ? "text" : "password"}
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          className={`${control} pr-11`}
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
      <input
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        type={show ? "text" : "password"}
        aria-label="Type it again"
        placeholder="Type it again"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={control}
      />
      <p className={`text-[12px] ${issue || error ? "text-critical" : "text-muted"}`}>{error ?? issue ?? PASSWORD_HINT}</p>
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : null} Save password
      </Button>
    </form>
  );
}
