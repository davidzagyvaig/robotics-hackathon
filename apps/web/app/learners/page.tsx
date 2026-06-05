import Link from "next/link";
import { allLearners } from "@/lib/db";
import { MAX_LEVEL } from "@/lib/curriculum";

// Tracking dashboard — every learner in the local Postgres with progress + quiz accuracy.
// Server component; reads the DB directly on each request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default async function LearnersPage() {
  let learners: Awaited<ReturnType<typeof allLearners>> = [];
  let err: string | null = null;
  try {
    learners = await allLearners();
  } catch (e) {
    err = e instanceof Error ? e.message : "could not load learners";
  }

  const totalAttempts = learners.reduce((s, l) => s + l.quiz_total, 0);
  const totalCorrect = learners.reduce((s, l) => s + l.quiz_correct, 0);
  const acc = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  return (
    <main className="min-h-screen bg-white text-eel">
      <header className="flex items-center justify-between border-b-2 border-swan px-6 py-4 sm:px-10">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-green">Learners</h1>
          <p className="text-xs font-extrabold uppercase tracking-wide text-hare">
            local postgres · live progress
          </p>
        </div>
        <Link href="/" className="text-sm font-extrabold text-wolf transition hover:text-eel">
          ← back to tutor
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Learners" value={String(learners.length)} />
          <Stat label="Quiz answers" value={String(totalAttempts)} />
          <Stat label="Accuracy" value={`${acc}%`} />
          <Stat label="Letters mastered" value={String(learners.reduce((s, l) => s + l.mastered_count, 0))} />
        </div>

        {err && (
          <div className="rounded-2xl border-2 border-cardinal bg-cardinal-light p-4 text-sm font-bold text-cardinal-dark">
            {err}
          </div>
        )}

        {!err && learners.length === 0 && (
          <div className="card3d p-10 text-center">
            <p className="text-base font-bold text-wolf">
              No learners yet. Start a lesson — when Dot asks your name and you answer, a learner
              shows up here automatically.
            </p>
          </div>
        )}

        {learners.length > 0 && (
          <div className="card3d overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-swan bg-polar text-xs font-extrabold uppercase tracking-wide text-hare">
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Mastered</th>
                  <th className="px-4 py-3">Quiz</th>
                  <th className="px-4 py-3">Streak</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {learners.map((l) => {
                  const a = l.quiz_total ? Math.round((l.quiz_correct / l.quiz_total) * 100) : null;
                  return (
                    <tr key={l.id} className="border-b-2 border-swan font-bold last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-green-light text-xs font-extrabold text-green-dark">
                            {(l.name?.[0] ?? "?").toUpperCase()}
                          </span>
                          <span className="font-extrabold">{l.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-wolf">
                        {l.level}
                        <span className="text-hare">/{MAX_LEVEL}</span>
                      </td>
                      <td className="px-4 py-3 text-wolf">{l.mastered_count}/26</td>
                      <td className="px-4 py-3 text-wolf">
                        {a === null ? "—" : `${a}% (${l.quiz_correct}/${l.quiz_total})`}
                      </td>
                      <td className="px-4 py-3 text-fire">{l.streak > 0 ? `🔥 ${l.streak}` : "—"}</td>
                      <td className="px-4 py-3 text-xs text-hare">{fmt(l.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card3d p-4">
      <div className="text-xs font-extrabold uppercase tracking-wide text-hare">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-eel">{value}</div>
    </div>
  );
}
