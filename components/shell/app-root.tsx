"use client";

import { LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { use, useEffect, type ReactNode } from "react";
import { browser } from "react-dom";
import { Button } from "@/components/ui";
import { AppShell, Logo } from "./app-shell";
import { ShellSkeleton } from "./skeleton";
import { liveBoot, NumuProvider, supabaseConfigured } from "@/lib/store";
import { supabase } from "@/lib/supabase";

/**
 * The signed-in app. Everything depends on who is looking and on today's date
 * in Doha, so it renders in the browser (behind a static skeleton). With
 * Supabase configured, this is also the sign-in guard: no session = /login.
 * Data only ever comes from Supabase through row-level security, so the
 * skeleton and the app's code carry nothing private.
 */
export function AppRoot({ children }: { children: ReactNode }) {
  use(browser("NUMU OS renders per person and per day, in the browser."));
  if (!supabaseConfigured) {
    return (
      <NumuProvider>
        <AppShell>{children}</AppShell>
      </NumuProvider>
    );
  }
  return <LiveRoot>{children}</LiveRoot>;
}

function LiveRoot({ children }: { children: ReactNode }) {
  const boot = use(liveBoot());

  useEffect(() => {
    if (boot.kind === "signed_out") {
      const next = location.pathname + location.search;
      location.replace(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
    }
  }, [boot.kind]);

  useEffect(() => {
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") location.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (boot.kind === "signed_out") return <ShellSkeleton />;
  if (boot.kind === "no_member") {
    return (
      <Notice
        icon={<ShieldAlert className="size-5" />}
        title="Your login isn't linked to the team yet"
        body={
          <>
            You signed in as <b className="text-ink">{boot.email || "this account"}</b>, but there is no active team member with that email. Ask
            Farouk or Ali to add you in Team, using exactly this email.
          </>
        }
        action={
          <Button
            onClick={async () => {
              await supabase().auth.signOut();
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              location.assign("/login");
            }}
          >
            <LogOut /> Sign out
          </Button>
        }
      />
    );
  }
  if (boot.kind === "error") {
    return (
      <Notice
        icon={<RefreshCw className="size-5" />}
        title="Couldn't load NUMU OS"
        body={<>Check your connection and try again. ({boot.message})</>}
        action={
          <Button variant="primary" onClick={() => location.reload()}>
            <RefreshCw /> Try again
          </Button>
        }
      />
    );
  }
  return (
    <NumuProvider live={{ data: boot.data, meId: boot.meId }}>
      <AppShell>{children}</AppShell>
    </NumuProvider>
  );
}

function Notice({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-[420px]">
        <Logo size={34} />
        <div className="mt-8 flex items-center gap-2 text-muted">{icon}</div>
        <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
        <div className="mt-6">{action}</div>
      </div>
    </main>
  );
}
