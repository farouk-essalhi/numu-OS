import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/skeleton";
import { currentMemberId } from "@/lib/auth/session";
import { authConfig } from "@/lib/auth/token";
import { NumuProvider } from "@/lib/store";

// The signed-in app. It depends on who is looking and on today's date in
// Doha, so it streams in behind a static skeleton.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <WithSession>{children}</WithSession>
    </Suspense>
  );
}

async function WithSession({ children }: { children: ReactNode }) {
  const memberId = await currentMemberId();
  if (authConfig() && !memberId) redirect("/login");
  return (
    <NumuProvider sessionMemberId={memberId}>
      <AppShell>{children}</AppShell>
    </NumuProvider>
  );
}
