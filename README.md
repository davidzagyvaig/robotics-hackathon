# BrailleBuddy ⠃

**Duolingo for braille — a voice-guided tutor with a tactile cell.** Open the website, talk to a
patient voice tutor, and *feel* (or watch) six dots rise and fall to form each letter. It works with
**no hardware at all** (an on-screen cell), and the *same* app drives a real ESP32 braille cell over
USB or Bluetooth when one is connected.

Built at the 2nd Hungarian Robotics Hackathon @ Formlabs Budapest (June 2026) by **Team Nexus**.

> Two panes: **your tutor** on the left, **the cell** on the right. Say *"teach me the letter C"* and
> the top two dots rise while the right pane shows C. Ask to *"read the word cat"* and it steps C-A-T
> across the cell. Mute the voice and read captions, or close your eyes and feel the dots — both work.

For blind learners *and* sighted people learning braille. Voice is optional (toggle it off and read
captions). The tutor is **adaptive**: a placement check picks your level, and the app remembers where
you left off.

---

## How it works

```
 you speak ─► ElevenLabs voice agent ─► render_braille("C", 3) / render_word("cat", 1.5)
                                              │   (CLIENT tools — run in YOUR browser)
                                              │   look up letters → dot patterns (braille.ts)
   feel / see the dots ◄── on-screen cell  ◄──┤
                       ◄── 6 servos ◄ ESP32-S3 ◄──(USB / Bluetooth)── browser
                                              │   haptic buzz on each new letter (hardware)
```

The agent has **two client tools** — `render_braille(character, seconds)` and
`render_word(word, seconds_per_letter)` — that run in the *browser* (not a server), because that's the
only place that can reach a plugged-in device over **USB (WebSerial)** or **Bluetooth (Web Bluetooth)**.
The browser looks letters up in a braille dictionary and drives **either** the on-screen cell (no
hardware) **or** the real ESP32 cell — identical code path. The only server code is one route that
mints a signed URL so the API key stays secret. Full write-up: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
teaching method: [`docs/PEDAGOGY.md`](docs/PEDAGOGY.md).

## Simulation-first
The on-screen cell is a real software model of the device, not a mock — `render_braille`/`render_word`
drive it exactly as they drive the hardware. So the whole experience (tutor → cell → word) is testable
on any laptop with zero hardware, which is also the fallback if a servo misbehaves on demo day, and the
clean B-roll source for the launch video.

## Monorepo layout

```
braillebuddy/
├── apps/web/                   Next.js app — two-pane tutor UI, USB/BLE transport, braille logic
│   ├── app/                      page.tsx (two-pane) · layout · api/get-signed-url
│   ├── components/               Conversation (left: agent + transcript + voice toggle) ·
│   │                             LessonStage (right: cell + word strip + level rail) ·
│   │                             BrailleCell · MiniCell · ConnectDevice
│   └── lib/                      braille.ts · curriculum.ts · progress.ts · controller.ts ·
│                                 transport.ts · serialTransport.ts · bleTransport.ts
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
- ✅ **Two-pane app** (tutor | cell) with a warm editorial UI. Builds clean (`npm run build`).
- ✅ **Built for blind users first** — voice-first, no login/forms. The device button (or the
  on-screen **Hands-free voice mode** button) hands the whole app to the voice agent. Sighted users
  just open the dashboard normally (voice optional).
- ✅ **Voice identity** — the agent asks your name and maps it to your profile; returning learners are
  greeted back and resumed at their level (no typing, ever).
- ✅ **Local Postgres** (PGlite, in-repo, no cloud/Docker) — learners, mastered letters, quiz attempts,
  streaks. Travels with the repo; `npm install` and it runs. A **/learners** dashboard tracks everyone.
- ✅ **No-hardware mode** + **Watch-demo** — full tutor + on-screen cell, zero device (sim-first / B-roll).
- ✅ **Quiz mode** — mystery letter → multiple-choice → scored, masters letters, logged to the DB.
- ✅ **Curriculum** (decade-based, `lib/curriculum.ts`), **render_braille** + **render_word**, voice toggle + captions.
- ✅ **Emotional agent** — Dot has real personality + expressive ElevenLabs delivery (`agent/prompt.md`).
- ✅ v2 firmware (servos + haptic + touch) over USB-CDC **and** BLE, single `BrailleBuddy` identity.
- 🔜 Drop in ElevenLabs API key · flash real board + calibrate dots · deploy.
- 📋 More ideas → [`docs/BACKLOG.md`](docs/BACKLOG.md).

## History
This repo began as **DermaScout** (a voice-guided 3D skin-documentation station). That project is
preserved on the `archive/dermascout` branch; `main` was rebuilt for BrailleBuddy, salvaging the
Next.js scaffold and the serial-protocol pattern. See [`TEAM.md`](TEAM.md).

---
Made by **Team Nexus** · built in 48h.
