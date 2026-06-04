"""
ArmDriver — the single abstraction that makes sim and real hardware interchangeable.

    driver.move_to(pan_deg, tilt_deg)   # blocking until settled (or timeout)
    driver.home()
    driver.close()

Implementations:
    SimDriver     prints/loops; no hardware. Use for the whole software stack.
    SerialDriver  talks to the ESP32 over the protocol in shared/protocol.py.

All DermaScout control code is written against ArmDriver, never against pyserial
directly. Swap with config.USE_ARM. This is the contract between Mete's software
and Samer/Dave's firmware: agree the protocol, build both sides in parallel.
"""

from __future__ import annotations

import time
from typing import Protocol

from shared import protocol


class ArmDriver(Protocol):
    def move_to(self, pan_deg: float, tilt_deg: float) -> bool: ...
    def home(self) -> None: ...
    def close(self) -> None: ...


class SimDriver:
    """No hardware. Simulates slew time so timing matches the real arm."""

    def __init__(self, max_deg_per_s: float = protocol.MAX_DEG_PER_S, verbose: bool = True):
        self.pan = 0.0
        self.tilt = 0.0
        self.max_deg_per_s = max_deg_per_s
        self.verbose = verbose

    def move_to(self, pan_deg: float, tilt_deg: float) -> bool:
        pan_deg = protocol.clamp_pan(pan_deg)
        tilt_deg = protocol.clamp_tilt(tilt_deg)
        dist = max(abs(pan_deg - self.pan), abs(tilt_deg - self.tilt))
        dt = dist / self.max_deg_per_s
        time.sleep(min(dt, 2.0))
        self.pan, self.tilt = pan_deg, tilt_deg
        if self.verbose:
            print(f"[sim-arm] -> P{pan_deg:.1f} T{tilt_deg:.1f} ({dt*1000:.0f}ms)")
        time.sleep(0.25)  # settle, matches real servo behavior
        return True

    def home(self) -> None:
        self.move_to(0.0, 0.0)

    def close(self) -> None:
        pass


class SerialDriver:
    """Talks to the ESP32. Sends heartbeats in a background thread."""

    def __init__(self, port: str, baud: int = protocol.BAUD, settle_s: float = 0.25):
        import threading

        import serial  # pyserial

        self._serial = serial.Serial(port, baud, timeout=0.1)
        self.pan = 0.0
        self.tilt = 0.0
        self.settle_s = settle_s
        self._alive = True
        self._hb = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._hb.start()
        time.sleep(2.0)  # let ESP32 boot
        print(f"[serial-arm] connected {port} @ {baud}")

    def _heartbeat_loop(self) -> None:
        while self._alive:
            try:
                self._serial.write(protocol.encode_heartbeat())
            except Exception:
                break
            time.sleep(protocol.HEARTBEAT_MS / 1000.0)

    def move_to(self, pan_deg: float, tilt_deg: float) -> bool:
        pan_deg = protocol.clamp_pan(pan_deg)
        tilt_deg = protocol.clamp_tilt(tilt_deg)
        self._serial.write(protocol.encode_move(pan_deg, tilt_deg))
        self.pan, self.tilt = pan_deg, tilt_deg
        # wait for an OK then let it settle
        deadline = time.time() + 2.0
        while time.time() < deadline:
            line = self._serial.readline().decode("ascii", "ignore")
            msg = protocol.parse_line(line)
            if msg["type"] == "OK":
                break
            if msg["type"] == "ERR":
                print(f"[serial-arm] ERR {msg.get('code')}")
                return False
        time.sleep(self.settle_s)
        return True

    def home(self) -> None:
        self._serial.write(protocol.encode_home())
        self.pan, self.tilt = 0.0, 0.0
        time.sleep(self.settle_s)

    def close(self) -> None:
        self._alive = False
        try:
            self._serial.write(protocol.encode_disable())
            self._serial.close()
        except Exception:
            pass


def make_driver():
    """Factory: SerialDriver if config.USE_ARM and a port is set, else SimDriver."""
    from shared import config

    if config.USE_ARM and config.SERIAL_PORT:
        try:
            return SerialDriver(config.SERIAL_PORT, config.SERIAL_BAUD)
        except Exception as e:  # noqa: BLE001
            print(f"[arm] serial failed ({e}); falling back to SimDriver")
    return SimDriver()
