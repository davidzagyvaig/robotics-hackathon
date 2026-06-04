# BrailleBuddy ⠃

**A voice-guided braille teaching box.** Plug the device into your laptop, open the website, and
talk to a friendly voice tutor — as it teaches, six servo-driven dots rise and fall under your
fingers so you can *feel* each letter.

Built at the 2nd Hungarian Robotics Hackathon @ Formlabs Budapest (June 2026) by **Team Nexus**.

> Open the site in Chrome → connect over **USB or Bluetooth** → start talking. Say *"teach me the
> letter C"* and the top two dots rise; the tutor holds each letter long enough to read.

---

## How it works

```
 you speak ─► ElevenLabs voice agent ─► render_braille("C", 3)  (runs in YOUR browser)
                                              │  look up "C" → 100100
        feel the dots ◄── 6 servos ◄── ESP32-S3 ◄──(USB or Bluetooth)── browser
                                              │
                              haptic buzz on each new letter
```

The agent has **one tool**, `render_braille(character, seconds)`. It runs as an ElevenLabs *client
tool* — in the browser, not on a server — because the device is connected to *your* machine and only
the browser can reach it over **USB (WebSerial)** or **Bluetooth (Web Bluetooth)**. The browser looks the
letter up in a braille dictionary, raises the 6 dots on the ESP32-S3, holds them for `seconds`, then
clears — the agent sets the pace. The only server code is one route that mints a signed URL so the API key
stays secret. Full write-up: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Monorepo layout

```
braillebuddy/
├── apps/web/                   Next.js app — UI, USB/BLE transport, braille logic, signed-URL route
│   ├── app/                      page.tsx · layout · api/get-signed-url
│   ├── components/               ConnectDevice · Conversation (ElevenLabs) · BrailleCell
│   └── lib/                      braille.ts · transport.ts · serialTransport.ts · bleTransport.ts · controller.ts
├── firmware/
│   ├── PROTOCOL.md             the one-line-of-ASCII serial contract (web ↔ device)
│   └── braillebuddy_esp32/      PlatformIO: src/main.cpp + Wokwi sim (diagram.json)
├── agent/                       ElevenLabs agent prompt + tool def + setup steps
└── docs/                        ARCHITECTURE · HARDWARE · BRAILLE · DEV_SETUP · BACKLOG
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
115200 baud ASCII — the same lines over **USB CDC and BLE** (Nordic UART, single identity `BrailleBuddy`).
Browser→device: `ID?`, `B<6 bits>`, `Z`, `E`, `D`, `H`. Device→browser: `BOOT`, `BRAILLEBUDDY v2`, `OK`,
`POT`/`SPEED`/`CHARMS`, `TOUCH`, `SW`. Full table: [`firmware/PROTOCOL.md`](firmware/PROTOCOL.md).

## Demo script (for judges)
1. Plug the device into the laptop. It runs a little dot "wave" on boot.
2. Open the site in Chrome → **Connect your BrailleBuddy** → "connected ✓".
3. **Start learning to read Braille** → say *"Hi! Teach me the letter A."*
4. Feel dot 1 rise. Ask for *"C"*, then *"the word cat"*.
5. Turn the knob — the spelling speeds up / slows down live.

## Status
- ✅ v2 firmware (servos + haptic + touch/switch) over USB-CDC **and** BLE, single `BrailleBuddy` identity.
- ✅ Web: USB **and** Bluetooth transports; `render_braille(character, seconds)`; on-screen cell mirror. Builds clean.
- ✅ ElevenLabs agent + `render_braille` client tool + signed-URL route wired.
- 🔜 Flash real board · build the physical cell + calibrate dots · deploy to Vercel.
- 📋 Tabled ideas (notifications, native apps, no-hardware mode, …) → [`docs/BACKLOG.md`](docs/BACKLOG.md).

## History
This repo began as **DermaScout** (a voice-guided 3D skin-documentation station). That project is
preserved on the `archive/dermascout` branch; `main` was rebuilt for BrailleBuddy, salvaging the
Next.js scaffold and the serial-protocol pattern. See [`TEAM.md`](TEAM.md).

---
Made by **Team Nexus** · built in 48h.
