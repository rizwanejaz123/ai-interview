"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { primaryAction, ReviewPanel, ReviewShell, secondaryAction } from "@/components/review-shell";
import {
  parseCreatedSession,
  readApiError,
  skillLabel,
  type CreatedSession,
  type InterviewOption,
} from "@/lib/vetting";

const ACCEPT = ".pdf,.txt,application/pdf,text/plain";

export default function ApplyPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<CreatedSession | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) {
      setError("Choose a PDF or text resume.");
      return;
    }
    if (!isResumeFile(file)) {
      setError("Upload a PDF or plain-text resume.");
      return;
    }

    setUploading(true);
    setError(null);
    setSession(null);
    setSelectedType(null);
    try {
      const body = new FormData();
      body.append("resume", file, file.name);
      const response = await fetch("/api/vetting/sessions", { method: "POST", body });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      const created = parseCreatedSession(await response.json());
      if (!created) {
        setError("The server returned an unexpected session.");
        return;
      }
      setSession(created);
      setSelectedType(created.interview_type);
    } catch (err) {
      console.error(err);
      setError("Could not reach the interview service.");
    } finally {
      setUploading(false);
    }
  };

  const selectInterview = async (interview: InterviewOption) => {
    if (!session) return;
    setSelecting(true);
    setError(null);
    setSelectedType(interview.id);
    try {
      // Select track without generating so the Generate button is explicit.
      const response = await fetch(
        `/api/vetting/sessions/${encodeURIComponent(session.session_id)}/select`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.candidate_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ interview_type: interview.id, generate: false }),
        },
      );
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      const updated = parseCreatedSession(await response.json());
      if (!updated) {
        setError("The server returned an unexpected session after selection.");
        return;
      }
      setSession(updated);
      setSelectedType(updated.interview_type);
    } catch (err) {
      console.error(err);
      setError("Could not select that interview.");
    } finally {
      setSelecting(false);
    }
  };

  const generateQuestions = async () => {
    if (!session || !selectedType) {
      setError("Select an interview first.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/vetting/sessions/${encodeURIComponent(session.session_id)}/questions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.candidate_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ interview_type: selectedType }),
        },
      );
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      const updated = parseCreatedSession(await response.json());
      if (!updated) {
        setError("The server returned an unexpected session after generating questions.");
        return;
      }
      setSession(updated);
      setSelectedType(updated.interview_type);
    } catch (err) {
      console.error(err);
      setError("Could not generate questions.");
    } finally {
      setGenerating(false);
    }
  };

  const start = () => {
    if (!session) return;
    if (!session.questions.length) {
      setError("Generate questions before starting the interview.");
      return;
    }
    setStarting(true);
    setError(null);
    // Join (and agent dispatch) happens after setup checks on /interview.
    const params = new URLSearchParams({
      session_id: session.session_id,
      token: session.candidate_token,
    });
    router.push(`/interview?${params.toString()}`);
  };

  const hasQuestions = (session?.questions.length ?? 0) > 0;
  const canStart =
    hasQuestions && (session?.state === "ready" || session?.state === "live");
  const selected = session?.interview;
  const busy = uploading || selecting || generating || starting;

  return (
    <ReviewShell
      signOut
      title="Upload resume"
      subtitle="PDF or plain text. We build an AI profile, personalize questions from your resume, then you start."
    >
      <div className="grid max-w-3xl gap-5">
        <ReviewPanel title="Resume">
          <label className="block text-sm font-medium" htmlFor="resume">
            File
          </label>
          <input
            id="resume"
            type="file"
            accept={ACCEPT}
            className="mt-2 block w-full text-sm file:mr-3 file:border file:border-[#d7d0c0] file:bg-[#fffdf8] file:px-3 file:py-1.5 file:text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <p className="mt-2 text-sm text-[#5c574c]">
            {file ? file.name : "Choose a .pdf or .txt file."}
          </p>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={uploading || !file}
            className={`${primaryAction} mt-4`}
          >
            {uploading ? "Building AI profile…" : "Upload resume"}
          </button>
        </ReviewPanel>

        {session ? (
          <ReviewPanel title="Candidate profile">
            <p className="text-2xl font-semibold tracking-tight">
              {session.profile?.name?.trim() || "Candidate"}
            </p>
            <p className="mt-1 text-sm text-[#5c574c]">
              {[
                session.profile?.industry,
                session.profile?.field,
                yearsLabel(session.profile?.years_total),
                profileSourceLabel(session.profile?.source),
                session.state,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {session.profile?.summary ? (
              <p className="mt-3 text-sm text-[#1c1913]">{session.profile.summary}</p>
            ) : null}
            {session.profile && session.profile.skills.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {session.profile.skills.map((skill) => (
                  <li key={`${skill.skill}-${skill.section ?? ""}`} className="border border-[#d7d0c0] px-2 py-1 text-sm">
                    {skillLabel(skill)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#5c574c]">No skills were extracted.</p>
            )}
            <p className="mt-1 font-mono text-xs text-[#5c574c]">{session.session_id}</p>
          </ReviewPanel>
        ) : null}

        {session ? (
          <ReviewPanel title="Choose interview">
            <p className="text-sm text-[#5c574c]">
              Pick a track, then generate personalized questions from your resume before you start.
            </p>
            {session.interviews.length === 0 ? (
              <p className="mt-4 text-sm text-[#8b1e1e]">
                No interviews are available for this resume profile.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3">
                {session.interviews.map((interview) => {
                  const active = selectedType === interview.id;
                  return (
                    <li key={interview.id}>
                      <button
                        type="button"
                        onClick={() => void selectInterview(interview)}
                        disabled={busy}
                        className={[
                          "w-full border px-4 py-3 text-left transition",
                          active
                            ? "border-[#1c1913] bg-[#1c1913] text-[#fffdf8]"
                            : "border-[#d7d0c0] bg-[#fffdf8] text-[#1c1913] hover:border-[#1c1913]",
                        ].join(" ")}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-base font-semibold">
                            {interview.title}
                            {interview.recommended ? (
                              <span className={`ml-2 text-xs font-normal uppercase tracking-wide ${active ? "text-[#d7d0c0]" : "text-[#5c574c]"}`}>
                                Recommended
                              </span>
                            ) : null}
                          </p>
                          <p className={`shrink-0 text-xs ${active ? "text-[#d7d0c0]" : "text-[#5c574c]"}`}>
                            ~{interview.duration_minutes} min · {interview.question_count} questions
                          </p>
                        </div>
                        <p className={`mt-1 text-sm ${active ? "text-[#d7d0c0]" : "text-[#5c574c]"}`}>
                          {interview.description}
                        </p>
                        <p className={`mt-2 text-xs uppercase tracking-wide ${active ? "text-[#d7d0c0]" : "text-[#5c574c]"}`}>
                          {categoryLabel(interview.category)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedType ? (
              <div className="mt-5 border-t border-[#d7d0c0] pt-4">
                <p className="text-sm">
                  Selected:{" "}
                  <span className="font-semibold">{selected?.title || selectedType}</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void generateQuestions()}
                    disabled={busy}
                    className={primaryAction}
                  >
                    {generating
                      ? "Generating questions…"
                      : hasQuestions
                        ? "Regenerate questions"
                        : "Generate questions"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void start()}
                    disabled={!canStart || busy}
                    className={secondaryAction}
                  >
                    {starting ? "Starting interview…" : "Start interview"}
                  </button>
                </div>
                {!hasQuestions ? (
                  <p className="mt-2 text-sm text-[#5c574c]">
                    Generate questions to preview what the interviewer will ask, then start.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#5c574c]">Select an interview above to continue.</p>
            )}
          </ReviewPanel>
        ) : null}

        {session && hasQuestions ? (
          <ReviewPanel title="Generated questions">
            <p className="text-sm text-[#5c574c]">
              Personalized from your resume (depth + skips). Live follow-ups may still happen during
              the call when an answer is thin.
            </p>
            <ol className="mt-4 grid gap-3">
              {session.questions.map((question, index) => (
                <li key={question.id} className="border border-[#d7d0c0] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#5c574c]">
                    {index + 1}. {question.topic}
                    {question.source ? ` · ${question.source}` : ""}
                    {question.depth ? ` · ${question.depth}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-[#1c1913]">
                    {question.prompt?.trim() || "(prompt unavailable)"}
                  </p>
                </li>
              ))}
            </ol>
          </ReviewPanel>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-[#8b1e1e]">
            {error}
          </p>
        ) : null}

        <Link href="/" className={`${secondaryAction} w-fit`}>
          Back
        </Link>
      </div>
    </ReviewShell>
  );
}

function isResumeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".pdf") ||
    name.endsWith(".txt") ||
    type === "application/pdf" ||
    type.startsWith("text/")
  );
}

function yearsLabel(years: number | null | undefined): string | null {
  if (typeof years !== "number") return null;
  return `${years} ${years === 1 ? "year" : "years"}`;
}

function profileSourceLabel(source: string | null | undefined): string | null {
  if (source === "llm") return "AI profile";
  if (source === "llm_fallback") return "basic profile (AI unavailable)";
  if (source === "heuristic") return "basic profile";
  return null;
}

function categoryLabel(category: string): string {
  switch (category) {
    case "software":
      return "Software / DevOps / CS";
    case "ai":
      return "AI";
    case "healthcare":
      return "Healthcare";
    default:
      return category;
  }
}
