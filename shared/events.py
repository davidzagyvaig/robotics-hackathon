"""
Events bus for DermaScout.

A single `events.jsonl` file is the contract between every service:

    capture_service.py  → appends FRAME, LESION_DETECTED, POSE_STATE, CLOTHING_STATE
    control_service.py  → appends ARM_MOVED, MACRO_CAPTURED
    voice_service.py    → appends VOICE_SAID, USER_SAID, VOICE_STATE
    dashboard           → reads (tails) the file via FastAPI WebSocket

Why JSONL not Redis/queue: it's restartable, inspectable, debuggable, and
survives any service crashing mid-scan. Open in any text editor to see what
happened. Cheap and reliable — the right hackathon trade.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Literal


EventKind = Literal[
    # capture_service
    "FRAME",                # one camera tick (rate-limited, for liveness)
    "LESION_DETECTED",      # mole candidate, with 3D coords
    "POSE_STATE",           # patient pose changed
    "CLOTHING_STATE",       # exposed-skin regions identified
    "MESH_READY",           # a .glb mesh was written to disk
    # control_service
    "ARM_MOVED",            # actuator reached pan/tilt
    "MACRO_CAPTURED",       # close-up image saved
    "ARM_FAULT",            # servo / serial fault
    # voice_service
    "VOICE_SAID",           # ElevenLabs spoke
    "USER_SAID",            # patient (or operator) replied (STT or button)
    "VOICE_STATE",          # phase changed (greeting / scanning / done)
    # session
    "SCAN_STARTED",
    "SCAN_ENDED",
    "TIER_CHANGED",         # demo failsafe ladder: 0/1/2/3
    # ad-hoc / generic
    "INFO",
    "WARN",
    "ERROR",
]


@dataclass
class Event:
    kind: EventKind
    ts: float = field(default_factory=time.time)
    source: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def to_jsonl(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":")) + "\n"

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Event":
        return cls(kind=d["kind"], ts=d.get("ts", time.time()), source=d.get("source", ""), data=d.get("data", {}))


class EventBus:
    """Append-only writer + tailing reader for events.jsonl.

    Multiple writers across processes are safe because each `emit()` is one
    line and POSIX guarantees atomic appends under 4kB.
    """

    def __init__(self, path: Path | str, source: str = "anon"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)
        self.source = source

    def emit(self, kind: EventKind, **data: Any) -> Event:
        ev = Event(kind=kind, source=self.source, data=data)
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(ev.to_jsonl())
        return ev

    def read_all(self) -> list[Event]:
        if not self.path.exists():
            return []
        out: list[Event] = []
        with open(self.path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(Event.from_dict(json.loads(line)))
                except json.JSONDecodeError:
                    continue
        return out

    def tail(self, poll_sec: float = 0.1) -> Iterable[Event]:
        """Yield events as they are appended. Blocks. Use in a background thread."""
        with open(self.path, "r", encoding="utf-8") as f:
            f.seek(0, os.SEEK_END)
            while True:
                line = f.readline()
                if not line:
                    time.sleep(poll_sec)
                    continue
                line = line.strip()
                if not line:
                    continue
                try:
                    yield Event.from_dict(json.loads(line))
                except json.JSONDecodeError:
                    continue


DEFAULT_EVENTS_PATH = Path(__file__).resolve().parent.parent / "out" / "events.jsonl"


def default_bus(source: str) -> EventBus:
    return EventBus(DEFAULT_EVENTS_PATH, source=source)
