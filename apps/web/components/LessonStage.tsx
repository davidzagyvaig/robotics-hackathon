"use client";

import BrailleCell from "@/components/BrailleCell";
import ConnectDevice from "@/components/ConnectDevice";
import MiniCell from "@/components/MiniCell";
import { controller, useBrailleState } from "@/lib/controller";
import { textToCells } from "@/lib/braille";
import { lessonByLevel, levelForLetter, MAX_LEVEL } from "@/lib/curriculum";

// RIGHT pane: the cell simulation. Big cell mirrors the device; a word strip shows the
// current word with the active letter highlighted; a level bar shows progress.
//
// The level/lesson indicator FOLLOWS what Dot is actually teaching — derived from the
// letter currently on the cell — so the two panes never disagree (Dot says "A" → the
// right pane shows Level 1 "a·b·c·d·e", not whatever level was saved in the DB).
export default function LessonStage({ quiz = false }: { quiz?: boolean }) {
  const { currentWord, wordIndex, currentLabel, demoCaption, demoRunning } = useBrailleState();
  const readingWord = !!currentWord;
  const activeLevel = readingWord ? 5 : currentLabel ? levelForLetter(currentLabel) : 1;
  const lesson = lessonByLevel(activeLevel);
  const cells = readingWord ? textToCells(currentWord) : [];

  // Progress reflects the live lesson: position within the current level's letters, or
  // position within the word being read — never a stale saved total.
  let pct = 0;
  if (readingWord) {
    pct = cells.length ? Math.round(((wordIndex + 1) / cells.length) * 100) : 0;
  } else if (currentLabel) {
    const levelLetters = lesson?.letters ?? [];
    const i = levelLetters.indexOf(currentLabel.toLowerCase());
    pct = levelLetters.length ? Math.round(((i + 1) / levelLetters.length) * 100) : 0;
  }

  return (
    <div className="flex h-full flex-col">
      {/* level bar */}
      <div className="flex items-center gap-3 px-6 pt-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold text-sm font-extrabold text-white shadow-[0_3px_0_#E5A600]">
          {activeLevel}
        </span>
        <div className="flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-eel">{lesson?.title ?? "Lesson"}</span>
            <span className="text-xs font-extrabold text-hare">
              Lv {activeLevel}/{MAX_LEVEL}
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

        <BrailleCell hideLabel={quiz} />

        <div className="min-h-[92px] w-full max-w-md">
          {quiz ? (
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-gold">quiz</p>
              <p className="mt-1 text-2xl font-extrabold text-eel">What letter is this?</p>
              <p className="mx-auto mt-2 max-w-xs text-sm font-bold leading-relaxed text-wolf">
                Feel the dots and tell Dot your guess — out loud.
              </p>
            </div>
          ) : currentWord ? (
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
