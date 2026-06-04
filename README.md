# BrailleBuddy ⠃

**A voice-guided braille teaching box.** Plug the device into your laptop, open the website, and
talk to a friendly voice tutor — as it teaches, six servo-driven dots rise and fall under your
fingers so you can *feel* each letter.

Built at the 2nd Hungarian Robotics Hackathon @ Formlabs Budapest (June 2026) by **Team Nexus**.

> Open the site in Chrome → "Connect your BrailleBuddy" → start talking. Say *"teach me the
> letter C"* and the top two dots rise. Turn the knob to read faster or slower.

---

## How it works

```
 you speak ─► ElevenLabs voice agent ─► render_braille("c")  (runs in YOUR browser)
                                              │
        feel the dots ◄── 6 servos ◄── ESP32-S3 ◄──(WebSerial / USB)── browser
                                              ▲
                              speed knob ─► potentiometer ─► "POT 2048"
```

The agent has **one tool**, `render_braille(text)`. It runs as an ElevenLabs *client tool* —
in the browser, not on a server — because the device is plugged into *your* machine and only the
browser can reach it over **WebSerial**. The browser splits the text into characters, looks each
up in a braille dictionary, and streams 6-bit dot patterns to the ESP32-S3, paced by a
potentiometer that sets reading speed (3–10 chars/sec). The only server code is one route that
mints a signed URL so the API key stays secret. Full write-up: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Monorepo layout

```
braillebuddy/
├── apps/web/                   Next.js app — UI, WebSerial, braille+speed logic, signed-URL route
│   ├── app/                      page.tsx · layout · api/get-signed-url
│   ├── components/               ConnectDevice · Conversation (ElevenLabs) · BrailleCell
│   └── lib/                      braille.ts · serial.ts · speed.ts · controller.ts
├── firmware/
│   ├── PROTOCOL.md             the one-line-of-ASCII serial contract (web ↔ device)
│   └── braillebuddy_esp32/      PlatformIO: src/main.cpp + Wokwi sim (diagram.json)
├── agent/                       ElevenLabs agent prompt + tool def + setup steps
└── docs/                        ARCHITECTURE · HARDWARE · BRAILLE · DEV_SETUP
```

## Quick start

### Web app
```bash
npm install
npm run dev          # → http://localhost:3000  (Chrome or Edge)
```
For the voice tutor, set up the agent ([`agent/README.md`](agent/README.md)) and put
`ELEVENLABS_API_KEY` + `NEXT_PUBLIC_AGENT_ID` in `apps/web/.env.local` (template: `.env.example`).
Connecting the device and feeling dots works without any keys.

### Firmware
```bash
cd firmware/braillebuddy_esp32
pio run                 # build   (PlatformIO — see docs/DEV_SETUP.md for Cursor extensions)
pio run -t upload       # flash the ESP32-S3
pio device monitor -b 115200
```
No board yet? Build, then run the **Wokwi** simulator (6 servos + a pot) right inside Cursor.

## Hardware (short version)
ESP32-S3 · 6× MG90S servos (one per dot) · a potentiometer · a **dedicated 5–6 V servo rail**
(not the ESP 5V pin), common ground, 1000 µF cap. Pin map + calibration: [`docs/HARDWARE.md`](docs/HARDWARE.md).

## The serial contract
115200 baud ASCII over native USB CDC. Browser→device: `ID?`, `B<6 bits>`, `Z`, `E`, `D`.
Device→browser: `BOOT`, `BRAILLEBUDDY v1`, `OK`, `POT <0-4095>`. Full table:
[`firmware/PROTOCOL.md`](firmware/PROTOCOL.md).

## Demo script (for judges)
1. Plug the device into the laptop. It runs a little dot "wave" on boot.
2. Open the site in Chrome → **Connect your BrailleBuddy** → "connected ✓".
3. **Start learning to read Braille** → say *"Hi! Teach me the letter A."*
4. Feel dot 1 rise. Ask for *"C"*, then *"the word cat"*.
5. Turn the knob — the spelling speeds up / slows down live.

## Status
- ✅ Monorepo scaffolded; Next.js app builds clean.
- ✅ Browser-side braille dictionary, speed mapping, WebSerial driver, on-screen cell mirror.
- ✅ ESP32-S3 firmware (direct-GPIO servos + pot) with Wokwi simulation.
- ✅ ElevenLabs `render_braille` client tool + signed-URL route wired.
- 🔜 Flash real board · build the physical cell mechanism · calibrate dots · deploy to Vercel.

## History
This repo began as **DermaScout** (a voice-guided 3D skin-documentation station). That project is
preserved on the `archive/dermascout` branch; `main` was rebuilt for BrailleBuddy, salvaging the
Next.js scaffold and the serial-protocol pattern. See [`TEAM.md`](TEAM.md).

---
Made by **Team Nexus** · built in 48h.
