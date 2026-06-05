"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import Conversation, { type ConversationHandle } from "@/components/Conversation";
import LessonStage from "@/components/LessonStage";
import Quiz from "@/components/Quiz";
import { controller } from "@/lib/controller";
import { useProfile } from "@/lib/progress";

function DotMark() {
  const on = [1, 0, 1, 1, 1, 0];
  return (
    <div className="grid grid-cols-2 gap-[3px]" aria-hidden>
      {[0, 3, 1, 4, 2, 5].map((d, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${on[i] ? "bg-green" : "bg-swan"}`} />
      ))}
    </div>
  );
}

function TopStats() {
  const p = useProfile();
  return (
    <div className="flex items-center gap-4">
      <a href="/learners" className="hidden text-sm font-extrabold text-wolf transition hover:text-eel sm:block">
        Learners
      </a>
      <span className="flex items-center gap-1.5 text-base font-extrabold text-fire" title="day streak">
        🔥 {p.streak}
      </span>
      <span className="flex items-center gap-1.5 text-base font-extrabold text-gold" title="letters mastered">
        ⭐ {p.mastered.length}
      </span>
      <span className="hidden items-center gap-1.5 rounded-full border-2 border-swan bg-white px-3 py-1 text-sm font-extrabold text-eel sm:flex">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-green-light text-xs text-green-dark">
          {(p.name?.[0] ?? "?").toUpperCase()}
        </span>
        {p.name ?? "Guest"}
      </span>
    </div>
  );
}

export default function Page() {
  const [mode, setMode] = useState<"learn" | "quiz">("learn");
  const convRef = useRef<ConversationHandle>(null);

  // The device is just motors (pins up/down) with no sensors — so the on-screen cell IS
  // the device by default and everything is voice-guided. Make the cell ready instantly.
  useEffect(() => {
    controller.connectSimulated();
    return controller.onDeviceButton(() => convRef.current?.start());
  }, []);

  return (
    <ConversationProvider>
      <main className="flex h-screen flex-col bg-white text-eel">
        {/* top bar */}
        <header className="flex shrink-0 items-center justify-between border-b-2 border-swan px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <DotMark />
            <span className="text-xl font-extrabold tracking-tight text-green">BrailleBuddy</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => convRef.current?.start()}
              className="btn3d btn-green text-xs"
              aria-label="Start hands-free voice mode — close your eyes and let Dot guide you"
            >
              🎧 Hands-free
            </button>
            <TopStats />
          </div>
        </header>

        {/* two-pane: tutor (left) | cell (right) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="flex min-h-0 flex-col border-b-2 border-swan md:border-b-0 md:border-r-2">
            <div className="px-5 pt-4">
              <span className="text-xs font-extrabold uppercase tracking-wide text-hare">
                ① Your coach
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Conversation ref={convRef} />
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-polar">
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="text-xs font-extrabold uppercase tracking-wide text-hare">
                ② The cell
              </span>
              <div className="flex gap-1 rounded-full border-2 border-swan bg-white p-1">
                {(["learn", "quiz"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-full px-4 py-1 text-xs font-extrabold uppercase tracking-wide transition ${
                      mode === m ? "bg-green text-white" : "text-hare hover:text-eel"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1">{mode === "learn" ? <LessonStage /> : <Quiz />}</div>
          </section>
        </div>
      </main>
    </ConversationProvider>
  );
}
