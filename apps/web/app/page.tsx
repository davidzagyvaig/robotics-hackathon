"use client";

import { useState } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import Conversation from "@/components/Conversation";
import LessonStage from "@/components/LessonStage";
import Quiz from "@/components/Quiz";
import { useProfile } from "@/lib/progress";
import { MAX_LEVEL } from "@/lib/curriculum";

// small braille wordmark dot-grid (motif only)
function DotMark() {
  const on = [1, 0, 1, 1, 1, 0];
  return (
    <div className="grid grid-cols-2 gap-[3px]" aria-hidden>
      {[0, 3, 1, 4, 2, 5].map((d, i) => (
        <span key={i} className={`h-[5px] w-[5px] rounded-full ${on[i] ? "bg-saffron" : "bg-line"}`} />
      ))}
    </div>
  );
}

function ProfileChip() {
  const p = useProfile();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 sm:flex">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-saffron/20 font-display text-[11px] font-semibold text-saffronDeep">
          {(p.name?.[0] ?? "?").toUpperCase()}
        </span>
        <span className="text-xs font-medium text-ink">{p.name ?? "Guest"}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Lv {p.level}/{MAX_LEVEL}
        </span>
        {p.streak > 0 && <span className="font-mono text-[10px] text-clay">🔥{p.streak}</span>}
      </div>
      <a
        href="https://github.com/davidzagyvaig/robotics-hackathon"
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition hover:text-ink"
      >
        github ↗
      </a>
    </div>
  );
}

export default function Page() {
  const [mode, setMode] = useState<"learn" | "quiz">("learn");
  return (
    <ConversationProvider>
      <main className="paper-bg grain flex h-screen flex-col text-ink">
        {/* header */}
        <header className="flex shrink-0 items-center justify-between border-b border-line/70 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <DotMark />
            <div className="leading-tight">
              <span className="font-display text-lg font-semibold tracking-tight">BrailleBuddy</span>
              <span className="ml-2 hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted sm:inline">
                feel your way into reading
              </span>
            </div>
          </div>
          <ProfileChip />
        </header>

        {/* two-pane: agent (left) | simulation (right) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="flex min-h-0 flex-col border-b border-line md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 px-5 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
                ① your tutor
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Conversation />
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-bone2/40">
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
                ② the cell
              </span>
              <div className="flex rounded-full border border-line bg-paper p-0.5 text-[11px]">
                {(["learn", "quiz"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-full px-3 py-1 font-mono uppercase tracking-[0.12em] transition ${
                      mode === m ? "bg-ink text-bone" : "text-muted hover:text-ink"
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
