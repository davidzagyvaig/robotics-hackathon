"use client";

import { useCallback, useEffect, useState } from "react";
import BrailleCell from "@/components/BrailleCell";
import { controller, useBrailleState } from "@/lib/controller";
import { progress, useProfile } from "@/lib/progress";
import { lettersThroughLevel } from "@/lib/curriculum";

// Self-contained practice mode — works with NO voice key. Shows a mystery letter on the
// cell (label hidden), the learner picks from choices, we check, give feedback, master the
// letter on a correct read, and track a score. Also great B-roll for the video.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

function pick<T>(arr: T[], n: number, exclude: T[] = []): T[] {
  const pool = arr.filter((x) => !exclude.includes(x));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export default function Quiz() {
  const profile = useProfile();
  const { connected } = useBrailleState();
  const [answer, setAnswer] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const pool = lettersThroughLevel(profile.level);
  const letters = pool.length >= 4 ? pool : ALPHABET.slice(0, 8);

  const next = useCallback(async () => {
    setPicked(null);
    const ans = pick(letters, 1)[0];
    const distractors = pick(letters, 3, [ans]);
    const opts = [ans, ...distractors].sort(() => Math.random() - 0.5);
    setAnswer(ans);
    setChoices(opts);
    if (!connected) controller.connectSimulated();
    await controller.showLetter(ans);
  }, [letters, connected]);

  // start the first question when this mode mounts
  useEffect(() => {
    void next();
    return () => void controller.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (c: string) => {
    if (picked) return;
    setPicked(c);
    const correct = c === answer;
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    if (answer) progress.recordQuiz(answer, correct); // logs attempt + masters on correct
    // reveal the letter on the cell, then move on
    void controller.showLetter(answer!); // currentLabel becomes visible (hideLabel flips off below)
    setTimeout(() => void next(), correct ? 1100 : 1900);
  };

  const answered = picked !== null;
  const pct = score.total ? Math.round((score.right / score.total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-saffronDeep">
          Quiz · what letter is this?
        </span>
        <span className="font-mono text-[11px] text-muted tnum">
          {score.right}/{score.total} {score.total > 0 && `· ${pct}%`}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8">
        <BrailleCell hideLabel={!answered} />

        {/* feedback line */}
        <div className="h-5">
          {answered &&
            (picked === answer ? (
              <p className="animate-floatUp text-sm font-semibold text-saffronDeep">
                Yes — that’s {answer?.toUpperCase()}. 🎉
              </p>
            ) : (
              <p className="animate-floatUp text-sm text-clay">
                That was {answer?.toUpperCase()} — keep going, you’ve got this.
              </p>
            ))}
        </div>

        {/* choices */}
        <div className="grid grid-cols-4 gap-3">
          {choices.map((c) => {
            const state =
              !answered
                ? "idle"
                : c === answer
                  ? "correct"
                  : c === picked
                    ? "wrong"
                    : "dim";
            return (
              <button
                key={c}
                onClick={() => choose(c)}
                disabled={answered}
                className={[
                  "h-14 w-14 rounded-xl border font-display text-2xl font-semibold transition",
                  state === "idle" && "border-line bg-paper text-ink hover:border-ink/40 hover:bg-bone2",
                  state === "correct" && "border-saffron bg-saffron/15 text-saffronDeep",
                  state === "wrong" && "border-clay bg-clay/10 text-clay",
                  state === "dim" && "border-line bg-paper text-muted/40",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {c.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line px-5 py-3 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          drawing from {letters.length} letters you’re learning
        </span>
      </div>
    </div>
  );
}
