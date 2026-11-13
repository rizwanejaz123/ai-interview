import { NextResponse } from "next/server";

import { bearerHeader, proxyTo, validSessionId } from "@/lib/vetting-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = validSessionId(id);
  if (!sessionId) {
    return NextResponse.json({ error: "invalid session id" }, { status: 400 });
  }
  const authorization = bearerHeader(request);
  if (!authorization) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  return proxyTo(`/v1/sessions/${encodeURIComponent(sessionId)}/questions`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
}
