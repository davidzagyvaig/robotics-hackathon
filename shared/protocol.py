"""
Serial protocol between host (Mete's software) and ESP32 (Samer/Dave's firmware).

THE CONTRACT — agree this Thursday 09:00 and never break it. The whole point
is that host and firmware can be built in parallel against this spec.

Line-based ASCII over USB serial @ 115200 baud, '\n' terminated.

HOST -> ESP32
    "P<pan> T<tilt>\n"   absolute target in degrees, e.g. "P12.5 T-4.0"
    "H\n"               heartbeat (send every 100 ms)
    "Z\n"               home / go to safe pose (pan=0 tilt=0)
    "E\n"               enable servos
    "D\n"               disable servos (detach, go limp)

ESP32 -> HOST
    "OK P<pan> T<tilt>\n"   ack + current commanded position
    "ST P<pan> T<tilt>\n"   periodic status (~10 Hz)
    "ERR <code>\n"          fault, see ERR_* below
    "BOOT\n"                firmware just started

Firmware behavior (Samer/Dave implement):
    - Pan/tilt clamped to [PAN_MIN,PAN_MAX] / [TILT_MIN,TILT_MAX].
    - Slew-limited to MAX_DEG_PER_S (no instant jumps -> no servo brownout).
    - Watchdog: if no "H" or "P" for WATCHDOG_MS, return to home pose and
      emit "ERR WATCHDOG". This is the single most important safety feature.
    - Servos on a dedicated 5.5-6V rail, common ground with ESP32, 1000uF cap.
"""

from __future__ import annotations

PAN_MIN, PAN_MAX = -90.0, 90.0
TILT_MIN, TILT_MAX = -45.0, 45.0
MAX_DEG_PER_S = 60.0
WATCHDOG_MS = 250
HEARTBEAT_MS = 100
BAUD = 115200

# Error codes (ESP32 -> host)
ERR_WATCHDOG = "WATCHDOG"     # no command within WATCHDOG_MS
ERR_CLAMP = "CLAMP"           # commanded value out of range (clamped)
ERR_PARSE = "PARSE"           # malformed line
ERR_BROWNOUT = "BROWNOUT"     # voltage sag detected (if firmware monitors)


def clamp_pan(pan: float) -> float:
    return max(PAN_MIN, min(PAN_MAX, pan))


def clamp_tilt(tilt: float) -> float:
    return max(TILT_MIN, min(TILT_MAX, tilt))


def encode_move(pan: float, tilt: float) -> bytes:
    """Host -> ESP32 move command. Clamps before sending."""
    return f"P{clamp_pan(pan):.2f} T{clamp_tilt(tilt):.2f}\n".encode("ascii")


def encode_heartbeat() -> bytes:
    return b"H\n"


def encode_home() -> bytes:
    return b"Z\n"


def encode_enable() -> bytes:
    return b"E\n"


def encode_disable() -> bytes:
    return b"D\n"


def parse_line(line: str) -> dict:
    """Parse an ESP32 -> host line into a dict. Returns {"type": ...}."""
    line = line.strip()
    if not line:
        return {"type": "EMPTY"}
    parts = line.split()
    head = parts[0]
    if head == "OK" or head == "ST":
        out = {"type": head}
        for tok in parts[1:]:
            if tok.startswith("P"):
                try:
                    out["pan"] = float(tok[1:])
                except ValueError:
                    pass
            elif tok.startswith("T"):
                try:
                    out["tilt"] = float(tok[1:])
                except ValueError:
                    pass
        return out
    if head == "ERR":
        return {"type": "ERR", "code": parts[1] if len(parts) > 1 else "UNKNOWN"}
    if head == "BOOT":
        return {"type": "BOOT"}
    return {"type": "UNKNOWN", "raw": line}
