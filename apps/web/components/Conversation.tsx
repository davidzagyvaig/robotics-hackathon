"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useConversation } from "@elevenlabs/react";
import { controller } from "@/lib/controller";
import { progress, useProfile } from "@/lib/progress";
import { debugLog, debugReset } from "@/lib/debug";

// The LEFT pane: the voice tutor (and the brain of hands-free "disability mode"). Tools:
// identify_learner (voice identity → local Postgres), render_braille, render_word. A live
// transcript doubles as captions so the lesson works muted too.

const clientTools = {
  identify_learner: async (p: { name: string }) => {
    debugLog("tool:identify_learner", { name: p.name });
    const r = await progress.identify(p.name);
    // Always onboard from the beginning this session; this tool only saves their progress.
    return `Saved. Greet ${r.name} warmly by name, then begin teaching from the very start with the letter A.`;
  },
  // Canonical tool: render any TEXT on the cell. A single character is held as one letter;
  // a longer string is stepped across the cell as a word. Accepts text/character/word so it
  // works no matter how the dashboard tool is defined.
  render_braille: async (p: { text?: string; character?: string; word?: string; seconds?: number }) => {
    const text = (p.text ?? p.character ?? p.word ?? "").trim();
    debugLog("tool:render_braille", { raw: p, resolved: text || "(empty)" });
    if (!text) return "No text was given to show.";
    if ([...text].length <= 1) return controller.renderBraille(text, p.seconds ?? 4);
    // Multi-letter word: step it in the BACKGROUND and return immediately. Awaiting the full
    // animation (~7s for a 4-letter word) blows the tool's 3s response timeout, which made the
    // agent think the cell failed ("cell is having trouble") and retry, stacking animations.
    void controller.renderWord(text, 1.6);
    return `The cell is now spelling "${text}" one letter at a time.`;
  },
  // alias kept for compatibility if a render_word tool is ever configured
  render_word: async (p: { word?: string; text?: string; seconds_per_letter?: number }) =>
    controller.renderWord(p.word ?? p.text ?? "", p.seconds_per_letter ?? 1.5),
  // Flip the right pane between teaching and quizzing so the screen follows the lesson.
  // In "quiz" the cell hides the letter so it's a real test; "learn" reveals it again.
  set_mode: async (p: { mode?: string }) => {
    const mode = (p.mode ?? "").toLowerCase().includes("quiz") ? "quiz" : "learn";
    debugLog("tool:set_mode", { raw: p, resolved: mode });
    controller.setMode(mode);
    return `The screen is now in ${mode} mode.`;
  },
};

