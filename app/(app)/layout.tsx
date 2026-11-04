import { Suspense } from "react";
import { AppRoot } from "@/components/shell/app-root";
import { ShellSkeleton } from "@/components/shell/skeleton";

// Every page of the app lives under this layout. The static first paint is a
// skeleton; AppRoot then renders in the browser for this person and today,
// and sends anyone without a session to /login (see components/shell/app-root).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppRoot>{children}</AppRoot>
    </Suspense>
  );
}
