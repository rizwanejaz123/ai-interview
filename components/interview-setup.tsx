"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MonitorUp, Mic, Video } from "lucide-react";

type CheckState = "idle" | "pending" | "pass" | "fail";

type Props = {
  onReady: () => void;
};

/**
 * Mercor-style waiting-room checks before the LiveKit room is joined.
 * Screenshare must be full-screen (displaySurface === monitor) when the browser reports it.
 */
export function InterviewSetup({ onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CheckState>("idle");
  const [mic, setMic] = useState<CheckState>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [share, setShare] = useState<CheckState>("idle");
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamsRef = useRef<MediaStream[]>([]);

  useEffect(() => {
    return () => {
      for (const stream of streamsRef.current) {
        for (const track of stream.getTracks()) track.stop();
      }
      streamsRef.current = [];
    };
  }, []);

  const remember = (stream: MediaStream) => {
    streamsRef.current.push(stream);
  };

  const enableCamera = async () => {
    setCamera("pending");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      remember(stream);
      const el = videoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => undefined);
      }
      setCamera("pass");
    } catch (err) {
      console.error(err);
      setCamera("fail");
      setError("Camera permission is required. Allow access and try again.");
    }
  };

  const enableMic = async () => {
    setMic("pending");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      remember(stream);
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let heard = false;
      const started = Date.now();

      await new Promise<void>((resolve) => {
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / Math.max(1, data.length);
          setMicLevel(Math.min(100, Math.round((avg / 80) * 100)));
          if (avg > 12) heard = true;
          if (heard || Date.now() - started > 4000) {
            void ctx.close();
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });

      setMic(heard ? "pass" : "fail");
      if (!heard) setError("Speak into the mic so we can confirm it works, then retry.");
    } catch (err) {
      console.error(err);
      setMic("fail");
      setError("Microphone permission is required. Allow access and try again.");
    }
  };

  const enableShare = async () => {
    setShare("pending");
    setShareNote(null);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      remember(stream);
      const track = stream.getVideoTracks()[0];
      const surface = track?.getSettings?.().displaySurface;
      // Prefer entire screen; some browsers omit displaySurface — pass with a note.
      if (surface && surface !== "monitor") {
        for (const t of stream.getTracks()) t.stop();
        setShare("fail");
        setShareNote("Share your entire screen (not a window or tab), then try again.");
        return;
      }
      if (!surface) {
        setShareNote("Could not confirm full-screen share; continue only if you shared the whole screen.");
      }
      // Stop the probe stream — LiveKit will re-prompt on connect.
      for (const t of stream.getTracks()) t.stop();
      setShare("pass");
    } catch (err) {
      console.error(err);
      setShare("fail");
      setError("Screen share is required for this interview. Share your entire screen.");
    }
  };

  const ready = camera === "pass" && mic === "pass" && share === "pass";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold">Setup checks</h1>
        <p className="mt-2 text-sm text-slate-400">
          Confirm camera, microphone, and full-screen share before the interviewer joins.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="relative min-h-[200px] overflow-hidden rounded-xl border border-slate-800 bg-black">
            <video ref={videoRef} muted playsInline autoPlay className="h-full w-full scale-x-[-1] object-cover" />
            {camera !== "pass" && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                Camera preview
              </div>
            )}
          </div>

          <div className="space-y-3">
            <CheckRow
              icon={<Video className="h-4 w-4" />}
              label="Working camera"
              state={camera}
              required
              actionLabel={camera === "pass" ? "Retest" : "Test camera"}
              onAction={() => void enableCamera()}
            />
            <CheckRow
              icon={<Mic className="h-4 w-4" />}
              label="Working mic"
              state={mic}
              required
              actionLabel={mic === "pass" ? "Retest" : "Test mic"}
              onAction={() => void enableMic()}
              detail={
                mic !== "idle" ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${micLevel}%` }} />
                  </div>
                ) : null
              }
            />
            <CheckRow
              icon={<MonitorUp className="h-4 w-4" />}
              label="Screenshare (entire screen)"
              state={share}
              required
              actionLabel={share === "pass" ? "Reshare" : "Share your screen"}
              onAction={() => void enableShare()}
              detail={shareNote ? <p className="mt-1 text-xs text-amber-300/90">{shareNote}</p> : null}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

        <button
          type="button"
          disabled={!ready}
          onClick={onReady}
          className="mt-8 w-full rounded-xl bg-blue-600 px-6 py-3.5 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {ready ? "Begin interview" : "Complete required checks to start"}
        </button>
      </div>
    </div>
  );
}

function CheckRow({
  icon,
  label,
  state,
  required,
  actionLabel,
  onAction,
  detail,
}: {
  icon: ReactNode;
  label: string;
  state: CheckState;
  required?: boolean;
  actionLabel: string;
  onAction: () => void;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className="text-slate-400">{icon}</span>
          <span>{label}</span>
          {required && <span className="text-[10px] uppercase tracking-wide text-slate-500">Required</span>}
        </div>
        <StatusPill state={state} />
      </div>
      {detail}
      <button
        type="button"
        onClick={onAction}
        disabled={state === "pending"}
        className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 disabled:text-slate-600"
      >
        {state === "pending" ? "Checking…" : actionLabel}
      </button>
    </div>
  );
}

function StatusPill({ state }: { state: CheckState }) {
  if (state === "pass") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
        <Check className="h-3 w-3" /> Pass
      </span>
    );
  }
  if (state === "fail") {
    return <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">Failed</span>;
  }
  if (state === "pending") {
    return <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300">Checking</span>;
  }
  return <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500">Not checked</span>;
}
