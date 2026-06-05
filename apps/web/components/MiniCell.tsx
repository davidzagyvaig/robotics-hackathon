"use client";

// Small braille glyph for the word strip. `active` = the letter currently on the big cell.
const GRID = [0, 3, 1, 4, 2, 5];

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
        className={`rounded-xl border-2 px-2 py-2 transition ${
          active ? "border-green bg-green-light" : "border-swan bg-white"
        }`}
      >
        <div className="grid grid-cols-2 gap-[3px]">
          {GRID.map((d, i) => {
            const up = bits[d] === "1";
            return (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full ${up ? (active ? "bg-green" : "bg-eel") : "bg-swan"}`}
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
