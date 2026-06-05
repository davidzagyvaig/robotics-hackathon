// Local Postgres — runs IN the repo, no cloud, no Docker. PGlite is real Postgres
// compiled to WASM, persisted to ./.data/braille (gitignored). It starts on first use
// and travels with every push: any teammate runs `npm install` and it just works.
//
// Server-only (Node runtime). Import this only from API routes / server components.

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export type DbUser = {
  id: string;
  name: string;
  level: number;
  streak: number;
  voice_enabled: boolean;
  created_at: string;
  last_seen: string;
  mastered: string[];
};

// Singleton across hot-reloads (Next recreates modules in dev).
const g = globalThis as unknown as { __braille_db?: Promise<PGlite> };

async function init(): Promise<PGlite> {
  const dir = path.join(process.cwd(), ".data", "braille");
  fs.mkdirSync(dir, { recursive: true }); // PGlite won't create parent dirs itself
  const db = new PGlite(dir);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      name_key    TEXT UNIQUE NOT NULL,
      level       INTEGER NOT NULL DEFAULT 1,
      streak      INTEGER NOT NULL DEFAULT 1,
      voice_enabled BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS mastered (
      user_id TEXT NOT NULL,
      letter  TEXT NOT NULL,
      ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, letter)
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id      SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      letter  TEXT NOT NULL,
      correct BOOLEAN NOT NULL,
      ts      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS events (
      id      SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type    TEXT NOT NULL,
      payload TEXT,
      ts      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  return db;
}

export function getDb(): Promise<PGlite> {
  if (!g.__braille_db) {
    // don't cache a rejected init — clear it so the next call retries
    g.__braille_db = init().catch((e) => {
      g.__braille_db = undefined;
      throw e;
    });
  }
  return g.__braille_db;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rid(): string {
  // simple unique id without extra deps
  return "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

async function masteredFor(db: PGlite, userId: string): Promise<string[]> {
  const r = await db.query<{ letter: string }>(
    "SELECT letter FROM mastered WHERE user_id=$1 ORDER BY letter",
    [userId]
  );
  return r.rows.map((x) => x.letter);
}

/** Voice identity: find a learner by spoken name, or create one. Updates streak/last_seen. */
export async function identifyUser(name: string): Promise<{ user: DbUser; isNew: boolean }> {
  const db = await getDb();
  const key = normalize(name);
  if (!key) throw new Error("empty name");
  const existing = await db.query<DbUser>("SELECT * FROM users WHERE name_key=$1", [key]);

  if (existing.rows.length) {
    const u = existing.rows[0];
    // streak: +1 if last seen on a previous day, reset to 1 if a gap, unchanged same day
    await db.exec(`
      UPDATE users SET
        streak = CASE
          WHEN last_seen::date = current_date THEN streak
          WHEN last_seen::date = current_date - 1 THEN streak + 1
          ELSE 1 END,
        last_seen = now()
      WHERE id = '${u.id.replace(/'/g, "")}'
    `);
    const refreshed = (await db.query<DbUser>("SELECT * FROM users WHERE id=$1", [u.id])).rows[0];
    return { user: { ...refreshed, mastered: await masteredFor(db, u.id) }, isNew: false };
  }

  const id = rid();
  await db.query(
    "INSERT INTO users (id, name, name_key) VALUES ($1,$2,$3)",
    [id, name.trim(), key]
  );
  const u = (await db.query<DbUser>("SELECT * FROM users WHERE id=$1", [id])).rows[0];
  return { user: { ...u, mastered: [] }, isNew: true };
}

export async function getUser(id: string): Promise<DbUser | null> {
  const db = await getDb();
  const r = await db.query<DbUser>("SELECT * FROM users WHERE id=$1", [id]);
  if (!r.rows.length) return null;
  return { ...r.rows[0], mastered: await masteredFor(db, id) };
}

export async function updateUser(
  id: string,
  patch: { level?: number; voice_enabled?: boolean; masteredAdd?: string[] }
): Promise<DbUser | null> {
  const db = await getDb();
  if (patch.level != null)
    await db.query("UPDATE users SET level=$1, last_seen=now() WHERE id=$2", [patch.level, id]);
  if (patch.voice_enabled != null)
    await db.query("UPDATE users SET voice_enabled=$1 WHERE id=$2", [patch.voice_enabled, id]);
  for (const L of patch.masteredAdd ?? [])
    await db.query(
      "INSERT INTO mastered (user_id, letter) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [id, L.toLowerCase()]
    );
  return getUser(id);
}

export async function recordQuiz(id: string, letter: string, correct: boolean): Promise<void> {
  const db = await getDb();
  await db.query("INSERT INTO quiz_attempts (user_id, letter, correct) VALUES ($1,$2,$3)", [
    id,
    letter.toLowerCase(),
    correct,
  ]);
  if (correct)
    await db.query(
      "INSERT INTO mastered (user_id, letter) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [id, letter.toLowerCase()]
    );
}

export type LearnerRow = DbUser & {
  mastered_count: number;
  quiz_total: number;
  quiz_correct: number;
};

/** The tracking dashboard: every learner with their progress + quiz accuracy. */
export async function allLearners(): Promise<LearnerRow[]> {
  const db = await getDb();
  const r = await db.query<LearnerRow>(`
    SELECT u.*,
      (SELECT count(*) FROM mastered m WHERE m.user_id=u.id)::int AS mastered_count,
      (SELECT count(*) FROM quiz_attempts q WHERE q.user_id=u.id)::int AS quiz_total,
      (SELECT count(*) FROM quiz_attempts q WHERE q.user_id=u.id AND q.correct)::int AS quiz_correct
    FROM users u
    ORDER BY u.last_seen DESC
  `);
  return r.rows.map((x) => ({ ...x, mastered: [] }));
}
