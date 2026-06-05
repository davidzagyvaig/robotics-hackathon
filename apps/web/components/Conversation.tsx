"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useConversation } from "@elevenlabs/react";
import { controller } from "@/lib/controller";
import { progress, useProfile } from "@/lib/progress";

// The LEFT pane: the voice tutor (and the brain of hands-free "disability mode"). Tools:
// identify_learner (voice identity → local Postgres), render_braille, render_word. A live
// transcript doubles as captions so the lesson works muted too.

const clientTools = {
  identify_learner: async (p: { name: string }) => {
    const r = await progress.identify(p.name);
    // Always onboard from the beginning this session; this tool only saves their progress.
    return `Saved. Greet ${r.name} warmly by name, then begin teaching from the very start with the letter A.`;
  },
  // Canonical tool: render any TEXT on the cell. A single character is held as one letter;
  // a longer string is stepped across the cell as a word. Accepts text/character/word so it
  // works no matter how the dashboard tool is defined.
  render_braille: async (p: { text?: string; character?: string; word?: string; seconds?: number }) => {
    const text = (p.text ?? p.character ?? p.word ?? "").trim();
    if (!text) return "No text was given to show.";
    return [...text].length <= 1
      ? controller.renderBraille(text, p.seconds ?? 4)
      : controller.renderWord(text, 1.5);
  },
  // alias kept for compatibility if a render_word tool is ever configured
  render_word: async (p: { word?: string; text?: string; seconds_per_letter?: number }) =>
    controller.renderWord(p.word ?? p.text ?? "", p.seconds_per_letter ?? 1.5),
};

type Line = { id: number; role: "user" | "ai"; text: string };
export type ConversationHandle = { start: () => void };

