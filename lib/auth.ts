/** Temporary hardcoded credentials. Replace with real auth later. */
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim() || "admin";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "admin";

export const AUTH_COOKIE = "admin_session";

/** Opaque session value stamped into the cookie after a successful login. */
export const AUTH_SESSION_VALUE =
  process.env.ADMIN_SESSION_SECRET?.trim() || "dev-admin-session";

export function credentialsMatch(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function isValidSessionValue(value: string | undefined | null): boolean {
  return Boolean(value) && value === AUTH_SESSION_VALUE;
}

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
