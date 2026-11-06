import { NextResponse } from "next/server";

import { proxyTo } from "@/lib/vetting-proxy";

export async function POST(request: Request) {
  const incoming = await request.formData();
  const resume = incoming.get("resume");
  if (!(resume instanceof File)) {
    return NextResponse.json({ error: "resume file is required" }, { status: 400 });
  }

  const body = new FormData();
  body.append("resume", resume, resume.name || "resume");
  return proxyTo("/v1/sessions", { method: "POST", body });
}
