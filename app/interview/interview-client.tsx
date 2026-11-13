"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarVisualizer,
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import {
  AudioPresets,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RoomOptions,
} from "livekit-client";
import "@livekit/components-styles";
import { Bot, User } from "lucide-react";

import { InterviewSetup } from "@/components/interview-setup";
import { LiveCodingPane } from "@/components/live-coding-pane";
import { useActiveQuestion } from "@/hooks/useActiveQuestion";
import { useIntegrityReporter } from "@/hooks/useIntegrityReporter";
import { clearJoin, stashJoin } from "@/lib/join-cache";
import { parseJoinDetails, readApiError, type JoinDetails } from "@/lib/vetting";

/** Prefer audio under lossy networks; keep camera cheap so it doesn't starve TTS. */
const INTERVIEW_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    audioPreset: AudioPresets.speech,
    dtx: false,
    red: true,
    videoEncoding: {
      maxBitrate: 600_000,
      maxFramerate: 24,
    },
    simulcast: true,
  },
};

const DATA_TOPIC = "my-interviewer";

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
  const [setupDone, setSetupDone] = useState(false);
  const [connection, setConnection] = useState<JoinDetails | null>(null);
  const [phase, setPhase] = useState<"setup" | "joining" | "live" | "left">("setup");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setupDone || phase !== "joining") return;
    let cancelled = false;

    void (async () => {
      try {
        // Always remint + explicit agent dispatch. Cached tokens skip dispatch
        // when the LiveKit room already exists (agent never rejoins).
        clearJoin(sessionId);
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
        stashJoin(sessionId, join);
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
  }, [setupDone, phase, sessionId, candidateToken]);

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

  if (!setupDone || phase === "setup") {
    return (
      <InterviewSetup
        onReady={() => {
          setSetupDone(true);
          setPhase("joining");
        }}
      />
    );
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
      options={INTERVIEW_ROOM_OPTIONS}
      audio={{
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      }}
      video={true}
      // Re-prompt screen share for the live room after the setup probe.
      screen={true}
      onDisconnected={() => {
        clearJoin(sessionId);
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
  const room = useRoomContext();
  const tracks = useTracks([
    Track.Source.Camera,
    Track.Source.Microphone,
    Track.Source.ScreenShare,
  ]);
  const { localParticipant } = useLocalParticipant();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [shareWarning, setShareWarning] = useState<string | null>(null);
  const hadScreenShare = useRef(false);
  const { codingQuestion } = useActiveQuestion(sessionId, candidateToken);

  const agentAudioTrack = tracks.find(
    (track) => track.participant.isAgent && track.source === Track.Source.Microphone,
  );

  const localCameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
  const localCameraTrack = localCameraPub?.track;
  const screenShareOn = Boolean(
    localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track,
  );

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
    el.addEventListener("loadeddata", markReady);
    el.addEventListener("loadedmetadata", markReady);

    return () => {
      el.removeEventListener("loadeddata", markReady);
      el.removeEventListener("loadedmetadata", markReady);
      localCameraTrack.detach(el);
      setCameraReady(false);
    };
  }, [localCameraTrack]);

  useIntegrityReporter(videoRef, cameraReady, sessionId, candidateToken);

  useEffect(() => {
    if (screenShareOn) {
      hadScreenShare.current = true;
      setShareWarning(null);
    }
  }, [screenShareOn]);

  useEffect(() => {
    const onUnpublished = (publication: LocalTrackPublication) => {
      if (publication.source !== Track.Source.ScreenShare) return;
      if (!hadScreenShare.current) return;
      setShareWarning("Screen share stopped — share your entire screen again from the control bar.");
      void fetch(`/api/vetting/sessions/${encodeURIComponent(sessionId)}/integrity`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signal: "screenshare_stopped",
          observed_at_ms: Date.now(),
          message: "Screen share track ended during interview",
        }),
        keepalive: true,
      }).catch(() => undefined);
    };

    room.on(RoomEvent.LocalTrackUnpublished, onUnpublished);
    return () => {
      room.off(RoomEvent.LocalTrackUnpublished, onUnpublished);
    };
  }, [room, sessionId, candidateToken]);

  const publishSnapshot = useCallback(
    (payload: { questionId: string; code: string; final: boolean; language: string }) => {
      const encoded = new TextEncoder().encode(
        JSON.stringify({
          type: "coding_snapshot",
          question_id: payload.questionId,
          code: payload.code,
          final: payload.final,
          language: payload.language,
        }),
      );
      void localParticipant.publishData(encoded, { reliable: true, topic: DATA_TOPIC });
    },
    [localParticipant],
  );

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
        <p className={`text-xs ${screenShareOn ? "text-emerald-400" : "text-amber-300"}`}>
          {screenShareOn ? "Screen sharing on" : "Screen share required"}
        </p>
      </header>

      {shareWarning && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {shareWarning}
        </div>
      )}

      <div
        className={`my-auto grid grid-cols-1 gap-6 py-6 ${
          codingQuestion ? "lg:grid-cols-[0.9fr_1.2fr_0.7fr]" : "md:grid-cols-2"
        }`}
      >
        <div className="relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
            <Bot className="h-10 w-10" />
          </div>
          <p className="mb-1 font-semibold text-slate-200">AI Interviewer</p>
          <p className="mb-6 text-xs text-slate-400">
            {agentAudioTrack ? "Live — answer when prompted" : "Connecting interviewer…"}
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

        {codingQuestion && (
          <LiveCodingPane
            question={codingQuestion}
            sessionId={sessionId}
            candidateToken={candidateToken}
            onPublishSnapshot={publishSnapshot}
          />
        )}

        <div
          className={`relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-0 ${
            codingQuestion ? "" : ""
          }`}
        >
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
            screenShare: true,
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
