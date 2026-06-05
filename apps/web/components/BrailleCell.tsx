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
// teal accent for the dots a letter ADDS on top of its base decade — makes the rule visible:
// k–t = a–j + dot 3; u–z = a–e + dots 3 & 6; w (the exception) = j + dot 6.
const RAISED_ADDED =
  "radial-gradient(circle at 38% 30%, #7FD8EC 0%, #2E9FC4 52%, #1C6E8C 100%)";

// Which dot indices (0..5 = dots 1..6) a letter adds beyond its base decade. Empty for a–j.
function addedDots(letter: string | null): Set<number> {
  const c = (letter ?? "").toLowerCase();
  if (c.length !== 1) return new Set();
  if ("klmnopqrst".includes(c)) return new Set([2]); // + dot 3
  if ("uvxyz".includes(c)) return new Set([2, 5]); // + dots 3 & 6
  if (c === "w") return new Set([5]); // the exception: j + dot 6
  return new Set();
}

export default function BrailleCell({ hideLabel = false }: { hideLabel?: boolean }) {
  const { currentCell, currentLabel, busy } = useBrailleState();
  const label = hideLabel ? null : currentLabel;
  // Highlight the "added" dots in teal so the decade rule is visible. Suppressed during a
  // quiz (hideLabel) — colored dots would hint at which letter it is.
  const added = hideLabel ? new Set<number>() : addedDots(currentLabel);

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
              const isAdded = added.has(dotIndex);
              return up ? (
                <span
                  key={`${i}-up-${currentLabel ?? ""}`}
                  aria-label={`dot ${dotIndex + 1} raised${isAdded ? " (added by the rule)" : ""}`}
                  className="h-14 w-14 animate-pop rounded-full"
                  style={{
                    background: isAdded ? RAISED_ADDED : RAISED,
                    boxShadow: isAdded ? "0 5px 0 #155A73" : "0 5px 0 #9c5e12",
                  }}
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
