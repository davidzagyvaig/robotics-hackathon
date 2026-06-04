# BrailleBuddy serial protocol (host ↔ ESP32-S3) — v2

Line-based ASCII, **115200 baud**, `\n`-terminated. The **same lines** run over two transports:
- **USB CDC** (the ESP32-S3 native USB port → a serial port; WebSerial on desktop Chrome/Edge), and
- **BLE** — Nordic UART Service, single advertised name **`BrailleBuddy`**, one connection at a time
  (re-advertises on disconnect). The web app reaches it with `@capacitor-community/bluetooth-le`.

One braille **cell** = 6 dots, each raised/lowered by one servo. Dot/bit order is dots **1..6**:

```
1 4
2 5
3 6
```

So `B100000` raises dot 1 (the letter "a"); `B111010` raises dots 1,2,3,5 (the letter "r").

## Host → Device
| Command | Meaning |
|---|---|
| `ID?` | identify — device replies `BRAILLEBUDDY v2` |
| `B<6 bits>` | set the cell, e.g. `B101100`; **pulses the haptic motor** (a new letter) |
| `Z` | lower every dot (no haptic) |
| `E` | enable / re-attach the servos |
| `D` | relax (detach) servos so they stop buzzing/heating when idle |
| `H` | fire one haptic pulse now (test) |
| `CON <dot> <ang>` | calibrate the ON (raised) angle of a dot — dot 1-6, ang 0-180 |
| `COFF <dot> <ang>` | calibrate the OFF (flush) angle of a dot |
| `C?` | dump current calibration + speed (`CAL …` lines) |

## Device → Host
| Reply | Meaning |
|---|---|
| `BOOT` | firmware started |
| `BRAILLEBUDDY v2` | identity, in reply to `ID?` |
| `OK` / `ERR PARSE` | ack / unrecognized command |
| `POT <0-4095>` | raw potentiometer (speed knob), ~10 Hz |
| `SPEED <0-100>` | pot-derived servo **sweep** speed percent, ~10 Hz |
| `CHARMS <ms>` | ms for one cell to fully change at the current sweep speed, ~10 Hz |
| `TOUCH 1` / `TOUCH 2` | single / double tap on the capacitive touch button |
| `SW 0` / `SW 1` | physical toggle switch changed state (reserved) |
| `CAL <dot> off <a> on <b>` | calibration dump (reply to `C?`) |

## What the web app actually uses (today)
The app sends `ID?`, `B<bits>`, `Z`, and listens for `BRAILLEBUDDY`. **Timing is agent-driven**: the
ElevenLabs tool `render_braille(character, seconds)` raises a cell, holds it for `seconds`, then sends
`Z`. The potentiometer sets the physical **sweep speed** on the device; `POT`/`SPEED`/`CHARMS`/`TOUCH`/`SW`
are streamed but the web currently ignores them — they're hooks for backlog features (see `docs/BACKLOG.md`).

## Wiring (the #1 risk is servo power — get it right first)
- 6 servos on a **dedicated 5-6 V rail**, NOT the ESP 5V/3V3 pin. **Common ground**, **1000 µF cap** across the rail.
- 6 servo signals → 6 PWM GPIOs; potentiometer wiper → one ADC pin.
- Haptic motor driver IN → `HAPTIC_PIN`; TTP223 touch SIG → `TOUCH_PIN`; toggle → `SWITCH_PIN` (to GND).
- Pins + per-dot **angle** calibration: `docs/HARDWARE.md`. The pin/angle constants live at the top of
  `firmware/braillebuddy_esp32/src/main.cpp`.

## Flash it
PlatformIO (works in Cursor): from `firmware/braillebuddy_esp32/`, `pio run -t upload`, then
`pio device monitor -b 115200`. You should see `BOOT`, then `SPEED`/`CHARMS`/`POT` at ~10 Hz. Native USB
CDC + BLE + the app need the `huge_app` partition (already set in `platformio.ini`).

## Test without the GUI
In the serial monitor: `ID?` → `BRAILLEBUDDY v2`; `B111010` raises R (+ buzz); `H` buzzes; `Z` clears;
flip the switch → `SW 0/1`; tap the button → `TOUCH 1`/`TOUCH 2`. The host half of this contract is
`apps/web/lib/serialTransport.ts` + `bleTransport.ts` + `controller.ts`.
