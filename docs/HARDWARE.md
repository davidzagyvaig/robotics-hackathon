# Hardware

## Bill of materials
- 1× **ESP32-S3** dev board (native USB). The camera/OV5640 is **not used**.
- 6× **MG90S** micro servos (one per braille dot).
- 1× **potentiometer** (10 kΩ linear) — sets the servo **sweep speed**.
- 1× **haptic vibration motor** + small driver board — buzzes on each new letter.
- 1× **capacitive touch module** (e.g. TTP223). *(read + reported; web feature is backlog)*
- 1× **2-prong toggle switch**. *(read + reported as `SW`; reserved)*
- 1× **5–6 V supply** for the servo rail (2 A+) and 1× **1000 µF** electrolytic cap.
- Hookup wire; a 3D-printed cell/frame that turns servo motion into raised dots.

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

- Servos V+ → **dedicated 5–6 V rail**; servo GND **and** ESP32-S3 GND → **common ground**.
- **1000 µF cap** across the servo rail, close to the servos.
- Each servo **signal** → one PWM-capable GPIO; **pot wiper** → an ADC pin.
- **Haptic** driver IN → `HAPTIC_PIN` (plus its VCC/GND); set `HAPTIC_ACTIVE_HIGH` to match the driver.
- **TTP223 touch:** VCC→3V3, GND→GND, SIG→`TOUCH_PIN`.
- **Toggle switch:** one prong→`SWITCH_PIN`, other→GND (internal pull-up; closed reads LOW).

## Pin map (confirm against your board; matches `src/main.cpp`)
Avoid the native-USB pins (GPIO19/20) and strapping pins (GPIO0, 3, 45, 46).

| Function | GPIO | Notes |
|---|---|---|
| Dots 1–6 | 4, 5, 6, 7, 15, 16 | PWM (LEDC) |
| Potentiometer | 1 | ADC1 (12-bit) |
| Haptic motor | 17 | on/off digital |
| Touch (TTP223) | 18 | input |
| Toggle switch | 8 | input, pull-up |

These match `SERVO_PINS` / `POT_PIN` / `HAPTIC_PIN` / `TOUCH_PIN` / `SWITCH_PIN` at the top of
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
The pot sets how fast the dots **sweep** between OFF and ON (`MIN_STEP_DEG`/`MAX_STEP_DEG`, `SERVO_UPDATE_MS`).
How long each letter is **shown** is set by the agent — `render_braille(character, seconds)`. So today the
pot is just sweep feel; making it a reading-speed knob is in [`BACKLOG.md`](./BACKLOG.md).

## Idle behaviour
Holding a position makes servos buzz/heat. Send `D` to relax (detach) when idle, `E` to re-energize
(the firmware re-applies the last cell on `E`).
