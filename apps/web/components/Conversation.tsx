"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { controller } from "@/lib/controller";
import { progress, useProfile, knownLetters } from "@/lib/progress";
import { lessonByLevel } from "@/lib/curriculum";

// The LEFT pane: the voice tutor. The agent has two client tools — render_braille (one
// letter) and render_word (step a word) — both run here in the browser and drive the
// cell sim / device via the controller. We also show a live transcript (captions) so the
// lesson works even with the voice muted, and pass the learner's level to the agent.

const clientTools = {
  render_braille: async (p: { character: string; seconds: number }) =>
    controller.renderBraille(p.character, p.seconds),
  render_word: async (p: { word: string; seconds_per_letter?: number; seconds?: number }) =>
    controller.renderWord(p.word, p.seconds_per_letter ?? p.seconds ?? 1.5),
};

type Line = { id: number; role: "user" | "ai"; text: string };

export default function Conversation() {
  const profile = useProfile();
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [nameDraft, setNameDraft] = useState("");
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

  // keep the agent's audio in sync with the voice toggle
  useEffect(() => {
    try {
      conversation.setVolume?.({ volume: profile.voiceEnabled ? 1 : 0 });
    } catch {
      /* SDK without setVolume — toggle still controls UI */
    }
  }, [profile.voiceEnabled, status, conversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const start = useCallback(async () => {
    setError(null);
    progress.touch();
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch("/api/get-signed-url");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get a signed URL");
      const lesson = lessonByLevel(profile.level);
      conversation.startSession({
        signedUrl: data.signedUrl,
        clientTools,
        // Injected into the agent's prompt as {{variables}} — see agent/prompt.md.
        dynamicVariables: {
          user_name: profile.name ?? "there",
          level: String(profile.level),
          lesson_title: lesson?.title ?? "First five",
          known_letters: knownLetters(profile).join(", ") || "none yet",
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation.");
    }
  }, [conversation, profile]);

  return (
    <div className="flex h-full flex-col">
      {/* header row: status + voice toggle */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              !active ? "bg-line" : isSpeaking ? "bg-saffron animate-breathe" : "bg-saffron"
            }`}
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            {!active
              ? "tutor ready"
              : status === "connecting"
                ? "connecting…"
                : isSpeaking
                  ? "Dot is speaking"
                  : "listening"}
          </span>
        </div>
        <button
          onClick={() => progress.setVoice(!profile.voiceEnabled)}
          className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink2 transition hover:border-ink/30"
          aria-pressed={profile.voiceEnabled}
          title={profile.voiceEnabled ? "Mute the tutor's voice" : "Unmute the tutor's voice"}
        >
          {profile.voiceEnabled ? "🔊 voice on" : "🔇 muted"}
        </button>
      </div>

      {/* transcript / captions */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {transcript.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              {active
                ? "Say hello to Dot, your braille tutor. Try “teach me the letter C” or “let’s read a word.”"
                : profile.name
                  ? `Welcome back, ${profile.name}. Press start when you’re ready.`
                  : "Meet Dot — a patient braille tutor. Press start and say hello."}
            </p>
          </div>
        ) : (
          transcript.map((l) => (
            <div key={l.id} className={`flex ${l.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  l.role === "user"
                    ? "bg-ink text-bone"
                    : "border border-line bg-paper text-ink2"
                }`}
              >
                {l.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* controls */}
      <div className="border-t border-line px-5 py-4">
        {!active && !profile.name && (
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameDraft.trim()) progress.setName(nameDraft);
            }}
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your name (optional)"
              className="flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-ink/40"
            />
            <button
              type="submit"
              className="rounded-full border border-line bg-paper px-3 py-2 text-xs text-ink2 hover:border-ink/30"
            >
              save
            </button>
          </form>
        )}
        {!active ? (
          <button
            onClick={() => void start()}
            className="w-full rounded-full bg-saffron px-6 py-3 text-sm font-semibold text-ink shadow-card transition hover:bg-saffronDeep hover:text-bone"
          >
            ● Start your lesson
          </button>
        ) : (
          <button
            onClick={() => conversation.endSession()}
            className="w-full rounded-full border border-line bg-paper px-6 py-3 text-sm font-medium text-ink2 transition hover:border-ink/30"
          >
            End session
          </button>
        )}
        {error && <div className="mt-2 text-center text-[11px] text-clay">{error}</div>}
      </div>
    </div>
  );
}