// Safety net for Qwen's flaky tool-calling: when Dot's SPEECH clearly names the letter she's
// teaching ("That's A — dot one", "the letter B", "let's try C"), mirror it onto the cell so the
// cell never lags her voice — even if she forgot to call render_braille. Single-letter match only,
// so "that's great" / "you're a natural" don't trigger it. Used in LEARN mode only (in QUIZ she
// never names the answer, so there's nothing to mirror and nothing gets revealed).
function taughtLetter(text: string): string | null {
  const m = text.match(
    /\b(?:that'?s|this is|here'?s|the letter|let'?s (?:try|meet|move on to))\s+(?:the letter\s+)?([a-z])\b/i
  );
  return m ? m[1].toLowerCase() : null;
}

type Line = { id: number; role: "user" | "ai"; text: string };
export type ConversationHandle = { start: () => void };

const Conversation = forwardRef<ConversationHandle>(function Conversation(_props, ref) {
  const profile = useProfile();
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [launchState, setLaunchState] = useState<"idle" | "opening" | "live">("idle");
  const [micBars, setMicBars] = useState<number[]>(Array.from({ length: 12 }, () => 0.12));
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // --- auto-reconnect / error recovery ---
  const endedByUserRef = useRef(false); // true only when the learner taps "End session"
  const reconnectRef = useRef(0); // consecutive auto-reconnect attempts
  const startRef = useRef<() => Promise<void>>(); // latest connect fn, for reconnect from callbacks
  const MAX_RECONNECTS = 4;

  const conversation = useConversation({
    clientTools,
    onConnect: (info: unknown) => {
      debugLog("conn:CONNECTED", { info });
      reconnectRef.current = 0; // a good connection clears the retry budget
      setError(null);
    },
    onDisconnect: (info: unknown) => {
      debugLog("conn:disconnected", { info });
      // If the learner ended it, stay ended. Otherwise it dropped — try to come back.
      if (endedByUserRef.current) {
        endedByUserRef.current = false;
        return;
      }
      if (reconnectRef.current < MAX_RECONNECTS) {
        reconnectRef.current += 1;
        debugLog("conn:auto-reconnect", { attempt: reconnectRef.current });
        setError(`Reconnecting… (${reconnectRef.current})`);
        setLaunchState("opening");
        setTimeout(() => void startRef.current?.(), 700);
      } else {
        debugLog("conn:gave-up");
        setLaunchState("idle");
        setError("Connection lost. Tap Start to resume — your progress is saved.");
      }
    },
    onStatusChange: (s: unknown) => debugLog("conn:status", { s }),
    onModeChange: (m: unknown) => debugLog("conn:mode", { m }),
    onError: (m: string) => {
      debugLog("conn:ERROR", { message: m });
      // Surface it, but let onDisconnect drive the actual reconnect so we don't double-fire.
      setError(typeof m === "string" && m ? m : "Something hiccuped — trying to recover…");
    },
    onMessage: (msg: { message: string; source: string }) => {
      if (!msg?.message) return;
      const role: "user" | "ai" = msg.source === "user" ? "user" : "ai";
      // The key latency signal: timestamp of every USER utterance and every DOT reply.
      // The gap between a "user" line and the next "ai" line = response latency.
      debugLog(role === "user" ? "speech:USER" : "speech:DOT", { text: msg.message });

      // Safety net: mirror the letter Dot names onto the cell (LEARN mode only) so a missed
      // render_braille call never leaves the cell blank while she describes a letter.
      if (role === "ai") {
        const snap = controller.getSnapshot();
        if (snap.mode === "learn") {
          const L = taughtLetter(msg.message);
          if (L && L.toUpperCase() !== snap.currentLabel) {
            void controller.renderBraille(L);
            debugLog("safetynet:render", { letter: L });
          }
        }
      }

      idRef.current += 1;
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
    // `conversation` is a fresh object every render — depending on it would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.voiceEnabled, status]);
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
    // NOTE: `conversation` is intentionally NOT a dep — its reference changes every render,
    // which re-triggered this effect → setMicBars → render → ∞ ("Maximum update depth").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, phase]);

  // NOTE: WebRTC conversation tokens are short-lived (they expire within ~a minute), so we
  // do NOT pre-warm one — a warmed token is already expired by the time Start is clicked
  // ("token is expired"). We mint a fresh token inside start() at click time instead.

  // `fresh` = a user-initiated Start (clears transcript, resets the retry budget). An
  // auto-reconnect passes fresh=false so it keeps the transcript and the retry counter.
  const start = useCallback(async (fresh = true) => {
    setError(null);
    setLaunchState("opening");
    if (fresh) {
      endedByUserRef.current = false;
      reconnectRef.current = 0;
      setTranscript([]); // fresh conversation each time YOU start
      debugReset();
      debugLog("session:start-clicked");
    } else {
      debugLog("session:reconnecting");
    }
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

      // Primary path: WebRTC (the same low-latency transport as the ElevenLabs preview).
      // `cache: "no-store"` is CRITICAL — without it the browser replays a cached (expired)
      // token response on every click ("token is expired"), never hitting the server.
      const res = await fetch("/api/get-conversation-token", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get a conversation token");
      debugLog("transport:webrtc-starting");
      const id = await conversation.startSession({
        conversationToken: data.token as string,
        connectionType: "webrtc",
        clientTools,
        dynamicVariables,
      });
      debugLog("transport:webrtc-OK", { conversationId: id });
    } catch (webrtcError) {
      debugLog("transport:webrtc-FAILED", {
        error: webrtcError instanceof Error ? webrtcError.message : String(webrtcError),
      });
      // Fallback: WebSocket (signed URL) if WebRTC can't be reached (e.g. UDP blocked).
      try {
        const res = await fetch("/api/get-signed-url", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to get a signed URL");
        debugLog("transport:websocket-FALLBACK-starting");
        await conversation.startSession({
          signedUrl: data.signedUrl as string,
          connectionType: "websocket",
          clientTools,
          dynamicVariables,
        });
        debugLog("transport:websocket-FALLBACK-OK");
      } catch {
        setLaunchState("idle");
        setError(
          webrtcError instanceof Error ? webrtcError.message : "Could not start the conversation."
        );
      }
    }
  }, [conversation]);

  // Keep a live ref so onDisconnect can reconnect (auto-reconnect keeps the transcript).
  startRef.current = () => start(false);

  useImperativeHandle(ref, () => ({ start: () => void start(true) }), [start]);

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
          <button onClick={() => void start(true)} className="btn3d btn-green w-full text-base">
            Start lesson
          </button>
        ) : (
          <button
            onClick={() => {
              endedByUserRef.current = true; // intentional end → do NOT auto-reconnect
              reconnectRef.current = 0;
              void conversation.endSession();
            }}
            className="btn-white w-full px-6 py-3"
          >
            End session
          </button>
        )}
        {error && <p className="mt-2 text-center text-xs font-bold text-cardinal">{error}</p>}
      </div>
    </div>
  );
});

export default Conversation;
