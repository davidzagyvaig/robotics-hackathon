"use client";

// Small braille glyph for the word strip. `active` = the letter currently on the big cell.
const GRID = [0, 3, 1, 4, 2, 5];

// Dots a letter adds beyond its base decade (teal-highlighted to show the rule). Matches BrailleCell.
function addedDots(label: string): Set<number> {
  const c = (label ?? "").toLowerCase();
  if (c.length !== 1) return new Set();
  if ("klmnopqrst".includes(c)) return new Set([2]);
  if ("uvxyz".includes(c)) return new Set([2, 5]);
  if (c === "w") return new Set([5]);
  return new Set();
}

export default function MiniCell({
  bits,
  label,
  active,
}: {
  bits: string;
  label: string;
  active?: boolean;
}) {
  const added = addedDots(label);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`rounded-xl border-2 px-2 py-2 transition ${
          active ? "border-green bg-green-light" : "border-swan bg-white"
        }`}
      >
        <div className="grid grid-cols-2 gap-[3px]">
          {GRID.map((d, i) => {
            const up = bits[d] === "1";
            const isAdded = up && added.has(d);
            return (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full ${up ? (active ? "bg-green" : "bg-eel") : "bg-swan"}`}
                style={isAdded ? { backgroundColor: "#2E9FC4" } : undefined}
              />
            );
          })}
        </div>
      </div>
      <span className={`text-sm font-extrabold ${active ? "text-green-dark" : "text-hare"}`}>
        {label}
      </span>
    </div>
  );
}
