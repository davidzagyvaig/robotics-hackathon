"use client";

import { useBrailleState } from "@/lib/controller";

// The braille cell — six dots, recessed holes that fill green and pop up. Mirrors the
// device (or on-screen mode) exactly; driven by real render_braille / render_word calls.
//
// Visual position → braille dot index (0-based), dot order 1..6:  1 4 / 2 5 / 3 6
const GRID: number[] = [0, 3, 1, 4, 2, 5];

// warm saffron/amber raised dots on beige
const RAISED =
  "radial-gradient(circle at 38% 30%, #F6C879 0%, #E0962A 52%, #B9711A 100%)";

export default function BrailleCell({ hideLabel = false }: { hideLabel?: boolean }) {
  const { currentCell, currentLabel, busy } = useBrailleState();
  const label = hideLabel ? null : currentLabel;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <div
          className={`pointer-events-none absolute -inset-6 rounded-[2.5rem] blur-2xl transition-opacity duration-300 ${
            busy ? "opacity-60" : "opacity-0"
          }`}
          style={{ background: "radial-gradient(circle, rgba(88,204,2,0.45), transparent 70%)" }}
        />
        <div className="card3d relative px-9 py-8" style={{ borderRadius: 28 }}>
          <div className="grid grid-cols-2 gap-x-9 gap-y-6">
            {GRID.map((dotIndex, i) => {
              const up = currentCell[dotIndex] === "1";
              return up ? (
                <span
                  key={`${i}-up-${currentLabel ?? ""}`}
                  aria-label={`dot ${dotIndex + 1} raised`}
                  className="h-14 w-14 animate-pop rounded-full"
                  style={{ background: RAISED, boxShadow: "0 5px 0 #9c5e12" }}
                />
              ) : (
                <span
                  key={`${i}-down`}
                  aria-label={`dot ${dotIndex + 1} lowered`}
                  className="h-14 w-14 rounded-full bg-polar"
                  style={{ boxShadow: "inset 0 3px 6px rgba(60,60,60,0.18)" }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex h-14 items-center">
        {label ? (
          <span className="animate-bounceIn text-6xl font-extrabold leading-none text-eel">
            {label}
          </span>
        ) : hideLabel ? (
          <span className="text-6xl font-extrabold leading-none text-swan">?</span>
        ) : (
          <span className="text-sm font-extrabold uppercase tracking-wide text-hare">ready</span>
        )}
      </div>
    </div>
  );
}
