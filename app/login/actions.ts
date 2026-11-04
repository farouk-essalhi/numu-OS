"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword } from "@/lib/auth/session";
import { authConfig, SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/token";

export type SignInState = { error: string | null; email: string };

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const config = authConfig();
  if (!config) return { error: "Sign-in isn't switched on for this copy of NUMU OS.", email };
  if (!email || !password) return { error: "Enter your email and password.", email };

  const memberId = checkPassword(email, password);
  if (!memberId) return { error: "That email and password don't match.", email };

  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  (await cookies()).set(SESSION_COOKIE, await signSession({ sub: memberId, exp }, config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  // Only ever redirect inside the app.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
