import { NextRequest, NextResponse } from "next/server";

import { adminAuthorization, proxyTo, validSessionId } from "@/lib/vetting-proxy";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const authorization = adminAuthorization();
  if (!authorization) {
    return NextResponse.json({ error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }

  const { id: rawId } = await context.params;
  const id = validSessionId(rawId);
  if (!id) return NextResponse.json({ error: "invalid session id" }, { status: 400 });

  return proxyTo(`/v1/admin/sessions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: authorization },
  });
}
