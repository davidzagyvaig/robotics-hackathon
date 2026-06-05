"use client";

import BrailleCell from "@/components/BrailleCell";
import ConnectDevice from "@/components/ConnectDevice";
import MiniCell from "@/components/MiniCell";
import { controller, useBrailleState } from "@/lib/controller";
import { useProfile } from "@/lib/progress";
import { textToCells } from "@/lib/braille";
import { lessonByLevel, lettersThroughLevel, MAX_LEVEL } from "@/lib/curriculum";

// RIGHT pane: the cell simulation. Big cell mirrors the device; a word strip shows the
// current word with the active letter highlighted; a level bar shows progress.
export default function LessonStage() {
  const {
    currentWord,
    wordIndex,
    demoCaption,
    demoRunning,
    demoAwaitingConfirm,
    teachAwaitingConfirm,
  } = useBrailleState();
  const profile = useProfile();
  const lesson = lessonByLevel(profile.level);
  const cells = currentWord ? textToCells(currentWord) : [];

  const target = lettersThroughLevel(profile.level).length || 1;
  const got = profile.mastered.length;
  const pct = Math.min(100, Math.round((got / Math.max(target, 1)) * 100));

  return (
    <div className="flex h-full flex-col">
      {/* level bar */}
      <div className="flex items-center gap-3 px-6 pt-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold text-sm font-extrabold text-white shadow-[0_3px_0_#E5A600]">
          {profile.level}
        </span>
        <div className="flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-eel">{lesson?.title ?? "Lesson"}</span>
            <span className="text-xs font-extrabold text-hare">
              Lv {profile.level}/{MAX_LEVEL}
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* cell + word strip */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-6">
        <div className="min-h-[1.5rem] px-4">
          {demoCaption && (
            <p className="animate-bounceIn text-center text-base font-extrabold text-green-dark">
              {demoCaption}
            </p>
          )}
        </div>

        <BrailleCell />

        {/* interactive confirm — the demo waits here until the learner feels the dots */}
        {(demoAwaitingConfirm || teachAwaitingConfirm) && (
          <button
            onClick={() => controller.confirmFeel()}
            className="btn3d btn-green animate-bounceIn text-base"
          >
            ✓ I can feel it
          </button>
        )}

        <div className="min-h-[92px] w-full max-w-md">
          {currentWord ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-end justify-center gap-2.5">
                {cells.map((c, i) => (
                  <MiniCell key={i} bits={c.bits} label={c.label} active={i === wordIndex} />
                ))}
              </div>
              <p className="text-3xl font-extrabold lowercase tracking-wide text-eel">{currentWord}</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-hare">now learning</p>
              <p className="mt-1 text-2xl font-extrabold text-eel">{lesson?.kicker ?? ""}</p>
              {lesson?.note && (
                <p className="mx-auto mt-2 max-w-xs text-sm font-bold leading-relaxed text-wolf">
                  {lesson.note}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* watch-demo (no key needed) + device status */}
      <div className="flex flex-col items-center gap-3 border-t-2 border-swan px-5 py-4">
        <button
          onClick={() => (demoRunning ? controller.stopDemo() : void controller.runDemo())}
          className="text-sm font-extrabold uppercase tracking-wide text-blue transition hover:text-blue-dark"
        >
          {demoRunning ? "■ Stop demo" : "▶ Watch a 20-second demo"}
        </button>
        <ConnectDevice />
      </div>
    </div>
  );
}
