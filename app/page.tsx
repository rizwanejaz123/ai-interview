'use client';

import { useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  BarVisualizer,
  useTracks,
  MediaDeviceMenu,
  TrackReference,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { Mic, Video, Bot, User, PhoneOff, Sparkles } from 'lucide-react';

export default function InterviewRoom() {
  const [connectionDetails, setConnectionDetails] = useState<{
    serverUrl: string;
    participantToken: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const startInterview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/connection-details');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConnectionDetails({
        serverUrl: data.serverUrl,
        participantToken: data.participantToken,
      });
    } catch (err) {
      alert('Failed to start session. Check console/env variables.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnected = () => {
    setConnectionDetails(null);
  };

  if (!connectionDetails) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">AI Technical Interview</h1>
          <p className="text-slate-400 text-sm mb-8">
            Connect your microphone and camera to begin your automated screening session.
          </p>
          <button
            onClick={startInterview}
            disabled={loading}
            className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? 'Preparing Session...' : 'Start Interview'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={connectionDetails.serverUrl}
      token={connectionDetails.participantToken}
      connect={true}
      audio={true}
      video={true}
      onDisconnected={handleDisconnected}
      data-lk-theme="default"
      className="min-h-screen bg-slate-950 flex flex-col"
    >
      <ActiveSession />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function ActiveSession() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone]);
  const agentAudioTrack = tracks.find(
    (t) => t.participant.isAgent && t.source === Track.Source.Microphone
  );

  return (
    <div className="flex-1 flex flex-col justify-between p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <h2 className="font-semibold text-slate-200">Interview Session Live</h2>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-auto py-6">
        {/* AI Agent Tile */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden">
          <div className="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-4">
            <Bot className="w-10 h-10" />
          </div>
          <p className="font-semibold text-slate-200 mb-1">AI Interviewer</p>
          <p className="text-xs text-slate-400 mb-6">
            {agentAudioTrack
              ? 'Phase 1 · Introduction — answer when prompted'
              : 'Connecting interviewer…'}
          </p>

          {/* Live Voice Audio Waveform Visualizer */}
          <div className="w-full max-w-xs h-12">
            {agentAudioTrack ? (
              <BarVisualizer
                trackRef={agentAudioTrack as TrackReference}
                barCount={15}
                options={{ minHeight: 10 }}
                className="h-full"
              />
            ) : (
              <div className="text-slate-600 text-xs text-center">Waiting for agent audio...</div>
            )}
          </div>
        </div>

        {/* Candidate Video Feed Tile */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden">
          <div className="w-20 h-20 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
            <User className="w-10 h-10" />
          </div>
          <p className="font-semibold text-slate-200">Candidate (You)</p>
        </div>
      </div>

      {/* Control Bar */}
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
