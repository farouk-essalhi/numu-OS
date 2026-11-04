import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/skeleton";
import { NumuProvider } from "@/lib/store";

// The signed-in app. It depends on who is looking and on today's date in
// Doha, so it renders in the browser behind a static skeleton.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <NumuProvider>
        <AppShell>{children}</AppShell>
      </NumuProvider>
    </Suspense>
  );
}