const Conversation = forwardRef<ConversationHandle>(function Conversation(_props, ref) {
  const profile = useProfile();
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [launchState, setLaunchState] = useState<"idle" | "opening" | "live">("idle");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [micBars, setMicBars] = useState<number[]>(Array.from({ length: 12 }, () => 0.12));
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    clientTools,
    onError: (m: string) => setError(m),
    onMessage: (msg: { message: string; source: string }) => {
      if (!msg?.message) return;
      idRef.current += 1;
      const role: "user" | "ai" = msg.source === "user" ? "user" : "ai";
      setTranscript((t) => [...t, { id: idRef.current, role, text: msg.message }].slice(-40));
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const isListening = conversation.isListening;
  const active = status === "connected" || status === "connecting";
  const phase = launchState === "opening" ? "opening" : isSpeaking ? "speaking" : isListening ? "listening" : "idle";

  useEffect(() => {
    if (active) setLaunchState("live");
    if (!active) setLaunchState("idle");
  }, [active]);

  useEffect(() => {
    void progress.hydrate();
  }, []);
  useEffect(() => {
    try {
      conversation.setVolume?.({ volume: profile.voiceEnabled ? 1 : 0 });
    } catch {
      /* no setVolume */
    }
  }, [profile.voiceEnabled, status, conversation]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (!active) {
      setMicBars(Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? 0.15 : 0.08)));
      return;
    }

    let frame = 0;
    let alive = true;

    const sample = () => {
      if (!alive) return;

      const data = conversation.getInputByteFrequencyData?.() ?? new Uint8Array();
      const next = Array.from({ length: 12 }, (_, i) => {
        const start = Math.floor((data.length * i) / 12);
        const end = Math.max(start + 1, Math.floor((data.length * (i + 1)) / 12));
        let sum = 0;
        let count = 0;
        for (let j = start; j < end && j < data.length; j += 1) {
          sum += data[j];
          count += 1;
        }
        const avg = count ? sum / count / 255 : 0;
        const floor = phase === "speaking" || phase === "listening" ? 0.06 : 0.03;
        return Math.min(1, floor + avg * 0.95);
      });

      setMicBars((prev) => next.map((value, i) => prev[i] * 0.55 + value * 0.45));
      frame = window.requestAnimationFrame(sample);
    };

    frame = window.requestAnimationFrame(sample);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
    };
  }, [active, conversation, phase]);

  // Warm a WebRTC token (UDP transport, lowest latency) so Start is instant.
  useEffect(() => {
    let alive = true;
    const warm = async () => {
      try {
        const res = await fetch("/api/get-conversation-token");
        const data = await res.json();
        if (alive && res.ok && data.token) setSignedUrl(data.token);
      } catch {
        if (alive) setSignedUrl(null);
      }
    };
    void warm();
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]); // fresh conversation each time you start
    setLaunchState("opening");
    const dynamicVariables = {
      user_name: "unknown",
      is_returning: "no",
      level: "1",
      lesson_title: "First five",
      known_letters: "none yet",
    };
    try {
      controller.connectSimulated();
      await controller.clear();
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer WebRTC (UDP / LiveKit) — lowest latency + proper audio jitter handling.
      const token =
        signedUrl ??
        (await (async () => {
          const res = await fetch("/api/get-conversation-token");
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to get a token");
          return data.token as string;
        })());
      conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        clientTools,
        dynamicVariables,
      });
    } catch (webrtcErr) {
      // Fallback: WebSocket signed URL if WebRTC isn't available.
      try {
        const res = await fetch("/api/get-signed-url");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to get a signed URL");
        conversation.startSession({
          signedUrl: data.signedUrl,
          connectionType: "websocket",
          clientTools,
          dynamicVariables,
        });
      } catch (e) {
        setLaunchState("idle");
        setError(e instanceof Error ? e.message : "Could not start the conversation.");
      }
    }
  }, [conversation, signedUrl]);

  useImperativeHandle(ref, () => ({ start: () => void start() }), [start]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-swan px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-3 w-3 rounded-full ${
              phase === "idle" ? "bg-swan" : phase === "opening" ? "bg-gold animate-wiggle" : isSpeaking ? "bg-green animate-wiggle" : "bg-green"
            }`}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-extrabold text-wolf">
              {phase === "opening"
                ? "Opening mic…"
                : phase === "speaking"
                  ? "Dot is talking"
                  : phase === "listening"
                    ? "Mic live — talk to Dot"
                    : "Dot is ready"}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex h-8 items-end gap-[3px] rounded-full border border-swan bg-white px-2 py-1 shadow-[0_2px_0_rgba(0,0,0,0.04)]" aria-hidden>
                {micBars.map((level, i) => {
                  const hue = phase === "idle" ? "bg-swan" : phase === "opening" ? "bg-gold" : "bg-green";
                  const height = Math.max(6, Math.round(6 + level * 22 + (i % 3) * 1.5));
                  return (
                    <span
                      key={i}
                      className={`w-1 rounded-full ${hue}`}
                      style={{ height, opacity: phase === "idle" ? 0.45 : 1 }}
                    />
                  );
                })}
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-hare">
                {phase === "opening" ? "sending" : phase === "listening" ? "listening" : phase === "speaking" ? "talking" : "quiet"}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => progress.setVoice(!profile.voiceEnabled)}
          className="rounded-full border-2 border-swan bg-white px-3 py-1.5 text-xs font-extrabold text-wolf transition hover:border-hare"
          aria-pressed={profile.voiceEnabled}
          title={profile.voiceEnabled ? "Mute Dot's voice" : "Unmute Dot's voice"}
        >
          {profile.voiceEnabled ? "🔊 Voice on" : "🔇 Muted"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {transcript.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-green-light text-3xl">
              🦉
            </div>
            <p className="max-w-xs text-base font-bold leading-relaxed text-wolf">
              {phase === "opening"
                ? "Opening the mic now. You should see Dot wake up in a moment."
                : active
                  ? "Say hello — Dot will ask your name, then start your lesson."
                : profile.name
                  ? `Welcome back, ${profile.name}! Tap start to keep going.`
                  : "Meet Dot, your braille coach. Tap start and just talk."}
            </p>
            {active && (
              <div className="mt-1 rounded-full border border-swan bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-hare">
                {phase === "opening"
                  ? "Mic opening"
                  : phase === "speaking"
                    ? "Dot is speaking"
                    : "Speak now"}
              </div>
            )}
          </div>
        ) : (
          transcript.map((l) => (
            <div key={l.id} className={`flex ${l.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] font-bold leading-relaxed ${
                  l.role === "user" ? "bg-eel text-white" : "bg-polar text-eel"
                }`}
              >
                {l.text}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t-2 border-swan px-5 py-4">
        {!active ? (
          <button onClick={() => void start()} className="btn3d btn-green w-full text-base">
            Start lesson
          </button>
        ) : (
          <button onClick={() => conversation.endSession()} className="btn-white w-full px-6 py-3">
            End session
          </button>
        )}
        {error && <p className="mt-2 text-center text-xs font-bold text-cardinal">{error}</p>}
      </div>
    </div>
  );
});

export default Conversation;
