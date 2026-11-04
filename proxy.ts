import { NextResponse, type NextRequest } from "next/server";
import { authConfig, SESSION_COOKIE, verifySession } from "@/lib/auth/token";

// Every page needs a signed-in team member once sign-in is configured.
// The app layout checks again; server actions re-check too (see lib/auth).
export async function proxy(request: NextRequest) {
  const config = authConfig();
  if (!config) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, config.secret);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!session) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-maskable.svg|manifest.webmanifest|robots.txt).*)"],
};
