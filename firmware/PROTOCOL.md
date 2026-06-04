# BrailleBuddy serial protocol (browser ↔ ESP32-S3)

Line-based ASCII over the ESP32-S3 **native USB CDC** port, **115200 baud**, `\n`-terminated.
The browser talks to it with the **WebSerial API** (Chrome/Edge). No host driver, no extra chip.

One braille **cell** = 6 dots, each raised/lowered by one servo. Dot/bit order is dots **1..6**:

```
1 4
2 5
3 6
```

So `B100000` raises only dot 1 (the letter "a"); `B111000` raises dots 1-2-3 (the letter "l").

## Browser → ESP32
| Command | Meaning |
|---|---|
| `ID?\n` | identify — device replies `BRAILLEBUDDY v1` |
| `B<6 bits>\n` | set the cell, e.g. `B101100` (raise dots 1,3,4) |
| `Z\n` | lower every dot (clear the cell) |
| `E\n` | enable / re-energize the servos |
| `D\n` | relax (detach) the servos so they stop buzzing + heating when idle |

## ESP32 → Browser
| Reply | Meaning |
|---|---|
| `BOOT\n` | firmware started |
| `BRAILLEBUDDY v1\n` | identity, in reply to `ID?` (the web app uses this to confirm the right device) |
| `OK\n` | last command applied |
| `ERR PARSE\n` | unrecognized command |
| `POT <0-4095>\n` | potentiometer (reading-speed knob), streamed ~10 Hz |

## Speed knob
The firmware just reports the raw 12-bit ADC value. The **browser** maps it to a reading speed:
`cps = 3 + (pot / 4095) * 7` → 3–10 chars/sec → per-character delay `1000 / cps` ms
(see `apps/web/lib/speed.ts`). Turn the knob mid-word and the pacing changes live.

## Wiring (the #1 hardware risk — get this solid first)
- Servos on a **dedicated 5–6 V rail**, **NOT** the ESP32-S3 5V/3V3 pin (6× MG90S can spike on stall).
- **Common ground** between the ESP32-S3 and the servo PSU.
- **1000 µF cap** across the servo rail to absorb current spikes.
- 6 servo signal lines → 6 PWM-capable GPIOs; potentiometer wiper → one ADC pin.
- See `docs/HARDWARE.md` for the suggested pin map and per-dot calibration.

## Flash it
PlatformIO (recommended — works in Cursor): `pio run -t upload` from `firmware/braillebuddy_esp32/`,
then `pio device monitor -b 115200`. You should see `BOOT`, then `POT ...` at ~10 Hz.
Native USB CDC is enabled via `-DARDUINO_USB_CDC_ON_BOOT=1` (already in `platformio.ini`).

## Test without the GUI
Open the PlatformIO serial monitor and type (the device echoes `OK`):
```
ID?        -> BRAILLEBUDDY v1
B100000    -> raises dot 1 (a)
B111000    -> raises dots 1-2-3 (l)
Z          -> all dots down
```
The same frames are produced by `apps/web/lib/serial.ts` (`sendCell`, `clear`, `identify`).
