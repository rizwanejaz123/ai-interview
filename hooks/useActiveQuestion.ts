"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant } from "livekit-client";

import type { LiveCodingQuestion } from "@/components/live-coding-pane";
import { parseCreatedSession, type QuestionTopic } from "@/lib/vetting";

const TOPIC = "my-interviewer";

type ActivePayload = {
  type?: string;
  question_id?: string;
  modality?: string;
  topic?: string;
  prompt?: string;
  language?: string;
  starter_code?: string;
  problem_md?: string;
};

export function useActiveQuestion(sessionId: string, candidateToken: string) {
  const room = useRoomContext();
  const [bank, setBank] = useState<QuestionTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [override, setOverride] = useState<LiveCodingQuestion | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/vetting/sessions/${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${candidateToken}` },
        });
        if (!response.ok) return;
        const parsed = parseCreatedSession(await response.json());
        if (!cancelled && parsed) setBank(parsed.questions);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, candidateToken]);

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string,
    ) => {
      if (topic && topic !== TOPIC) return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as ActivePayload;
        if (data.type !== "active_question" || !data.question_id) return;
        setActiveId(data.question_id);
        if (String(data.modality || "") === "live_coding") {
          setOverride({
            questionId: data.question_id,
            topic: data.topic || "Live Coding",
            prompt: data.prompt || "",
            language: data.language || "python",
            starterCode: data.starter_code || "",
            problemMd: data.problem_md || data.prompt || "",
          });
        } else {
          setOverride(null);
        }
      } catch {
        // ignore non-JSON packets
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const codingQuestion = useMemo(() => {
    if (override) return override;
    if (!activeId) return null;
    const match = bank.find((q) => q.id === activeId);
    if (!match || match.modality !== "live_coding") return null;
    return {
      questionId: match.id,
      topic: match.topic,
      prompt: match.prompt || "",
      language: match.language || "python",
      starterCode: match.starter_code || "",
      problemMd: match.problem_md || match.prompt || "",
    } satisfies LiveCodingQuestion;
  }, [override, activeId, bank]);

  return { activeId, codingQuestion };
}
