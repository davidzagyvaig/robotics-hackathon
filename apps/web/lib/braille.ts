// Braille (Grade 1 / UEB) character → 6-dot pattern mapping.
//
// Cell numbering (one braille cell is a 2×3 grid of dots):
//
//     1 4
//     2 5
//     3 6
//
// A "cell" is encoded as a 6-character string of '0'/'1' in dot order 1..6.
// e.g. "100000" = only dot 1 raised (= the letter "a").
// This same 6-bit string is what we send to the firmware as  B<bits>  (see firmware/PROTOCOL.md).

export const CELL_DOWN = "000000";

// Letters a–z
const LETTERS: Record<string, string> = {
  a: "100000", b: "110000", c: "100100", d: "100110", e: "100010",
  f: "110100", g: "110110", h: "110010", i: "010100", j: "010110",
  k: "101000", l: "111000", m: "101100", n: "101110", o: "101010",
  p: "111100", q: "111110", r: "111010", s: "011100", t: "011110",
  u: "101001", v: "111001", w: "010111", x: "101101", y: "101111", z: "101011",
};

// Digits use the letters a–j, preceded by the number sign (handled in textToCells).
const DIGITS: Record<string, string> = {
  "1": "100000", "2": "110000", "3": "100100", "4": "100110", "5": "100010",
  "6": "110100", "7": "110110", "8": "110010", "9": "010100", "0": "010110",
};

// Common punctuation (lower-cell), plus space.
const PUNCT: Record<string, string> = {
  " ": "000000", // all dots down
  ".": "010011", // dots 2-5-6
  ",": "010000", // dot 2
  ";": "011000", // dots 2-3
  ":": "010010", // dots 2-5
  "?": "011001", // dots 2-3-6
  "!": "011010", // dots 2-3-5
  "'": "001000", // dot 3
  "-": "001001", // dots 3-6
};

export const NUMBER_SIGN = "001111"; // dots 3-4-5-6  (⠼) — precedes digits
export const CAPITAL_SIGN = "000001"; // dot 6        (⠠) — precedes a capital letter

export type Cell = {
  /** Human label for the on-screen mirror (the source character or an indicator glyph). */
  label: string;
  /** 6-bit dot pattern, dot order 1..6. */
  bits: string;
};

/** Look up a single lowercase letter / digit / punctuation char. Returns null if unknown. */
export function charToBits(ch: string): string | null {
  const lower = ch.toLowerCase();
  if (LETTERS[lower]) return LETTERS[lower];
  if (DIGITS[ch]) return DIGITS[ch];
  if (PUNCT[ch] !== undefined) return PUNCT[ch];
  return null;
}

/**
 * Break a string into the ordered list of braille cells to display, inserting
 * the number sign before runs of digits and a capital sign before capital letters.
 */
export function textToCells(
  text: string,
  opts: { capitals?: boolean; numbers?: boolean } = {}
): Cell[] {
  const capitals = opts.capitals ?? true;
  const numbers = opts.numbers ?? true;
  const cells: Cell[] = [];
  let numberMode = false;

  for (const ch of text) {
    const isDigit = ch >= "0" && ch <= "9";

    // The number sign stays in effect for a run of digits; any non-digit cancels it.
    if (!isDigit) numberMode = false;

    if (ch >= "A" && ch <= "Z") {
      if (capitals) cells.push({ label: "⠠", bits: CAPITAL_SIGN });
      cells.push({ label: ch, bits: LETTERS[ch.toLowerCase()] });
    } else if (ch >= "a" && ch <= "z") {
      cells.push({ label: ch, bits: LETTERS[ch] });
    } else if (isDigit) {
      if (numbers && !numberMode) {
        cells.push({ label: "#", bits: NUMBER_SIGN });
        numberMode = true;
      }
      cells.push({ label: ch, bits: DIGITS[ch] });
    } else if (PUNCT[ch] !== undefined) {
      cells.push({ label: ch === " " ? "␣" : ch, bits: PUNCT[ch] });
    } else {
      // Unknown character — show a blank cell so timing/pacing stays intact.
      cells.push({ label: "·", bits: CELL_DOWN });
    }
  }

  return cells;
}
