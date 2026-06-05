"use client";

import BrailleCell from "@/components/BrailleCell";
import ConnectDevice from "@/components/ConnectDevice";
import MiniCell from "@/components/MiniCell";
import { useBrailleState } from "@/lib/controller";
import { useProfile } from "@/lib/progress";
import { textToCells } from "@/lib/braille";
import { lessonByLevel, MAX_LEVEL } from "@/lib/curriculum";

// The RIGHT pane: the physical-cell simulation. The big tactile cell mirrors the device
// (or on-screen mode); when a word is being read, a strip of mini-cells shows the whole
// word with the active letter highlighted, and the word text underneath. A level rail
// shows where the learner is.

export default function LessonStage() {
  const { currentWord, wordIndex } = useBrailleState();
  const profile = useProfile();
  const lesson = lessonByLevel(profile.level);

  const cells = currentWord ? textToCells(currentWord) : [];

  return (
    <div className="flex h-full flex-col">
      {/* level rail */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-saffronDeep">
            Level {profile.level}
            <span className="text-muted">/{MAX_LEVEL}</span>
          </span>
          <span className="text-sm font-medium text-ink">{lesson?.title ?? "—"}</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>{profile.mastered.length} letters</span>
          {profile.streak > 0 && <span className="text-clay">🔥 {profile.streak}d</span>}
        </div>
      </div>

      {/* the cell + word strip */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-8">
        <BrailleCell />

        <div className="min-h-[84px] w-full max-w-md">
          {currentWord ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-end justify-center gap-2.5">
                {cells.map((c, i) => (
                  <MiniCell key={i} bits={c.bits} label={c.label} active={i === wordIndex} />
                ))}
              </div>
              <p className="font-display text-2xl tracking-wide text-ink">
                {currentWord}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                now learning
              </p>
              <p className="mt-1 font-display text-xl text-ink2">{lesson?.kicker ?? ""}</p>
              {lesson?.note && (
                <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted">
                  {lesson.note}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* device / sim status */}
      <div className="border-t border-line px-5 py-4">
        <ConnectDevice />
      </div>
    </div>
  );
}
