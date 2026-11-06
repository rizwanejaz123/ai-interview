import { NextRequest, NextResponse } from "next/server";

import { bearerHeader, proxyTo, validSessionId } from "@/lib/vetting-proxy";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { id: rawId } = await context.params;
  const id = validSessionId(rawId);
  if (!id) return NextResponse.json({ error: "invalid session id" }, { status: 400 });

  const authorization = bearerHeader(request);
  if (!authorization) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }

  const raw = await request.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "integrity body must be JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as { signal?: unknown }).signal !== "string") {
    return NextResponse.json({ error: "signal is required" }, { status: 400 });
  }

  return proxyTo(`/v1/sessions/${encodeURIComponent(id)}/integrity`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: raw,
  });
}
