"""Shared dataclasses passed between services and serialized into events / DB."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Lesion:
    """A detected skin mark with its 3D body-relative coordinate."""

    id: str                       # e.g. "L001"
    u: int                        # pixel x in locator frame
    v: int                        # pixel y in locator frame
    x_mm: float                   # 3D coords in camera frame (mm)
    y_mm: float
    z_mm: float
    area_px: int = 0
    region: str = "unknown"       # left_arm, right_arm, torso, leg, ...
    # triage outputs (filled later in the pipeline)
    abcd_tds: Optional[float] = None
    classifier_label: Optional[str] = None
    classifier_score: Optional[float] = None
    flag: bool = False            # surfaced for clinician review
    explanation: str = ""
    macro_image: str = ""         # path to close-up if captured
    # longitudinal
    session_id: str = ""
    matched_prior_id: Optional[str] = None
    delta_area_pct: Optional[float] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class LimbPose:
    """Output of PCA on the foreground point cloud — where/how to aim."""

    centroid_mm: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    principal_axis: list[float] = field(default_factory=lambda: [1.0, 0.0, 0.0])
    surface_normal: list[float] = field(default_factory=lambda: [0.0, 0.0, -1.0])
    px_centroid: list[int] = field(default_factory=lambda: [0, 0])
    length_mm: float = 0.0
    width_mm: float = 0.0
    n_points: int = 0
    ok: bool = False


@dataclass
class ClothingState:
    """Which body regions are exposed skin vs covered, for the voice + scan gating."""

    left_arm_scannable: bool = False
    right_arm_scannable: bool = False
    legs_scannable: bool = False
    torso_scannable: bool = False
    face_scannable: bool = False
    note: str = ""

    def exposed_regions(self) -> list[str]:
        out = []
        if self.left_arm_scannable:
            out.append("left arm")
        if self.right_arm_scannable:
            out.append("right arm")
        if self.legs_scannable:
            out.append("legs")
        if self.torso_scannable:
            out.append("torso")
        if self.face_scannable:
            out.append("face and neck")
        return out
