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

  return proxyTo(`/v1/sessions/${encodeURIComponent(id)}/join`, {
    method: "POST",
    headers: { Authorization: authorization },
  });
}
