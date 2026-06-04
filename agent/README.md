# BrailleBuddy ElevenLabs agent — setup

The voice agent lives in the **ElevenLabs dashboard**; this folder version-controls its config
so anyone on the team can reproduce it. The agent runs in the browser via `@elevenlabs/react`
(see `apps/web/components/Conversation.tsx`).

## One-time setup

1. **Create the agent.** ElevenLabs dashboard → **Agents** (Conversational AI) → *Create agent*.
2. **System prompt.** Paste the contents of [`prompt.md`](./prompt.md).
3. **Voice.** Pick any voice you like (a calm, clear one works best for teaching).
4. **Add the client tool.** Agent → **Tools** → *Add tool* → type **Client**, and fill it in to
   match [`tools.json`](./tools.json):
   - **Name:** `render_braille`  ← must be exact, it's case-sensitive
   - **Description:** (from `tools.json`)
   - **Parameter:** `text` — type `string`, required
   - Enable **"Wait for response"** so the agent hears the confirmation string back.
5. **Auth.** Keep the agent private and use signed URLs (the default flow here). The web app's
   `/api/get-signed-url` route mints them server-side with your API key.
6. **Copy two values into `apps/web/.env.local`** (copy from the repo-root `.env.example`):
   - `ELEVENLABS_API_KEY` — Profile → API keys (server-side only, never shipped to the browser)
   - `NEXT_PUBLIC_AGENT_ID` — the agent's ID from its dashboard page

## How the tool call flows
```
learner speaks → agent decides to show text → render_braille({text})
   → runs in the browser (Conversation.tsx) → controller.renderBraille(text)
   → textToCells() → WebSerial B<bits> frames → ESP32-S3 → servos move
   → returns "Showed \"…\"" → agent speaks the next encouragement
```
Because the tool is a **client** tool, it executes on the learner's machine, which is the only
place that can reach their plugged-in device. A server-side webhook tool could not.
