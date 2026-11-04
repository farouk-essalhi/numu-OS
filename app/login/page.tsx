"use client";

import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Suspense, useActionState, useState } from "react";
import { Logo } from "@/components/shell/app-shell";
import { signIn, type SignInState } from "./actions";

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface-2 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Logo size={34} />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">NUMU OS</p>
            <p className="text-[12.5px] text-muted">Content agency · Doha</p>
          </div>
        </div>
        <div className="max-w-[440px]">
          <p className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
            Retainers, deliverables, approvals and money in one place.
          </p>
          <ul className="mt-8 space-y-3 text-[14px] text-ink-2">
            {[
              "Every retainer turns into its month of deliverables on the 25th",
              "Sign-off and client approvals in one queue, not five WhatsApp threads",
              "See what's late, who has room and how each client is doing",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-muted">نمو · growth</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={34} />
            <p className="text-[16px] font-semibold">NUMU OS</p>
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1 text-[14px] text-muted">Use the email and password NUMU gave you.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

const field =
  "h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[14px] text-ink shadow-sm outline-none placeholder:text-faint focus:border-focus focus:ring-2 focus:ring-focus/20";

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null, email: "" });
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-7 space-y-4">
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Email</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} placeholder="name@numu.test" className={field} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Password</span>
        <span className="relative block">
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required className={`${field} pr-11`} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>
      {state.error ? (
        <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-critical">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-ink shadow-sm hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Sign in
      </button>
      <p className="text-center text-[12.5px] text-muted">Forgot it? Ask Farouk or Ali to reset it.</p>
    </form>
  );
}
