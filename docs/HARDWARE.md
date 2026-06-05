# Hardware

## Bill of materials
- 1× **ESP32-S3** dev board (native USB). The camera/OV5640 is **not used**.
- 6× **MG90S** micro servos (one per braille dot).
- 1× **push button** (4-pin tactile) — taps start the tutor hands-free / step through items.
- 1× **5–6 V supply** for the servo rail (2 A+) and 1× **1000 µF** electrolytic cap.
- Hookup wire; a 3D-printed cell/frame that turns servo motion into raised dots.

*No potentiometer, haptic motor, or switch are fitted — GPIO1 / 8 / 17 are free.*

## The braille cell
Six dots in a 2×3 grid. Dot numbering (the bit order everywhere in the code):

```
1 4
2 5
3 6
```

Each dot is one servo moving between two fixed angles: **OFF** (flush) and **ON** (raised).

## Wiring — do the power right first (the #1 risk)
Six MG90S can pull over an amp on simultaneous stall. **Do not** power them from the ESP32-S3's 5V/3V3 pin.

- Servos V+ → **dedicated 5 V rail**; servo GND **and** ESP32-S3 GND → **common ground**.
- **1000 µF cap** across the servo rail, close to the servos.
- Each servo **signal** → one PWM-capable GPIO.
- **Push button:** one leg → the button GPIO (`TOUCH_PIN`), the diagonal leg → **3V3**. Internal pull-down
  (`INPUT_PULLDOWN`), so pressed reads HIGH. ⚠️ **3V3 only — never 5 V** (GPIOs aren't 5V-tolerant).
  The button sits entirely on the ESP header; nothing to add on the power bus.

Diagram: [`../firmware/braillebuddy_esp32/circuit.svg`](../firmware/braillebuddy_esp32/circuit.svg).

## Pin map (confirm against your board; matches `src/main.cpp`)
Avoid the native-USB pins (GPIO19/20) and strapping pins (GPIO0, 3, 45, 46).

| Function | GPIO | Notes |
|---|---|---|
| Dots 1–6 | 4, 5, 6, 7, 15, 16 | PWM (LEDC) |
| Push button | 18 | input, pull-down; other leg → 3V3 (active-high) |

Free / unused: **GPIO1, GPIO8, GPIO17**. These match `SERVO_PINS` / `TOUCH_PIN` at the top of
`firmware/braillebuddy_esp32/src/main.cpp`. Change the wiring → change only those constants.

## Per-dot calibration (degrees)
The firmware holds an OFF (flush) and ON (raised) **angle** per dot:

```cpp
int OFF_ANGLE[6] = {20, 20, 20, 20, 20, 20}; // flush
int ON_ANGLE[6]  = {40, 40, 40, 40, 40, 40}; // raised
```

Tune each so **OFF** sits flush and **ON** is a crisp, readable dot without straining. You can calibrate
**live over serial** without re-flashing: `CON <dot> <angle>` (raised), `COFF <dot> <angle>` (flush),
`C?` to dump.

## Sweep speed vs. reading time
No pot is fitted, so the dots **sweep** at a fixed speed — `speedPct` (with `MIN_STEP_DEG`/`MAX_STEP_DEG`
and `SERVO_UPDATE_MS`). How long each letter is **shown** is set by the agent —
`render_braille(character, seconds)`. To change the sweep feel, edit `speedPct` (or the step constants)
and re-flash.

## Idle behaviour
Holding a position makes servos buzz/heat. Send `D` to relax (detach) when idle, `E` to re-energize
(the firmware re-applies the last cell on `E`).
