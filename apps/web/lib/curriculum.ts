// BrailleBuddy curriculum — Grade 1 (uncontracted), built on the braille "decade" structure.
// See docs/PEDAGOGY.md for the research. The agent reads this order; the app tracks progress
// against it (lib/progress.ts). Letters resolve to dot patterns via lib/braille.ts.

export type Lesson = {
  id: string;
  level: number;
  title: string;
  kicker: string; // short tag shown in the UI
  /** Letters introduced this lesson (lowercase), in teaching order. */
  letters?: string[];
  /** Words to read this lesson (only using letters already taught). */
  words?: string[];
  /** The "aha" rule revealed this lesson, spoken by the tutor. */
  rule?: string;
  /** One-line teaching note for the tutor / UI. */
  note: string;
};

export const LESSONS: Lesson[] = [
  {
    id: "l1",
    level: 1,
    title: "First five",
    kicker: "a · b · c · d · e",
    letters: ["a", "b", "c", "d", "e"],
    note: "Meet the cell. Every letter is a pattern of up to six dots; these five live in the top of the cell.",
  },
  {
    id: "l2",
    level: 2,
    title: "Finish the top line",
    kicker: "f · g · h · i · j",
    letters: ["f", "g", "h", "i", "j"],
    rule: "These complete the first ten letters — the whole top half of the cell, dots one, two, four and five.",
    note: "You now know all ten base shapes of braille.",
  },
  {
    id: "l3",
    level: 3,
    title: "Add one dot",
    kicker: "k → t",
    letters: ["k", "l", "m", "n", "o", "p", "q", "r", "s", "t"],
    rule: "k through t are a through j with dot three added — the bottom-left dot. Same shapes you already know, shifted down.",
    note: "Learn one rule and you unlock ten more letters.",
  },
  {
    id: "l4",
    title: "The last letters",
    level: 4,
    kicker: "u · v · x · y · z · w",
    letters: ["u", "v", "x", "y", "z", "w"],
    rule: "u, v, x, y and z add dots three and six — both bottom corners. w is the odd one out: dots two, four, five and six.",
    note: "Two more rules and the alphabet is complete.",
  },
  {
    id: "l5",
    level: 5,
    title: "First words",
    kicker: "read real words",
    words: ["cat", "dog", "red", "sun", "tree", "hello"],
    note: "Read whole words, one letter at a time, using only letters you know.",
  },
  {
    id: "l6",
    level: 6,
    title: "Wordsigns (bonus)",
    kicker: "a taste of Grade 2",
    words: ["and", "the", "for", "of", "with"],
    rule: "In real braille, single letters and short signs stand for whole words — this is how fluent readers go fast.",
    note: "A glimpse of contracted braille: the five strong wordsigns.",
  },
];

export const LEVELS = LESSONS.map((l) => l.level);
export const MAX_LEVEL = Math.max(...LEVELS);

/** All letters taught up to and including a level — what the learner "knows". */
export function lettersThroughLevel(level: number): string[] {
  const set = new Set<string>();
  for (const l of LESSONS) {
    if (l.level <= level && l.letters) l.letters.forEach((c) => set.add(c));
  }
  return [...set];
}

export function lessonByLevel(level: number): Lesson | undefined {
  return LESSONS.find((l) => l.level === level);
}

/** Which level teaches a given letter (1–4). Falls back to the last letter-level. */
export function levelForLetter(ch: string): number {
  const c = (ch ?? "").trim().toLowerCase();
  const lesson = LESSONS.find((l) => l.letters?.includes(c));
  return lesson?.level ?? 4;
}
