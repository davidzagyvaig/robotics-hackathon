"use client";

// A tiny 2×3 braille glyph used in the word strip. `bits` is the 6-char dot string
// (order 1..6). `active` highlights the letter currently on the big cell.
const GRID = [0, 3, 1, 4, 2, 5]; // visual order → dot index

export default function MiniCell({
  bits,
  label,
  active,
}: {
  bits: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`rounded-lg border px-2 py-1.5 transition ${
          active ? "border-saffron bg-saffron/10" : "border-line bg-paper"
        }`}
      >
        <div className="grid grid-cols-2 gap-[3px]">
          {GRID.map((d, i) => {
            const up = bits[d] === "1";
            return (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${
                  up ? (active ? "bg-saffron" : "bg-ink") : "bg-line"
                }`}
              />
            );
          })}
        </div>
      </div>
      <span
        className={`font-mono text-xs ${active ? "font-semibold text-saffronDeep" : "text-muted"}`}
      >
        {label}
      </span>
    </div>
  );
}
