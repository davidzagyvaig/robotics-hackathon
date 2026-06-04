# DermaScout serial protocol (host ↔ ESP32)

**Agree this Thursday 09:00. Build host and firmware in parallel against it.**

Line-based ASCII, USB serial, **115200 baud**, `\n` terminated.

## Host → ESP32
| Command | Meaning |
|---|---|
| `P<pan> T<tilt>\n` | absolute target in degrees, e.g. `P12.5 T-4.0` |
| `H\n` | heartbeat — send every 100 ms |
| `Z\n` | home / safe pose (pan=0 tilt=0) |
| `E\n` | enable servos |
| `D\n` | disable servos (go limp) |

## ESP32 → Host
| Reply | Meaning |
|---|---|
| `OK P<pan> T<tilt>\n` | move acknowledged |
| `ST P<pan> T<tilt>\n` | periodic status (~10 Hz) |
| `ERR <code>\n` | fault: `WATCHDOG`, `CLAMP`, `PARSE`, `BROWNOUT` |
| `BOOT\n` | firmware started |

## Firmware guarantees (the safety contract)
- **Clamp** pan to ±90°, tilt to ±45°.
- **Slew-limit** to 60°/s — no instant jumps (prevents brownout, the #1 hardware risk).
- **Watchdog**: no `H`/`P` within 250 ms → return to home + emit `ERR WATCHDOG`.

## Wiring
- Servos on a **dedicated 5.5–6 V rail**, **NOT** the ESP32 5V pin.
- **Common ground** between ESP32 and servo PSU.
- **1000 µF cap** across the servo rail.
- Pan servo → PCA9685 ch 0, tilt → ch 1. ESP32 SDA/SCL → PCA9685 SDA/SCL.

## Flash it
1. Arduino IDE → Library Manager → install **Adafruit PWM Servo Driver Library**.
2. Board: your ESP32 variant. Open `dermascout_esp32/dermascout_esp32.ino`.
3. Upload. Open Serial Monitor @ 115200 — you should see `BOOT` then `ST ...` at 10 Hz.

## Test from the host without the GUI
```bash
# the SimDriver mirrors this exactly, so software works before the board exists
python -c "from control.arm_driver import SerialDriver; \
a=SerialDriver('/dev/tty.usbmodemXXXX'); a.move_to(20,-10); a.home(); a.close()"
```

The Python side of this contract lives in [`shared/protocol.py`](../shared/protocol.py)
and [`control/arm_driver.py`](../control/arm_driver.py) (`SimDriver` ↔ `SerialDriver`).
