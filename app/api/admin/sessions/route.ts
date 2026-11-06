import { NextResponse } from "next/server";

import { adminAuthorization, proxyTo } from "@/lib/vetting-proxy";

export async function GET() {
  const authorization = adminAuthorization();
  if (!authorization) {
    return NextResponse.json({ error: "ADMIN_TOKEN is not configured" }, { status: 500 });
  }
  return proxyTo("/v1/admin/sessions", {
    method: "GET",
    headers: { Authorization: authorization },
  });
}
