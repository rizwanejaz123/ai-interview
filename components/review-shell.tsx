import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/sign-out-button";

export const primaryAction =
  "inline-flex items-center justify-center bg-[#1c1a16] px-4 py-2.5 text-sm font-medium text-[#fffdf8] hover:bg-[#3a342c] disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryAction =
  "inline-flex items-center justify-center border border-[#1c1a16] bg-transparent px-4 py-2.5 text-sm font-medium text-[#1c1a16] hover:bg-[#1c1a16]/5";

export function ReviewShell({
  title,
  subtitle,
  homeLink = true,
  signOut = false,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  homeLink?: boolean;
  signOut?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen text-[#1c1a16]"
      style={{
        backgroundColor: "#f3f0e8",
        backgroundImage:
          "radial-gradient(circle at 10% 0%, #efe6d4 0%, transparent 45%), radial-gradient(circle at 90% 10%, #e4ece6 0%, transparent 40%)",
      }}
    >
      <header className="border-b border-[#d7d0c0] px-6 pb-4 pt-7 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          {homeLink ? (
            <Link href="/" className="text-sm text-[#5c574c] hover:text-[#1c1a16]">
              Interview vetting
            </Link>
          ) : (
            <p className="text-sm text-[#5c574c]">Interview vetting</p>
          )}
          {signOut ? <SignOutButton /> : null}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <div className="mt-1 text-[#5c574c]">{subtitle}</div> : null}
      </header>
      <div className="px-6 py-6 sm:px-8">{children}</div>
    </div>
  );
}

export function ReviewPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-[#d7d0c0] bg-[#fffdf8] p-4 sm:p-5 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.04em] text-[#5c574c]">
        {title}
      </h2>
      {children}
    </section>
  );
}
