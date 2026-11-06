import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, AUTH_SESSION_VALUE } from "@/lib/auth";

function isProtectedPage(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/apply" ||
    pathname.startsWith("/apply/")
  );
}

function isProtectedApi(pathname: string): boolean {
  // Exact create-session route only — join/integrity stay candidate-token auth.
  if (pathname === "/api/vetting/sessions") return true;
  return pathname.startsWith("/api/admin");
}

export function proxy(request: NextRequest) {
  const session = request.cookies.get(AUTH_COOKIE)?.value;
  const authenticated = session === AUTH_SESSION_VALUE;
  const { pathname } = request.nextUrl;

  if (isProtectedApi(pathname)) {
    if (!authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isProtectedPage(pathname)) {
    if (!authenticated) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (pathname === "/login" && authenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/apply",
    "/apply/:path*",
    "/api/admin/:path*",
    "/api/vetting/sessions",
    "/login",
  ],
};
