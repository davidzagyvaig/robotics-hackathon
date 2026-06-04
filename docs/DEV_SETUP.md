# Dev setup

Monorepo with two toolchains: **Node/Next.js** (the web app) and **PlatformIO/Arduino** (the
firmware). Everything works in **Cursor** (a VS Code fork) using extensions from Open VSX.

## Prerequisites
- **Node 18+** (tested on Node 24) and npm.
- **Chrome or Edge** for the device link: **USB (WebSerial)** is desktop-Chromium only;
  **Bluetooth (Web Bluetooth)** works on desktop Chromium **and Android Chrome**. Both need HTTPS or
  `localhost`. Safari/Firefox can't reach the device.

## Web app
```bash
npm install            # installs the apps/web workspace
npm run dev            # → http://localhost:3000   (root script delegates to apps/web)
```
Create `apps/web/.env.local` from the repo-root `.env.example` and fill in `ELEVENLABS_API_KEY`
+ `NEXT_PUBLIC_AGENT_ID` (see [`agent/README.md`](../agent/README.md)). The connect button and
device link work without keys; you only need them to start a voice conversation.

Build check: `npm run build`.

## Firmware in Cursor
Install from **Open VSX** (Cursor's extension registry — Extensions panel, or the gear → "Install
from VSIX"/marketplace search):

- **PlatformIO IDE for Cursor** (`DavidGomes/platformio-ide-cursor`) — build, upload, serial monitor.
- **Wokwi for VS Code** — simulate the board with no hardware.

Then:
```bash
cd firmware/braillebuddy_esp32
pio run                 # build
pio run -t upload       # flash a connected board
pio device monitor -b 115200
```
The `platformio.ini` already enables native USB CDC (`-DARDUINO_USB_CDC_ON_BOOT=1`). If your
exact S3 board isn't a generic devkit, change `board` (`pio boards esp32s3` lists options).

### Simulate (no board needed)
1. `pio run` (Wokwi needs the built `.bin`/`.elf` referenced by `wokwi.toml`).
2. `F1` → **Wokwi: Start Simulator**. `diagram.json` wires 6 servos + a pot to the S3.
3. In the simulator's serial terminal: type `ID?` → `BRAILLEBUDDY v2`, `B100000` → dot 1 horn
   swings, drag the pot → `POT`/`SPEED`/`CHARMS` change. (BLE, haptic, and touch don't simulate.)
   *(The sim's serial is over UART; the real board uses native USB CDC — identical logic.)*

## Deploy (Vercel)
- Import the repo in Vercel. Set **Root Directory = `apps/web`** (it's a monorepo).
- Env vars: `ELEVENLABS_API_KEY` and `NEXT_PUBLIC_AGENT_ID`.
- Vercel serves HTTPS, which WebSerial and Web Bluetooth require. Open the deployed URL in Chrome/Edge
  (or Android Chrome for Bluetooth), connect, and go.

## Where things live
- `apps/web/` — Next.js app (UI, USB/BLE transport, braille logic, signed-URL route).
- `firmware/braillebuddy_esp32/` — PlatformIO project (`src/main.cpp`, `platformio.ini`, Wokwi files).
- `agent/` — ElevenLabs agent prompt + tool definition + setup.
- `docs/` — this folder.
- `firmware/PROTOCOL.md` — the serial contract shared by web + firmware.
