"""
Macro camera capture (the close-up imager).

Hardware plan: a cheap USB borescope/endoscope (UVC, ~25-40mm working distance)
bought at a Budapest electronics store Thursday morning. Any UVC device that
cv2.VideoCapture can open works. Falls back to a synthetic crop in sim.
"""

from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np


class MacroCamera:
    def __init__(self, index: int = 1):
        self.index = index
        self.cap = None
        try:
            self.cap = cv2.VideoCapture(index)
            if not self.cap.isOpened():
                self.cap = None
        except Exception:
            self.cap = None
        if self.cap is None:
            print(f"[macro] no UVC device at index {index}; using synthetic crops")

    @property
    def available(self) -> bool:
        return self.cap is not None

    def capture(self, out_path: Path, fallback_bgr: np.ndarray | None = None) -> str:
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if self.available:
            for _ in range(5):  # let autofocus/exposure settle
                self.cap.read()
                time.sleep(0.05)
            ok, frame = self.cap.read()
            if ok:
                cv2.imwrite(str(out_path), frame)
                return str(out_path)
        # synthetic fallback: a zoomed crop of whatever we were given
        if fallback_bgr is not None:
            h, w = fallback_bgr.shape[:2]
            cy, cx = h // 2, w // 2
            r = min(h, w) // 6
            crop = fallback_bgr[max(0, cy - r):cy + r, max(0, cx - r):cx + r]
            crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_CUBIC)
            cv2.imwrite(str(out_path), crop)
            return str(out_path)
        # last resort: gray placeholder
        cv2.imwrite(str(out_path), np.full((256, 256, 3), 127, np.uint8))
        return str(out_path)

    def close(self) -> None:
        if self.cap is not None:
            self.cap.release()
