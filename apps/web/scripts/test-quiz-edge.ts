// Quiz + word-rendering edge-case checks. Run: node apps/web/scripts/test-quiz-edge.ts
import { textToCells, charToBits, CELL_DOWN, CAPITAL_SIGN, NUMBER_SIGN } from "../lib/braille.ts";
import { LESSONS, lettersThroughLevel, lessonByLevel, MAX_LEVEL } from "../lib/curriculum.ts";

let P = 0,
  F = 0;
const bad: string[] = [];
const ok = (c: boolean, m: string) => (c ? P++ : (F++, bad.push(m)));

// Quiz pool: each level yields a usable letter pool; letters are unique across levels
for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) ok(Array.isArray(lettersThroughLevel(lvl)), `level ${lvl} pool ok`);
ok(lettersThroughLevel(1).length === 5, "L1 = 5 letters (a-e)");
ok(lettersThroughLevel(4).length === 26, "L4 covers full alphabet incl w");
ok(new Set(lettersThroughLevel(4)).size === 26, "no duplicate letters across levels");

// Everything the agent could be asked to render is renderable
for (const L of LESSONS) for (const ch of L.letters ?? []) ok(charToBits(ch) !== null, `letter '${ch}' renderable`);
for (const L of LESSONS) for (const w of L.words ?? []) for (const ch of w) ok(charToBits(ch) !== null, `word '${w}' char '${ch}' renderable`);

// lessonByLevel out of range -> undefined, no crash
ok(lessonByLevel(0) === undefined, "level 0 -> undefined");
ok(lessonByLevel(999) === undefined, "level 999 -> undefined");

// render_braille(text) routing the agent uses
ok(textToCells("Cat")[0].bits === CAPITAL_SIGN, "Capitalized word -> capital sign first");
ok(textToCells("a1").some((c) => c.bits === NUMBER_SIGN), "word with digit -> number sign");
ok(textToCells("encyclopedia").length >= 12, "long word -> many cells, no crash");
ok(textToCells("a b").some((c) => c.bits === CELL_DOWN), "space -> blank cell");
ok(textToCells("a@#z").length === 4, "unknown symbols -> blank cells, length preserved");
ok(textToCells("").length === 0, "empty -> no cells");

console.log(`QUIZ+WORD EDGE: ${P} passed, ${F} failed`);
bad.forEach((b) => console.log("  ✗ " + b));
process.exit(F ? 1 : 0);
