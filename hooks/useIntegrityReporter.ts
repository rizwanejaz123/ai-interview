"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { useCheatingDetection } from "@/hooks/useCheatingDetection";

const HEARTBEAT_MS = 15_000;

type IntegrityBody = {
  signal: string;
  message?: string;
  metrics?: Record<string, number>;
};

function eventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Posts MediaPipe signals, tab/window focus, and a 15s detector heartbeat.
 * Severity is assigned by the API; this hook only sends signal and metrics.
 */
export function useIntegrityReporter(
  videoRef: RefObject<HTMLVideoElement | null>,
  detectorEnabled: boolean,
  sessionId: string,
  candidateToken: string,
) {
  const sessionRef = useRef({ sessionId, candidateToken });
  sessionRef.current = { sessionId, candidateToken };
  const detectorRef = useRef(detectorEnabled);
  detectorRef.current = detectorEnabled;

  const post = useCallback((body: IntegrityBody) => {
    const { sessionId: id, candidateToken: token } = sessionRef.current;
    if (!id || !token) return;

    const payload = {
      event_id: eventId(),
      observed_at_ms: Date.now(),
      signal: body.signal,
      ...(body.message ? { message: body.message } : {}),
      ...(body.metrics ? { metrics: body.metrics } : {}),
    };

    void fetch(`/api/vetting/sessions/${encodeURIComponent(id)}/integrity`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) console.error("integrity post failed", response.status, body.signal);
      })
      .catch((error: unknown) => {
        console.error("integrity post failed", body.signal, error);
      });
  }, []);

  useCheatingDetection(videoRef, detectorEnabled && Boolean(sessionId && candidateToken), {
    // Keep inference light — MediaPipe on the main thread competes with LiveKit audio.
    fps: 1,
    emitCooldownMs: 12_000,
    confirmFrames: { noFace: 10, headTurn: 5, gazeAway: 6, multipleFaces: 2 },
    onCheating: (detail) => {
      post({
        signal: detail.reason,
        message: detail.message,
        metrics: detail.metrics,
      });
    },
  });

  useEffect(() => {
    if (!sessionId || !candidateToken) return;

    const send = () => {
      post({
        signal: "detector_heartbeat",
        metrics: {
          interval_s: HEARTBEAT_MS / 1000,
          detector_running: detectorRef.current ? 1 : 0,
        },
      });
    };

    send();
    const timer = window.setInterval(send, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [sessionId, candidateToken, post]);

  useEffect(() => {
    if (!sessionId || !candidateToken) return;

    let hiddenAt: number | null = null;
    let blurAt: number | null = null;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt == null) return;
      const duration_s = round2((Date.now() - hiddenAt) / 1000);
      hiddenAt = null;
      if (duration_s <= 0) return;
      post({ signal: "tab_hidden", metrics: { duration_s } });
    };

    const onBlur = () => {
      blurAt = Date.now();
    };

    const onFocus = () => {
      if (blurAt == null) return;
      const duration_s = round2((Date.now() - blurAt) / 1000);
      blurAt = null;
      if (duration_s <= 0) return;
      post({ signal: "window_blur", metrics: { duration_s } });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [sessionId, candidateToken, post]);
}
