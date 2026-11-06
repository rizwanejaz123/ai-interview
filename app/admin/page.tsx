"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ReviewShell } from "@/components/review-shell";
import { formatWhen, parseSessionList, readApiError, type AdminSessionSummary } from "@/lib/vetting";

export default function AdminListPage() {
  const [sessions, setSessions] = useState<AdminSessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/sessions", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setError(await readApiError(response));
          return;
        }
        const list = parseSessionList(await response.json());
        if (!list) {
          if (!cancelled) setError("The server returned an unexpected session list.");
          return;
        }
        if (!cancelled) setSessions(list);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load sessions.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ReviewShell
      signOut
      title="Sessions"
      subtitle="Review scores, integrity flags, and transcripts."
    >
      {error ? (
        <p role="alert" className="text-sm text-[#8b1e1e]">
          {error}
        </p>
      ) : null}
      {sessions == null && !error ? <p className="text-sm text-[#5c574c]">Loading sessions…</p> : null}
      {sessions && sessions.length === 0 ? (
        <p className="text-sm text-[#5c574c]">No sessions yet.</p>
      ) : null}
      {sessions && sessions.length > 0 ? (
        <div className="overflow-x-auto border border-[#d7d0c0] bg-[#fffdf8]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[#5c574c]">
                <th className="border-b border-[#d7d0c0] px-3 py-2 font-semibold">Candidate</th>
                <th className="border-b border-[#d7d0c0] px-3 py-2 font-semibold">Field</th>
                <th className="border-b border-[#d7d0c0] px-3 py-2 font-semibold">State</th>
                <th className="border-b border-[#d7d0c0] px-3 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.session_id}>
                  <td className="border-b border-[#d7d0c0] px-3 py-3 align-top">
                    <Link href={`/admin/${session.session_id}`} className="font-semibold hover:underline">
                      {session.candidate_name?.trim() || "Unknown candidate"}
                    </Link>
                    <div className="mt-1 font-mono text-xs text-[#5c574c]">{session.session_id}</div>
                  </td>
                  <td className="border-b border-[#d7d0c0] px-3 py-3 align-top">{session.field || "—"}</td>
                  <td className="border-b border-[#d7d0c0] px-3 py-3 align-top">{session.state}</td>
                  <td className="border-b border-[#d7d0c0] px-3 py-3 align-top text-[#5c574c]">
                    {formatWhen(session.updated_at) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReviewShell>
  );
}
