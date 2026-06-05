# How braille is taught — and how BrailleBuddy teaches it

Research notes that shape the curriculum (`apps/web/lib/curriculum.ts`) and the agent prompt.

## The key insight: braille is a *system*, not 26 things to memorize
The alphabet is built in three "decades" from the top-four dots:

- **Decade 1 — a–j**: use only the **top four dots** (1,2,4,5). These are the ten base shapes.
  `a·1  b·12  c·14  d·145  e·15  f·124  g·1245  h·125  i·24  j·245`
- **Decade 2 — k–t**: take a–j and **add dot 3** (bottom-left). Same shapes, shifted down.
  `k·13  l·123  m·134  n·1345  o·135  p·1234  q·12345  r·1235  s·234  t·2345`
- **Decade 3 — u, v, x, y, z**: take a–e and **add dots 3 *and* 6** (both bottom corners).
  `u·136  v·1236  x·1346  y·13456  z·1356`
- **w·2456** is the exception (French braille had no "w"; Louis Braille added it out of pattern).

So a learner really memorizes **ten shapes + two rules + one exception** — not 26 symbols. This is the spine of our levels: teach the shapes, then *reveal each rule* as an "aha" moment. (Perkins School for the Blind; Wikipedia "Braille".)

## Established teaching practice
- **Start simplest first**: `a` (dot 1), then `b`, `c` … following the dot logic, not random. (Perkins.)
- **Mangold Program** (the classic beginner continuum): alphabet → "alphabet words" → tracking, then the **strong contractions** *and, for, of, the, with*. ~62 units, designed for 6–8 weeks of daily practice. We borrow its order, not its pace. (NFB; Exceptional Teaching.)
- **Alphabet wordsigns** (Grade 2 taste): many single letters stand for whole words — `b=but, c=can, d=do, e=every, f=from, g=go, h=have, j=just, l=like, m=more, n=not, p=people, r=rather, s=so, t=that, u=us, v=very, w=will, y=you, z=as`. A great "you already know this" reward after the alphabet.
- **Adults reach Grade 1 (uncontracted) in months**; fluent Grade 2 takes ~a year. Our scope is **Grade 1** + a taste of contractions. (ICEB adult resources; NY State Commission for the Blind.)
- **Sighted vs blind learners**: blind learners go by touch only; sighted learners can use vision *or* touch. Our on-screen cell serves sighted learners and demos; the physical cell + voice serve blind learners. Both are first-class. (Paths to Literacy; APH.)

## How that maps to BrailleBuddy levels
1. **First five (a–e)** — meet the cell; smallest patterns.
2. **Finish the top line (f–j)** — you now know all ten base shapes.
3. **Add one dot (k–t)** — reveal the +dot-3 rule; the shapes repeat.
4. **The last letters (u–z, w)** — the +dots-3&6 rule, plus w.
5. **First words** — read real words built only from letters you know (e.g. *cat, dog, red, tree*).
6. **Wordsigns (bonus)** — a taste of Grade 2: *and, the, for, of, with* + alphabet wordsigns.

The agent teaches **adaptively**: a placement check picks the starting level, the app tracks mastered letters + where you left off (`lib/progress.ts`), and lessons advance only when the learner is ready. "Duolingo for braille."

## Voice (ElevenLabs)
A tutor people *want* to keep using needs a **warm, calm, patient, clear** voice with natural cadence — the ElevenLabs *calm* / *reassuring* / *language-tutor* / *educational* library categories are the right hunting ground. Recommended: audition a few (e.g. a warm female like *Matilda*/*Sarah*, or a calm male like *Henry*) and pick by feel; use a low-latency model (`eleven_turbo_v2_5` or `eleven_flash_v2_5`) so replies feel instant. The voice is configurable in the ElevenLabs dashboard — see `agent/README.md`. Voice is **toggleable** in the app so sighted learners can mute and read captions instead.

Sources: Perkins School for the Blind (how the braille alphabet works); Wikipedia (Braille, decade structure); NFB *Reading to Learn the Code*; Exceptional Teaching (Beginning Braille / Mangold); ICEB adult braille resources; Paths to Literacy; APH ConnectCenter; ElevenLabs voice library.
