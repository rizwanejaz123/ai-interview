import { NextResponse } from "next/server";

import {
  AUTH_COOKIE,
  AUTH_SESSION_VALUE,
  credentialsMatch,
  sessionCookieOptions,
} from "@/lib/auth";

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!credentialsMatch(username, password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, AUTH_SESSION_VALUE, sessionCookieOptions());
  return response;
}
