import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: redirect to /login when there is no session cookie.
// The real validation happens in the data access layer (requireUser), because a
// cookie being present does not mean it is valid. /login itself is never
// redirected here, so an expired cookie cannot cause a redirect loop.
const PUBLIC_PATHS = new Set(["/login", "/privacy", "/terms", "/data-deletion"]);

export function proxy(request: NextRequest) {
  // /login and the public legal pages (Meta needs working URLs for them) never need a session.
  if (PUBLIC_PATHS.has(request.nextUrl.pathname) || request.cookies.has("session")) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Webhooks are public (verified by signature); also skip static assets.
  matcher: ["/((?!api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
