# Hardware

## Bill of materials
- 1× **ESP32-S3** dev board (with native USB). The camera/OV5640 is **not used** by BrailleBuddy.
- 6× **MG90S** micro servos (one per braille dot).
- 1× **potentiometer** (10 kΩ linear) — the reading-speed knob.
- 1× **5–6 V power supply** for the servo rail (e.g. a 2 A+ BEC or bench supply).
- 1× **1000 µF** electrolytic capacitor across the servo rail.
- Hookup wire; a 3D-printed cell/frame that turns servo motion into raised dots.

## The braille cell
Six dots in a 2×3 grid. Dot numbering (this is the bit order everywhere in the code):

```
1 4
2 5
3 6
```

Each dot is one servo moving between two fixed positions: **down** (flush) and **up** (raised).

## Wiring — do the power right first (the #1 risk)
Six MG90S can pull well over an amp on simultaneous stall. **Do not** power them from the
ESP32-S3's 5V/3V3 pin — a brownout will reset the board mid-demo.

- Servos V+ → **dedicated 5–6 V rail** from the external supply.
- Servos GND **and** ESP32-S3 GND → **common ground** (tie them together).
- **1000 µF cap** across the servo rail (close to the servos) to absorb current spikes.
- Each servo **signal** wire → one PWM-capable GPIO (below).
- Potentiometer: ends → 3V3 and GND, **wiper → the ADC pin**.

## Suggested pin map (confirm against your board)
ESP32-S3 has plenty of free GPIOs when the camera is unused. Avoid the native-USB pins
(GPIO19/20) and the strapping pins (GPIO0, 3, 45, 46). Also avoid pins wired to onboard
flash/PSRAM on your specific module — check its pinout.

| Function | GPIO | Notes |
|---|---|---|
| Dot 1 | 4 | PWM (LEDC) |
| Dot 2 | 5 | PWM |
| Dot 3 | 6 | PWM |
| Dot 4 | 7 | PWM |
| Dot 5 | 15 | PWM |
| Dot 6 | 16 | PWM |
| Pot wiper | 1 | ADC1 (12-bit, 0–4095) |

These match `DOT_PINS` / `POT_PIN` in `firmware/braillebuddy_esp32/src/main.cpp`. If you change
the wiring, change those two arrays (and only those).

## Per-dot calibration
Cheap servos vary, and the mechanism for each dot may need a slightly different throw. The
firmware holds two pulse-width arrays:

```cpp
int DOWN_US[6] = {1000, 1000, 1000, 1000, 1000, 1000}; // flush
int UP_US[6]   = {1600, 1600, 1600, 1600, 1600, 1600}; // raised
```

Tune each entry (microseconds, ~500–2400 = 0–180°) so **down** sits flush and **up** raises a
crisp, readable dot without straining. Re-flash after editing.

## Idle behaviour
Holding a position makes servos buzz and heat. The web app / agent can send `D` (relax =
detach) when idle and `E` (re-energize) before the next character; the firmware re-applies the
last cell on `E`.
