import { connection, NextResponse } from "next/server";

const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function vettingUrl(path: string): string {
  const base = (process.env.VETTING_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function adminAuthorization(): string | null {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return null;
  return `Bearer ${token}`;
}

export function validSessionId(id: string | undefined): string | null {
  if (!id || !SESSION_ID.test(id)) return null;
  return id;
}

export function bearerHeader(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(authorization.indexOf(" ") + 1).trim();
  if (!token) return null;
  return `Bearer ${token}`;
}

export async function proxyTo(path: string, init: RequestInit): Promise<NextResponse> {
  await connection();
  const url = vettingUrl(path);
  try {
    const upstream = await fetch(url, { ...init, cache: "no-store" });
    return relay(upstream);
  } catch (error) {
    console.error("vetting proxy failed", path, url, error);
    const local =
      url.includes("127.0.0.1") || url.includes("localhost");
    return NextResponse.json(
      {
        error: local
          ? "Vetting API unreachable — set VETTING_API_URL on this host (e.g. https://dev.netpace.ai/ventiq/vetting)"
          : "Vetting API unreachable",
      },
      { status: 502 },
    );
  }
}

async function relay(upstream: Response): Promise<NextResponse> {
  const bytes = await upstream.arrayBuffer();
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  return new NextResponse(bytes, { status: upstream.status, headers });
}
