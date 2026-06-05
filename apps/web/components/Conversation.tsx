"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useConversation } from "@elevenlabs/react";
import { controller } from "@/lib/controller";
import { progress, useProfile, knownLetters } from "@/lib/progress";
import { lessonByLevel } from "@/lib/curriculum";

// The LEFT pane: the voice tutor (and the brain of hands-free "disability mode"). Tools:
// identify_learner (voice identity → local Postgres), render_braille, render_word. A live
// transcript doubles as captions so the lesson works muted too.

const clientTools = {
  identify_learner: async (p: { name: string }) => {
    const r = await progress.identify(p.name);
    return r.isNew
      ? `New learner "${r.name}" created. Start at level 1.`
      : `Returning learner "${r.name}", level ${r.level}, ${r.mastered.length} letters mastered, ${r.streak}-day streak. Greet them back and resume.`;
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
  const active = status === "connected" || status === "connecting";

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

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]); // fresh conversation each time you start
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch("/api/get-signed-url");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get a signed URL");
      const lesson = lessonByLevel(profile.level);
      conversation.startSession({
        signedUrl: data.signedUrl,
        clientTools,
        dynamicVariables: {
          user_name: profile.name ?? "unknown",
          is_returning: profile.name ? "yes" : "no",
          level: String(profile.level),
          lesson_title: lesson?.title ?? "First five",
          known_letters: knownLetters(profile).join(", ") || "none yet",
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation.");
    }
  }, [conversation, profile]);

  useImperativeHandle(ref, () => ({ start: () => void start() }), [start]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-swan px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-3 w-3 rounded-full ${
              !active ? "bg-swan" : isSpeaking ? "bg-green animate-wiggle" : "bg-green"
            }`}
          />
          <span className="text-sm font-extrabold text-wolf">
            {!active
              ? "Dot is ready"
              : status === "connecting"
                ? "connecting…"
                : isSpeaking
                  ? "Dot is talking"
                  : "listening — say hi!"}
          </span>
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
              {active
                ? "Say hello — Dot will ask your name, then start your lesson."
                : profile.name
                  ? `Welcome back, ${profile.name}! Tap start to keep going.`
                  : "Meet Dot, your braille coach. Tap start and just talk."}
            </p>
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
