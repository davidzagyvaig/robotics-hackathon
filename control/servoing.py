"""
Visual servoing: turn a lesion target into pan/tilt commands.

Two layers, per the architecture decision:
  1. Feed-forward: an empirical pixel->servo map jumps the head close.
  2. P-control: closes the residual pixel error in the lesion's own frame.

For the hackathon we use a simple linear pixel->degree gain (the "30-min
empirical calibration"): jog the head, see how many pixels a target moves per
degree, fit a scalar. ONE moving camera => error lives in its own frame, no
hand-eye transforms.
"""

from __future__ import annotations

from dataclasses import dataclass

from shared import config


@dataclass
class ServoMap:
    """Linear pixel-error -> degree map. Calibrate the gains on day one."""

    deg_per_px_pan: float = 0.06    # ~ (HFoV/width). 80deg/640px ~ 0.125; halved for stability
    deg_per_px_tilt: float = 0.06
    invert_pan: bool = False
    invert_tilt: bool = True
    deadband_px: int = 12

    def error_to_delta(self, err_x: float, err_y: float) -> tuple[float, float]:
        if abs(err_x) < self.deadband_px:
            err_x = 0.0
        if abs(err_y) < self.deadband_px:
            err_y = 0.0
        dpan = err_x * self.deg_per_px_pan * (-1 if self.invert_pan else 1)
        dtilt = err_y * self.deg_per_px_tilt * (-1 if self.invert_tilt else 1)
        return dpan, dtilt


def lesion_to_pan_tilt(u: int, v: int, frame_w: int | None = None,
                       frame_h: int | None = None, smap: ServoMap | None = None) -> tuple[float, float]:
    """Feed-forward absolute pan/tilt to center pixel (u,v). Head assumed at home."""
    fw = frame_w or config.CAM_W
    fh = frame_h or config.CAM_H
    smap = smap or ServoMap()
    err_x = u - fw / 2
    err_y = v - fh / 2
    dpan, dtilt = smap.error_to_delta(err_x, err_y)
    return dpan, dtilt
