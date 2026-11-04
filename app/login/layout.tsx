import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { currentMemberId } from "@/lib/auth/session";

// Already signed in? Go straight to the app.
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      {children}
    </>
  );
}

async function RedirectIfSignedIn() {
  if (await currentMemberId()) redirect("/");
  return null;
}
