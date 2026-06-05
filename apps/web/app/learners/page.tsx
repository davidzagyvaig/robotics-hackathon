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
    <main className="paper-bg grain min-h-screen text-ink">
      <header className="flex items-center justify-between border-b border-line/70 px-6 py-4 sm:px-10">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Learners</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            local postgres · live progress tracking
          </p>
        </div>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition hover:text-ink"
        >
          ← back to tutor
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Learners" value={String(learners.length)} />
          <Stat label="Quiz answers" value={String(totalAttempts)} />
          <Stat label="Overall accuracy" value={`${acc}%`} />
          <Stat
            label="Letters mastered"
            value={String(learners.reduce((s, l) => s + l.mastered_count, 0))}
          />
        </div>

        {err && (
          <div className="rounded-lg border border-clay/40 bg-clay/10 p-4 text-sm text-clay">{err}</div>
        )}

        {!err && learners.length === 0 && (
          <div className="rounded-xl border border-line bg-paper p-10 text-center">
            <p className="text-sm text-muted">
              No learners yet. Start a lesson on the tutor — when Dot asks a name and you answer, a
              learner is created here automatically.
            </p>
          </div>
        )}

        {learners.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-bone2/50 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
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
                    <tr key={l.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-saffron/20 font-display text-xs font-semibold text-saffronDeep">
                            {(l.name?.[0] ?? "?").toUpperCase()}
                          </span>
                          <span className="font-medium">{l.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tnum text-ink2">
                        {l.level}
                        <span className="text-muted">/{MAX_LEVEL}</span>
                      </td>
                      <td className="px-4 py-3 tnum text-ink2">{l.mastered_count}/26</td>
                      <td className="px-4 py-3 tnum text-ink2">
                        {a === null ? "—" : `${a}% (${l.quiz_correct}/${l.quiz_total})`}
                      </td>
                      <td className="px-4 py-3 tnum text-clay">{l.streak > 0 ? `🔥 ${l.streak}` : "—"}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted">{fmt(l.last_seen)}</td>
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
    <div className="rounded-xl border border-line bg-paper p-4 shadow-card">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}
