"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ReviewPanel, ReviewShell, secondaryAction } from "@/components/review-shell";
import {
  formatWhen,
  parseAdminReport,
  readApiError,
  skillLabel,
  type AdminReport,
  type IntegrityFlag,
  type QuestionDetail,
  type ScorecardRow,
} from "@/lib/vetting";

export function AdminReportView() {
  const params = useParams<{ id: string }>();
  const rawId = params.id;
  const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
  const [report, setReport] = useState<AdminReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setError(await readApiError(response));
          return;
        }
        const parsed = parseAdminReport(await response.json());
        if (!parsed) {
          if (!cancelled) setError("The server returned an unexpected report.");
          return;
        }
        if (!cancelled) setReport(parsed);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load this session.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <ReviewShell signOut title="Session" subtitle="Missing session id.">
        <BackLink />
      </ReviewShell>
    );
  }

  if (error) {
    return (
      <ReviewShell signOut title="Session" subtitle={sessionId}>
        <p role="alert" className="text-sm text-[#8b1e1e]">
          {error}
        </p>
        <div className="mt-4">
          <BackLink />
        </div>
      </ReviewShell>
    );
  }

  if (!report) {
    return (
      <ReviewShell signOut title="Session" subtitle={sessionId}>
        Loading report…
      </ReviewShell>
    );
  }

  const name = report.profile?.name?.trim() || "Unknown candidate";
  const field = report.profile?.field;
  const rows = mergedRows(report);
  const mean = meanScore(rows);
  const subtitle = [sessionId, report.state, report.room_name].filter(Boolean).join(" · ");

  return (
    <ReviewShell signOut title={field ? `${name} · ${field}` : name} subtitle={subtitle}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <ReviewPanel title="Scorecard">
          <p className="text-[42px] font-semibold leading-none tracking-tight">
            {mean == null ? "—" : mean}
            {mean != null ? <span className="text-lg font-medium text-[#5c574c]"> / 5</span> : null}
          </p>
          {report.profile && report.profile.skills.length > 0 ? (
            <p className="mt-3 text-sm text-[#5c574c]">
              {report.profile.skills.map((skill) => skillLabel(skill)).join(", ")}
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-[#5c574c]">No questions or scores yet.</p>
          ) : (
            <table className="mt-4 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-[#5c574c]">
                  <th className="border-b border-[#d7d0c0] px-1.5 py-2 font-medium">Q</th>
                  <th className="border-b border-[#d7d0c0] px-1.5 py-2 font-medium">Score</th>
                  <th className="border-b border-[#d7d0c0] px-1.5 py-2 font-medium">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="border-b border-[#d7d0c0] px-1.5 py-2 align-top">
                      <strong>{row.topic}</strong>
                      <div className="text-[#5c574c]">
                        {[row.id, row.source].filter(Boolean).join(" · ")}
                      </div>
                      {row.prompt ? <div className="mt-1 text-[#1c1a16]">{row.prompt}</div> : null}
                    </td>
                    <td className="border-b border-[#d7d0c0] px-1.5 py-2 align-top">
                      {row.score == null ? "—" : row.score}
                    </td>
                    <td className="border-b border-[#d7d0c0] px-1.5 py-2 align-top">
                      {row.feedback || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.notes.length > 0 ? (
            <div className="mt-4 text-sm text-[#1f5c3a]">
              {report.notes.map((note) => (
                <p key={note}>Notes: {note}</p>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#5c574c]">No notes yet.</p>
          )}
        </ReviewPanel>

        <ReviewPanel title="Integrity">
          {report.integrity.length === 0 ? (
            <p className="text-sm text-[#5c574c]">No integrity flags.</p>
          ) : (
            <ul>
              {report.integrity.map((flag, index) => (
                <li
                  key={`${flag.signal}-${index}`}
                  className="flex items-start justify-between gap-3 border-b border-[#d7d0c0] py-2.5"
                >
                  <div>
                    <div className={`font-semibold ${severityClass(flag.severity)}`}>
                      {flag.severity.toUpperCase()} · {flag.signal}
                    </div>
                    {flag.rationale ? <p className="mt-1 text-sm">{flag.rationale}</p> : null}
                    {evidenceLine(flag) ? (
                      <p className="mt-1 text-sm text-[#5c574c]">{evidenceLine(flag)}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-[#5c574c]">
            Severity is assigned by the backend. The browser only posts the signal and metrics.
          </p>
        </ReviewPanel>

        <ReviewPanel title="Transcript" className="lg:col-span-2">
          {report.transcript.length === 0 ? (
            <p className="text-sm text-[#5c574c]">No transcript yet.</p>
          ) : (
            <div className="grid gap-3">
              {report.transcript.map((turn, index) => (
                <div key={`${turn.occurred_at ?? "turn"}-${index}`}>
                  <div className="text-xs uppercase tracking-wide text-[#5c574c]">
                    {turn.role}
                    {turn.occurred_at ? ` · ${formatWhen(turn.occurred_at)}` : ""}
                  </div>
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))}
            </div>
          )}
        </ReviewPanel>
      </div>
      <div className="mt-5">
        <BackLink />
      </div>
    </ReviewShell>
  );
}

function BackLink() {
  return (
    <Link href="/admin" className={secondaryAction}>
      All sessions
    </Link>
  );
}

type MergedRow = {
  key: string;
  id: string;
  topic: string;
  prompt?: string;
  source?: string;
  score: number | null;
  feedback: string | null;
};

function mergedRows(report: AdminReport): MergedRow[] {
  const scored = new Map<string, ScorecardRow>();
  for (const row of report.scorecard) {
    if (row.question_id) scored.set(row.question_id, row);
  }
  const used = new Set<string>();
  const rows: MergedRow[] = report.questions.map((question) => {
    used.add(question.id);
    return fromQuestion(question, scored.get(question.id));
  });
  report.scorecard.forEach((row, index) => {
    if (row.question_id && used.has(row.question_id)) return;
    rows.push({
      key: row.question_id || `score-${index}`,
      id: row.question_id || "",
      topic: row.topic || "Question",
      score: row.score,
      feedback: row.feedback,
    });
  });
  return rows;
}

function fromQuestion(question: QuestionDetail, score: ScorecardRow | undefined): MergedRow {
  return {
    key: question.id,
    id: question.id,
    topic: question.topic,
    prompt: question.prompt,
    source: question.source,
    score: score?.score ?? null,
    feedback: score?.feedback ?? null,
  };
}

function meanScore(rows: MergedRow[]): number | null {
  const scores = rows.flatMap((row) => (typeof row.score === "number" ? [row.score] : []));
  if (scores.length === 0) return null;
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.round(mean * 10) / 10;
}

function severityClass(severity: string): string {
  if (severity === "high") return "text-[#8b1e1e]";
  if (severity === "medium") return "text-[#8a5a00]";
  return "text-[#5c574c]";
}

function evidenceLine(flag: IntegrityFlag): string | null {
  const evidence = flag.evidence;
  if (!evidence) return null;
  const bits: string[] = [];
  if (typeof evidence.count === "number") {
    bits.push(`${evidence.count} emission${evidence.count === 1 ? "" : "s"}`);
  }
  if (typeof evidence.duration_s === "number" && evidence.duration_s > 0) {
    bits.push(`${Number(evidence.duration_s.toFixed(1))}s`);
  }
  if (evidence.message) bits.push(evidence.message);
  if (evidence.metrics) {
    for (const [key, value] of Object.entries(evidence.metrics)) {
      if (value == null || value === "") continue;
      if (typeof value === "number" || typeof value === "string") bits.push(`${key} ${value}`);
    }
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}
