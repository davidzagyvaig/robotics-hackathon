# Architecture

BrailleBuddy is a voice-guided braille teaching box. A learner opens the public web app in
Chrome, plugs the device into USB, talks to a voice tutor, and feels the six dots of one
braille cell rise and fall under their fingers.

## Data flow

```
            speaks / listens
  Learner  ─────────────────►  ElevenLabs voice agent  (cloud)
     ▲                                  │  decides to show text
     │ feels dots                       ▼
     │                      render_braille({ text })           ← CLIENT tool, runs in the browser
     │                                  │
     │                  apps/web/lib/controller.ts
     │                   textToCells()  │  pace by pot speed
     │                                  ▼
     │                  apps/web/lib/serial.ts  ──(WebSerial)──►  ESP32-S3 firmware
     │                                  │   B<6 bits> per cell        │
     │                                  │                             ▼
     └──────────────────────────────────────────────────────  6× MG90S servos (the cell)
                                        ▲
                          POT <0-4095>  │  (~10 Hz)   ◄── potentiometer = speed knob
                                        └─────────────────────────────┘
```

## The one design decision that drives everything

**Actuation must happen in the browser.** The ESP is plugged into the *learner's / judge's*
laptop. The cloud (ElevenLabs, our Vercel server) has no path to that USB device. So the agent's
tool is an ElevenLabs **client tool** — it executes in the browser via `@elevenlabs/react`,
where WebSerial can reach the device. A server-side webhook tool could not move a single dot.

Consequence: there is almost **no backend**. The only server code is one route,
`/api/get-signed-url`, which mints a short-lived signed URL so the ElevenLabs API key never
ships to the browser. Everything else — the braille dictionary, the timing, the serial frames —
is client-side TypeScript.

## Pieces

| Piece | Where | Job |
|---|---|---|
| Voice agent | ElevenLabs dashboard (`agent/`) | speech-in/out, decides *what* to show, calls `render_braille` |
| `render_braille` tool | `apps/web/components/Conversation.tsx` | browser-side entry point → controller |
| Controller | `apps/web/lib/controller.ts` | connection + shared UI state; streams cells paced by the pot |
| Braille map | `apps/web/lib/braille.ts` | char → 6-bit cell (+ number/capital signs) |
| Speed map | `apps/web/lib/speed.ts` | pot 0–4095 → 3–10 chars/sec → delay ms |
| WebSerial driver | `apps/web/lib/serial.ts` | open port, parse lines, send `B`/`Z`/`ID?`, read `POT` |
| Signed-URL route | `apps/web/app/api/get-signed-url/route.ts` | server-side, protects the API key |
| Firmware | `firmware/braillebuddy_esp32/` | USB CDC serial → drive 6 servos, stream the pot |

## The contract between web and firmware
One line of ASCII serial, defined once in [`firmware/PROTOCOL.md`](../firmware/PROTOCOL.md).
The web side implements the host half (`lib/serial.ts`), the firmware implements the device
half (`src/main.cpp`). Agree the protocol, build both halves in parallel.
