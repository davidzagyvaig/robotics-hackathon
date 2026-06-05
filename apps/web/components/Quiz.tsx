"use client";

import { useCallback, useEffect, useState } from "react";
import BrailleCell from "@/components/BrailleCell";
import { controller, useBrailleState } from "@/lib/controller";
import { progress, useProfile } from "@/lib/progress";
import { lettersThroughLevel } from "@/lib/curriculum";

// Practice mode — works with NO voice key. Shows a mystery letter on the cell (label
// hidden), pick from choices, get a big green/red feedback footer + Continue. Tracks a
// score, masters letters on a correct read, logs every attempt to the local Postgres.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

function pick<T>(arr: T[], n: number, exclude: T[] = []): T[] {
  const pool = arr.filter((x) => !exclude.includes(x));
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
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
    const opts = [ans, ...pick(letters, 3, [ans])].sort(() => Math.random() - 0.5);
    setAnswer(ans);
    setChoices(opts);
    if (!connected) controller.connectSimulated();
    await controller.showLetter(ans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters, connected]);

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
    if (answer) progress.recordQuiz(answer, correct);
    if (answer) void controller.showLetter(answer); // reveal on the cell
  };

  const answered = picked !== null;
  const correct = picked === answer;
  const progressPct = score.total ? Math.min(100, (score.total / 10) * 100) : 0;

  return (
    <div className="relative flex h-full flex-col">
      {/* top: progress + score */}
      <div className="flex items-center gap-4 px-6 pt-5">
        <div className="progress flex-1">
          <span style={{ width: `${progressPct}%` }} />
        </div>
        <span className="text-sm font-extrabold text-fire">⭐ {score.right}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-6">
        <p className="text-center text-xl font-extrabold text-eel">Which letter is this?</p>
        <BrailleCell hideLabel={!answered} />

        <div className="grid grid-cols-4 gap-3">
          {choices.map((c) => {
            const isAns = c === answer;
            const isPick = c === picked;
            let cls = "btn-white h-16 w-16 text-3xl";
            if (answered && isAns) cls = "h-16 w-16 rounded-2xl text-3xl text-white bg-green";
            else if (answered && isPick) cls = "h-16 w-16 rounded-2xl text-3xl text-white bg-cardinal";
            else if (answered) cls = "h-16 w-16 rounded-2xl text-3xl text-hare bg-polar";
            return (
              <button
                key={c}
                onClick={() => choose(c)}
                disabled={answered}
                className={cls}
                style={answered ? { border: "none" } : undefined}
              >
                {c.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duolingo-style result footer */}
      {answered && (
        <div
          className={`animate-slideUp flex items-center justify-between gap-4 px-6 py-5 ${
            correct ? "bg-green-light" : "bg-cardinal-light"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 place-items-center rounded-full text-xl ${
                correct ? "bg-green text-white" : "bg-cardinal text-white"
              }`}
            >
              {correct ? "✓" : "✕"}
            </span>
            <div>
              <p className={`text-base font-extrabold ${correct ? "text-green-dark" : "text-cardinal-dark"}`}>
                {correct ? "Nice! That's right." : "Not quite"}
              </p>
              <p className={`text-sm font-bold ${correct ? "text-green-dark" : "text-cardinal-dark"}`}>
                {correct ? `${answer?.toUpperCase()} — well read.` : `That was ${answer?.toUpperCase()}.`}
              </p>
            </div>
          </div>
          <button onClick={() => void next()} className={`btn3d ${correct ? "btn-green" : "btn-red"}`}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
