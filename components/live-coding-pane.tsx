"use client";

import { useEffect, useRef, useState } from "react";

export type LiveCodingQuestion = {
  questionId: string;
  topic: string;
  prompt: string;
  language: string;
  starterCode: string;
  problemMd: string;
};

type Props = {
  question: LiveCodingQuestion;
  sessionId: string;
  candidateToken: string;
  onPublishSnapshot: (payload: {
    questionId: string;
    code: string;
    final: boolean;
    language: string;
  }) => void;
};

export function LiveCodingPane({
  question,
  sessionId,
  candidateToken,
  onPublishSnapshot,
}: Props) {
  const [code, setCode] = useState(question.starterCode);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCode(question.starterCode);
    setSavedAt(null);
  }, [question.questionId, question.starterCode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onPublishSnapshot({
        questionId: question.questionId,
        code,
        final: false,
        language: question.language,
      });
      void persist(sessionId, candidateToken, question, code, false).then((ok) => {
        if (ok) setSavedAt(new Date().toLocaleTimeString());
      });
    }, 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, question, sessionId, candidateToken, onPublishSnapshot]);

  const submitFinal = async () => {
    setSaving(true);
    onPublishSnapshot({
      questionId: question.questionId,
      code,
      final: true,
      language: question.language,
    });
    const ok = await persist(sessionId, candidateToken, question, code, true);
    if (ok) setSavedAt(new Date().toLocaleTimeString());
    setSaving(false);
  };

  return (
    <div className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">Live coding</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">{question.topic}</h3>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
          {question.problemMd || question.prompt}
        </p>
      </div>
      <textarea
        value={code}
        onChange={(event) => setCode(event.target.value)}
        spellCheck={false}
        className="min-h-[220px] flex-1 resize-y bg-slate-950 px-4 py-3 font-mono text-xs leading-5 text-emerald-100 outline-none"
        aria-label="Coding editor"
      />
      <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
        <p className="text-[11px] text-slate-500">
          {savedAt ? `Synced ${savedAt}` : "Edits sync automatically — talk through your approach."}
        </p>
        <button
          type="button"
          onClick={() => void submitFinal()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:bg-slate-700"
        >
          {saving ? "Submitting…" : "Submit solution"}
        </button>
      </div>
    </div>
  );
}

async function persist(
  sessionId: string,
  candidateToken: string,
  question: LiveCodingQuestion,
  code: string,
  final: boolean,
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/vetting/sessions/${encodeURIComponent(sessionId)}/coding-snapshot`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question_id: question.questionId,
          code,
          final,
          language: question.language,
        }),
        keepalive: true,
      },
    );
    return response.ok;
  } catch (err) {
    console.error("coding snapshot failed", err);
    return false;
  }
}
