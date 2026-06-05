"use client";

import { useBrailleState } from "@/lib/controller";

// The hero: a tactile braille cell. Lowered dots are recessed wells in the paper;
// raised dots fill with warm saffron and physically pop up. It mirrors exactly what
// the device (or the on-screen no-hardware mode) is showing — driven by real
// render_braille calls, never a separate simulator.
//
// Visual position → braille dot index (0-based), dot order 1..6:
//   1 4        dot1(0) dot4(3)
//   2 5   ->   dot2(1) dot5(4)
//   3 6        dot3(2) dot6(5)
const GRID: number[] = [0, 3, 1, 4, 2, 5];

const RAISED_FILL =
  "radial-gradient(circle at 36% 30%, #FAD79A 0%, #E8A23B 42%, #C77E1E 78%, #A96A16 100%)";

export default function BrailleCell() {
  const { currentCell, currentLabel, busy, simulated } = useBrailleState();

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        {/* warm glow behind the cell when active */}
        <div
          className={`pointer-events-none absolute -inset-6 rounded-[2.5rem] blur-2xl transition-opacity duration-500 ${
            busy ? "opacity-70" : "opacity-0"
          }`}
          style={{ background: "radial-gradient(circle, rgba(224,150,42,0.45), transparent 70%)" }}
        />
        <div className="relative rounded-[2rem] border border-line bg-paper px-10 py-9 shadow-card">
          <div className="grid grid-cols-2 gap-x-9 gap-y-6">
            {GRID.map((dotIndex, i) => {
              const up = currentCell[dotIndex] === "1";
              return (
                <div
                  key={i}
                  aria-label={`dot ${dotIndex + 1} ${up ? "raised" : "lowered"}`}
                  className="grid h-14 w-14 place-items-center rounded-full"
                  style={{ background: up ? "transparent" : "#E7DCC6", boxShadow: up ? "none" : undefined }}
                >
                  {up ? (
                    <span
                      key={`up-${currentLabel}-${i}`}
                      className="h-14 w-14 animate-rise rounded-full shadow-dot"
                      style={{ background: RAISED_FILL }}
                    />
                  ) : (
                    <span className="h-14 w-14 rounded-full bg-[#E7DCC6] shadow-hole" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* the letter being shown, in the display serif */}
      <div className="flex h-12 items-center gap-3">
        {currentLabel ? (
          <span className="font-display text-5xl font-semibold leading-none text-ink">
            {currentLabel}
          </span>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
            {simulated ? "on-screen cell · ready" : "ready"}
          </span>
        )}
      </div>
    </div>
  );
}
