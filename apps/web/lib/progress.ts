// Learner progress — a tiny local "profile" so BrailleBuddy remembers who you are and
// where you left off ("Duolingo for braille"). localStorage only; no backend needed for
// the demo. Swap the load/save pair for an API later without touching the UI.

import { useSyncExternalStore } from "react";
import { MAX_LEVEL, lettersThroughLevel } from "./curriculum";

export type Profile = {
  name: string | null;
  level: number; // current level (1..MAX_LEVEL)
  mastered: string[]; // letters the learner has demonstrably read
  completedLessons: string[]; // lesson ids
  streak: number; // days in a row
  lastSeen: string | null; // ISO date (yyyy-mm-dd)
  voiceEnabled: boolean;
};

const KEY = "braillebuddy.profile.v1";

const DEFAULT: Profile = {
  name: null,
  level: 1,
  mastered: [],
  completedLessons: [],
  streak: 0,
  lastSeen: null,
  voiceEnabled: true,
};

function today(): string {
  // local date yyyy-mm-dd
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function load(): Profile {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

// --- a tiny external store so React re-renders on change across the app ---
let current: Profile = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function persist(next: Profile) {
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  emit();
}

export const progress = {
  get(): Profile {
    return current;
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  setName(name: string) {
    persist({ ...current, name: name.trim() || null });
  },
  setVoice(enabled: boolean) {
    persist({ ...current, voiceEnabled: enabled });
  },
  setLevel(level: number) {
    persist({ ...current, level: Math.max(1, Math.min(MAX_LEVEL, level)) });
  },
  master(letters: string[]) {
    const set = new Set(current.mastered);
    letters.forEach((c) => set.add(c.toLowerCase()));
    persist({ ...current, mastered: [...set] });
  },
  completeLesson(id: string) {
    const set = new Set(current.completedLessons);
    set.add(id);
    persist({ ...current, completedLessons: [...set] });
  },
  /** Call when a session starts: bump streak if it's a new day. */
  touch() {
    const t = today();
    if (current.lastSeen === t) return;
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const streak = current.lastSeen === yesterday ? current.streak + 1 : 1;
    persist({ ...current, lastSeen: t, streak });
  },
  reset() {
    persist({ ...DEFAULT });
  },
};

export function useProfile(): Profile {
  return useSyncExternalStore(progress.subscribe, progress.get, () => DEFAULT);
}

/** Letters the learner is expected to know at their current level. */
export function knownLetters(p: Profile): string[] {
  return lettersThroughLevel(p.level);
}
