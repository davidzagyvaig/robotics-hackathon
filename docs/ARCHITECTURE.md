# Architecture

BrailleBuddy is a voice-guided braille tutor ("Duolingo for braille"). A learner opens the web app — a
two-pane layout, **tutor on the left, the cell on the right** — talks to the voice tutor, and feels or
watches the six dots of one braille cell rise and fall. It runs with **no hardware** (an on-screen cell
that's a real software model of the device) and, when an ESP32 cell is connected over USB or Bluetooth,
the *same* code drives the physical dots. The tutor is adaptive (level + saved progress) and the voice
is optional (mute → read captions). Teaching method: [`PEDAGOGY.md`](./PEDAGOGY.md).

Two browser client tools: `render_braille(character, seconds)` shows one letter; `render_word(word,
seconds_per_letter)` steps a word across the cell and highlights each letter on the on-screen strip.
Curriculum lives in `lib/curriculum.ts`, learner progress in `lib/progress.ts` (localStorage).

## Data flow

```
            speaks / listens
  Learner  ─────────────────►  ElevenLabs voice agent  (cloud)
     ▲                                  │  decides to show a letter
     │ feels dots                       ▼
     │                  render_braille("R", 3)              ← CLIENT tool, runs in the browser
     │                                  │
     │                  apps/web/lib/controller.ts
     │                   charToBits("R")  → "111010"
     │                                  ▼
     │            apps/web/lib/{serial,ble}Transport.ts  ──►  ESP32-S3 firmware
     │                     B111010 … hold 3 s … Z              │   (USB CDC  or  BLE NUS)
     │                                  │                      ▼
     └──────────────────────────────────────────────  6× MG90S servos (+ haptic buzz)
```

## The decisions that shape it

**Actuation is browser-side.** The device is plugged into / paired with the *learner's* machine; the
cloud can't reach it. So the agent's tool is an ElevenLabs **client tool** that runs in the browser
(`@elevenlabs/react`), where WebSerial / Web Bluetooth can reach the device. The only server code is
`/api/get-signed-url`, which mints a signed URL so the API key never ships to the browser.

**The agent owns timing.** `render_braille(character, seconds)` raises one cell, holds it for `seconds`,
then drops every dot. The browser does the letter→pattern lookup (`braille.ts`); the agent just passes the
letter. The potentiometer sets the physical *sweep speed* on the device — the firmware streams
`POT`/`SPEED`/`CHARMS`/`TOUCH`/`SW`, but the web currently ignores them (hooks for `BACKLOG.md` features).

**One device, two transports, one at a time.** The firmware speaks the same line protocol over USB-CDC and
BLE (single identity `BrailleBuddy`). A `Transport` interface hides which one is in use; BLE is built on
`@capacitor-community/bluetooth-le` so the exact code works in the browser now and natively later.

## Pieces

| Piece | Where | Job |
|---|---|---|
| Voice agent | ElevenLabs dashboard (`agent/`) | speech in/out; decides *what* to show; calls `render_braille` |
| `render_braille` tool | `apps/web/components/Conversation.tsx` | browser-side entry → controller |
| Controller | `apps/web/lib/controller.ts` | connection + shared state; raise → hold `seconds` → clear |
| Braille map | `apps/web/lib/braille.ts` | char → 6-bit cell pattern |
| Transport | `apps/web/lib/transport.ts` + `serialTransport.ts` + `bleTransport.ts` | USB / BLE line I/O |
| Signed-URL route | `apps/web/app/api/get-signed-url/route.ts` | server-side; protects the API key |
| Firmware | `firmware/braillebuddy_esp32/` | USB-CDC + BLE serial → 6 servos + haptic |

## The contract
One line of ASCII serial, defined once in [`firmware/PROTOCOL.md`](../firmware/PROTOCOL.md). The web side
implements the host half (`serialTransport.ts` / `bleTransport.ts`), the firmware the device half
(`src/main.cpp`).
