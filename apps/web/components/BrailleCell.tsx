"use client";

import { useBrailleState } from "@/lib/controller";

// On-screen mirror of the physical cell. The dots reflect exactly what the device is
// showing (driven by the real render_braille tool calls) — it is NOT a simulator: nothing
// here works until a device is connected. Cosmetic, for the audience/judges.

// Render order is visual rows; map each visual position to its braille dot index (0-based).
//   1 4        dot1(0) dot4(3)
//   2 5   ->   dot2(1) dot5(4)
//   3 6        dot3(2) dot6(5)
const GRID: number[] = [0, 3, 1, 4, 2, 5];

export default function BrailleCell() {
  const { currentCell, currentLabel, busy } = useBrailleState();

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl border border-line bg-panel px-8 py-7 shadow-lg">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {GRID.map((dotIndex, i) => {
            const up = currentCell[dotIndex] === "1";
            return (
              <div
                key={i}
                aria-label={`dot ${dotIndex + 1} ${up ? "raised" : "lowered"}`}
                className={[
                  "h-10 w-10 rounded-full transition-all duration-150",
                  up
                    ? "bg-accent shadow-[0_0_16px_rgba(56,225,176,0.7)] scale-100"
                    : "bg-line/60 scale-90",
                ].join(" ")}
              />
            );
          })}
        </div>
      </div>
      <div className="h-6 text-center">
        <span className={`text-2xl font-semibold ${busy ? "text-accent" : "text-muted"}`}>
          {currentLabel ?? "·"}
        </span>
      </div>
    </div>
  );
}
