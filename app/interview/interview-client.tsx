"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarVisualizer,
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { Bot, User } from "lucide-react";

import { useIntegrityReporter } from "@/hooks/useIntegrityReporter";
import { readJoin } from "@/lib/join-cache";
import { parseJoinDetails, readApiError, type JoinDetails } from "@/lib/vetting";

export function InterviewClient() {
  const search = useSearchParams();
  const sessionId = search.get("session_id") ?? "";
  const candidateToken = search.get("token") ?? "";

  if (!sessionId || !candidateToken) {
    return (
      <StatusCard
        title="Missing interview session"
        body="Start from the resume upload so this page has a session and candidate token."
      />
    );
  }

  return <InterviewConnection sessionId={sessionId} candidateToken={candidateToken} />;
}

function InterviewConnection({
  sessionId,
  candidateToken,
}: {
  sessionId: string;
  candidateToken: string;
}) {
  const [connection, setConnection] = useState<JoinDetails | null>(null);
  const [phase, setPhase] = useState<"joining" | "live" | "left">("joining");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cached = readJoin(sessionId);
    if (cached) {
      setConnection(cached);
      setPhase("live");
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/vetting/sessions/${encodeURIComponent(sessionId)}/join`, {
          method: "POST",
          headers: { Authorization: `Bearer ${candidateToken}` },
        });
        if (!response.ok) {
          if (!cancelled) setError(await readApiError(response));
          return;
        }
        const join = parseJoinDetails(await response.json());
        if (!join) {
          if (!cancelled) setError("The server returned an unexpected join response.");
          return;
        }
        if (!cancelled) {
          setConnection(join);
          setPhase("live");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not join the interview.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, candidateToken]);

  if (phase === "left") {
    return (
      <StatusCard
        title="Interview ended"
        body="You left the room. Scores and integrity notes are on the admin review page."
      />
    );
  }

  if (error) {
    return <StatusCard title="Could not join" body={error} />;
  }

  if (!connection || phase !== "live") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Joining interview…
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={connection.serverUrl}
      token={connection.participantToken}
      connect={true}
      audio={{
        // Browser WebRTC AEC/NS only — agent-side ai-coustics handles heavy NC.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }}
      video={true}
      onDisconnected={() => {
        setConnection(null);
        setPhase("left");
      }}
      data-lk-theme="default"
      className="flex min-h-screen flex-col bg-slate-950"
    >
      <ActiveSession sessionId={sessionId} candidateToken={candidateToken} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function ActiveSession({
  sessionId,
  candidateToken,
}: {
  sessionId: string;
  candidateToken: string;
}) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone]);
  const { localParticipant } = useLocalParticipant();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const agentAudioTrack = tracks.find(
    (track) => track.participant.isAgent && track.source === Track.Source.Microphone,
  );

  const localCameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
  const localCameraTrack = localCameraPub?.track;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !localCameraTrack) {
      setCameraReady(false);
      return;
    }
    localCameraTrack.attach(el);

    const markReady = () => {
      if (el.readyState >= 2 && el.videoWidth > 0) setCameraReady(true);
    };
    markReady();
    el.addEventListener('loadeddata', markReady);
    el.addEventListener('loadedmetadata', markReady);

    return () => {
      el.removeEventListener('loadeddata', markReady);
      el.removeEventListener('loadedmetadata', markReady);
      localCameraTrack.detach(el);
      setCameraReady(false);
    };
  }, [localCameraTrack]);

  useIntegrityReporter(videoRef, cameraReady, sessionId, candidateToken);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-between p-6 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
          </span>
          <h2 className="font-semibold text-slate-200">Interview Session Live</h2>
        </div>
      </header>

      <div className="my-auto grid grid-cols-1 gap-6 py-6 md:grid-cols-2">
        <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
            <Bot className="h-10 w-10" />
          </div>
          <p className="mb-1 font-semibold text-slate-200">AI Interviewer</p>
          <p className="mb-6 text-xs text-slate-400">
            {agentAudioTrack ? "Phase 1 · Introduction — answer when prompted" : "Connecting interviewer…"}
          </p>

          <div className="h-12 w-full max-w-xs">
            {agentAudioTrack ? (
              <BarVisualizer
                trackRef={agentAudioTrack as TrackReference}
                barCount={15}
                options={{ minHeight: 10 }}
                className="h-full"
              />
            ) : (
              <div className="text-center text-xs text-slate-600">Waiting for agent audio...</div>
            )}
          </div>
        </div>

        <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
          />
          {!cameraReady && (
            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
                <User className="h-10 w-10" />
              </div>
              <p className="font-semibold text-slate-200">Candidate (You)</p>
              <p className="mt-1 text-xs text-slate-500">Waiting for camera…</p>
            </div>
          )}
          {cameraReady && (
            <div className="absolute bottom-3 left-3 z-10 rounded-md bg-black/50 px-2 py-1 text-xs text-slate-200">
              You · proctoring on
            </div>
          )}
        </div>
      </div>

      <footer className="flex justify-center pb-4">
        <ControlBar
          controls={{
            microphone: true,
            camera: true,
            screenShare: false,
            chat: false,
            leave: true,
          }}
        />
      </footer>
    </div>
  );
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
        <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
        <p className="mb-8 text-sm text-slate-400">{body}</p>
        <Link
          href="/apply"
          className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 font-medium text-white hover:bg-blue-500"
        >
          Upload resume & interview
        </Link>
      </div>
    </div>
  );
}
