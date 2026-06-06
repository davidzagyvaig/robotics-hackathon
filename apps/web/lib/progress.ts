// Learner profile — backed by the local Postgres (lib/db.ts via /api), with a localStorage
// cache for instant render + silent resume. Identity is the spoken NAME (voice-first, no
// login): the agent calls identify(name) → the DB finds/creates the learner and we hydrate.

import { useSyncExternalStore } from "react";
import { MAX_LEVEL, lettersThroughLevel } from "./curriculum";

export type Profile = {
  id: string | null;
  name: string | null;
  level: number;
  mastered: string[];
  streak: number;
  voiceEnabled: boolean;
};

const CACHE = "braillebuddy.profile.v2";

const DEFAULT: Profile = {
  id: null,
  name: null,
  level: 1,
  mastered: [],
  streak: 0,
  voiceEnabled: true,
};

function loadCache(): Profile {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(CACHE);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current: Profile = loadCache();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: Profile) {
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CACHE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  emit();
}

async function post(path: string, body: unknown) {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null; // offline → cache still holds; never surface an error to a blind user
  }
}

export const progress = {
  get: () => current,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  /** Silent resume on app load: rehydrate the last learner from the DB. */
  async hydrate() {
    if (typeof window === "undefined") return;
    const id = current.id ?? window.localStorage.getItem("braillebuddy.uid");
    if (!id) return;
    try {
      const r = await fetch(`/api/profile?id=${encodeURIComponent(id)}`);
      if (r.ok) {
        const u = await r.json();
        set({ id: u.id, name: u.name, level: u.level, mastered: u.mastered, streak: u.streak, voiceEnabled: u.voiceEnabled });
      }
    } catch {
      /* keep cache */
    }
  },

  /** Voice identity: map a spoken name to a learner (find or create) and load progress. */
  async identify(name: string): Promise<{ isNew: boolean; name: string; level: number; mastered: string[]; streak: number }> {
    const data = await post("/api/identify", { name });
    if (!data) {
      // offline fallback: keep a local-only profile so the lesson still runs
      set({ ...current, name: name.trim() });
      return { isNew: true, name: name.trim(), level: current.level, mastered: current.mastered, streak: current.streak };
    }
    if (typeof window !== "undefined") window.localStorage.setItem("braillebuddy.uid", data.id);
    set({ id: data.id, name: data.name, level: data.level, mastered: data.mastered, streak: data.streak, voiceEnabled: data.voiceEnabled });
    return { isNew: data.isNew, name: data.name, level: data.level, mastered: data.mastered, streak: data.streak };
  },

  /** Forget the current learner so a NEW session starts anonymous (Guest). Identity is then set
   *  only if the learner actually says a name (→ identify()), and saying a DIFFERENT name switches
   *  to that learner (reloading their progress). Without this the last name persists via the
   *  localStorage cache + hydrate() silent-resume, so a new session keeps the old identity even
   *  when a different name — or no name — is spoken. The voice on/off preference is kept. */
  reset() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("braillebuddy.uid");
      } catch {
        /* ignore */
      }
    }
    set({ ...DEFAULT, voiceEnabled: current.voiceEnabled });
  },

  setVoice(enabled: boolean) {
    set({ ...current, voiceEnabled: enabled });
    if (current.id) void post("/api/progress", { id: current.id, voiceEnabled: enabled });
  },

  setLevel(level: number) {
    const lvl = Math.max(1, Math.min(MAX_LEVEL, level));
    set({ ...current, level: lvl });
    if (current.id) void post("/api/progress", { id: current.id, level: lvl });
  },

  master(letters: string[]) {
    const s = new Set(current.mastered);
    letters.forEach((c) => s.add(c.toLowerCase()));
    set({ ...current, mastered: [...s] });
    if (current.id) void post("/api/progress", { id: current.id, mastered: letters });
  },

  recordQuiz(letter: string, correct: boolean) {
    if (correct) this.master([letter]);
    if (current.id) void post("/api/quiz", { id: current.id, letter, correct });
  },
};

export function useProfile(): Profile {
  return useSyncExternalStore(progress.subscribe, progress.get, () => DEFAULT);
}

export function knownLetters(p: Profile): string[] {
  return p.mastered.length ? p.mastered : lettersThroughLevel(p.level);
}
