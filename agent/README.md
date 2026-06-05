# BrailleBuddy ElevenLabs agent — setup

The voice agent lives in the **ElevenLabs dashboard**; this folder version-controls its config
so anyone on the team can reproduce it. The agent runs in the browser via `@elevenlabs/react`
(see `apps/web/components/Conversation.tsx`).

## One-time setup

1. **Create the agent.** ElevenLabs dashboard → **Agents** (Conversational AI) → *Create agent*.
2. **System prompt.** Paste the contents of [`prompt.md`](./prompt.md).
3. **Voice — this is the whole product.** The goal: hand someone the device, tell them to close their
   eyes, and Dot's voice carries everything. Pick a voice with **warmth and real emotional range**, not
   just "clear." Audition the *calm* / *reassuring* / *characterful* / *language-tutor* categories (e.g.
   a warm expressive female like *Matilda*/*Sarah*, or a warm male like *Will*/*Henry*). 
   - **Model:** prefer the most **expressive** model your plan allows so the audio-tag cues in
     `prompt.md` (`[warmly]`, `[delighted]`, `[laughs softly]`, pauses) actually land — **Eleven v3**
     for maximum emotion, or **`eleven_turbo_v2_5`** for the best expressiveness-vs-latency balance in a
     live agent. Avoid the flattest/fastest model — emotion beats raw speed here.
   - In the agent's voice settings, lean **stability lower / style higher** so delivery is lively and
     warm rather than monotone. Test the win-celebration and the after-a-mistake reassurance lines.
   - The learner can mute the voice in the app (sighted learners read captions), so wording carries
     feeling too. Rationale + curriculum: `docs/PEDAGOGY.md`.
4. **Add BOTH client tools.** Agent → **Tools** → *Add tool* → type **Client**, once per tool, matching
   [`tools.json`](./tools.json):
   - **`render_braille`** — params `character` (string, required), `seconds` (number, required).
   - **`render_word`** — params `word` (string, required), `seconds_per_letter` (number, required).
   - Names are **case-sensitive** and must match `apps/web/components/Conversation.tsx`.
   - Enable **"Wait for response"** on both so the agent hears the confirmation string back.
5. **Dynamic variables.** The web app sends `user_name`, `level`, `lesson_title`, `known_letters` at
   session start; the prompt reads them as `{{var}}`. No dashboard config needed beyond using them in
   the prompt (already done) — but if the dashboard requires declaring them, add those four as text
   dynamic variables.
5. **Auth.** Keep the agent **private**: enable "Require authentication" in the agent's
   Security settings, and (defense in depth) add your Vercel domain + `localhost` to the
   **hostname allowlist**. The web app's `/api/get-signed-url` route mints signed URLs
   server-side with your API key.
6. **Copy two values into `apps/web/.env.local`** (copy from the repo-root `.env.example`):
   - `ELEVENLABS_API_KEY` — create at **Developers → API Keys**. Either leave it unrestricted,
     or restrict it to **ElevenAgents → Read** (that's the Conversational-AI / Agents scope; the
     signed-URL endpoint lives under it). Bump to **Write** only if you ever get a 401/403.
     Server-side only — never shipped to the browser.
   - `NEXT_PUBLIC_AGENT_ID` — the agent's ID from its dashboard page.

## How the tool call flows
```
learner speaks → agent picks a letter → render_braille("R", 3)
   → runs in the browser (Conversation.tsx) → controller.renderBraille("R", 3)
   → charToBits("R") → B111010 over USB/BLE → ESP32-S3 → dots rise + buzz
   → hold 3 s → Z (clear) → returns "Showed …" → agent speaks the next encouragement
```
Because the tool is a **client** tool, it executes on the learner's machine, which is the only
place that can reach their plugged-in device. A server-side webhook tool could not.
