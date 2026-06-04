"""
Patient pose + clothing detection — runs on the SAME OAK RGB stream (no 3rd camera).

  PoseEstimator   MediaPipe Pose (33 landmarks) -> "arm raised", torso yaw
  ClothingMap     SegFormer clothes parsing -> which regions are exposed skin

Both degrade gracefully: if a model is unavailable, they return a permissive
default and log it, so the demo never hard-crashes on a missing dependency.
Models are lazy-loaded so importing this module is cheap.
"""

from __future__ import annotations

import numpy as np

from shared.types import ClothingState


# ----------------------------- Pose ----------------------------------------
class PoseEstimator:
    def __init__(self) -> None:
        self._mp = None
        self._pose = None
        try:
            import mediapipe as mp

            self._mp = mp
            self._pose = mp.solutions.pose.Pose(
                static_image_mode=False, model_complexity=1,
                min_detection_confidence=0.5, min_tracking_confidence=0.5,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[pose] MediaPipe unavailable ({e}); pose disabled")

    @property
    def available(self) -> bool:
        return self._pose is not None

    def estimate(self, bgr: np.ndarray) -> dict:
        """Returns {'detected', 'left_arm_raised', 'right_arm_raised', 'torso_yaw_deg'}."""
        if not self.available:
            return {"detected": False}
        import cv2

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        res = self._pose.process(rgb)
        if not res.pose_landmarks:
            return {"detected": False}
        lm = res.pose_landmarks.landmark
        P = self._mp.solutions.pose.PoseLandmark

        def y(idx):  # normalized; smaller y = higher in frame
            return lm[idx].y

        left_arm_raised = y(P.LEFT_WRIST) < y(P.LEFT_SHOULDER)
        right_arm_raised = y(P.RIGHT_WRIST) < y(P.RIGHT_SHOULDER)
        # crude torso yaw from shoulder x-separation vs hip separation
        sh_dx = lm[P.LEFT_SHOULDER].x - lm[P.RIGHT_SHOULDER].x
        torso_yaw = float(np.degrees(np.arctan2(0.0, sh_dx)) if sh_dx else 0.0)
        return {
            "detected": True,
            "left_arm_raised": bool(left_arm_raised),
            "right_arm_raised": bool(right_arm_raised),
            "shoulder_sep": float(abs(sh_dx)),
            "torso_yaw_deg": torso_yaw,
        }


# --------------------------- Clothing --------------------------------------
# SegFormer ATR label map (mattmdjaga/segformer_b2_clothes)
SEGFORMER_LABELS = {
    0: "background", 1: "hat", 2: "hair", 3: "sunglasses", 4: "upper-clothes",
    5: "skirt", 6: "pants", 7: "dress", 8: "belt", 9: "left-shoe",
    10: "right-shoe", 11: "face", 12: "left-leg", 13: "right-leg",
    14: "left-arm", 15: "right-arm", 16: "bag", 17: "scarf",
}
EXPOSED_LABELS = {"face", "left-leg", "right-leg", "left-arm", "right-arm"}
COVER_LABELS = {"upper-clothes", "skirt", "pants", "dress", "scarf"}


class ClothingMap:
    def __init__(self, model_id: str = "mattmdjaga/segformer_b2_clothes",
                 device: str = "") -> None:
        self._proc = None
        self._model = None
        self._device = device
        try:
            import torch
            from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

            self._torch = torch
            if not device:
                self._device = "mps" if torch.backends.mps.is_available() else "cpu"
            self._proc = SegformerImageProcessor.from_pretrained(model_id)
            self._model = AutoModelForSemanticSegmentation.from_pretrained(model_id).to(self._device)
            self._model.eval()
        except Exception as e:  # noqa: BLE001
            print(f"[clothing] SegFormer unavailable ({e}); clothing detection disabled")

    @property
    def available(self) -> bool:
        return self._model is not None

    def parse(self, bgr: np.ndarray) -> np.ndarray | None:
        """Return a HxW label map, or None if unavailable."""
        if not self.available:
            return None
        import cv2
        from PIL import Image

        img = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        inputs = self._proc(images=img, return_tensors="pt").to(self._device)
        with self._torch.no_grad():
            logits = self._model(**inputs).logits
        upsampled = self._torch.nn.functional.interpolate(
            logits, size=bgr.shape[:2], mode="bilinear", align_corners=False
        )
        return upsampled.argmax(dim=1)[0].cpu().numpy()

    def state(self, bgr: np.ndarray, min_ratio: float = 0.01) -> ClothingState:
        labels = self.parse(bgr)
        if labels is None:
            # permissive fallback: assume arms exposed (safe default for demo)
            return ClothingState(left_arm_scannable=True, right_arm_scannable=True,
                                  note="clothing model unavailable; assuming arms exposed")
        total = labels.size
        present = {SEGFORMER_LABELS.get(int(i), str(i)): (labels == i).sum() / total
                   for i in np.unique(labels)}
        def has(lbl):
            return present.get(lbl, 0) > min_ratio
        st = ClothingState(
            left_arm_scannable=has("left-arm"),
            right_arm_scannable=has("right-arm"),
            legs_scannable=has("left-leg") or has("right-leg"),
            torso_scannable=not (has("upper-clothes") or has("dress")),
            face_scannable=has("face"),
        )
        covered = [l for l in COVER_LABELS if has(l)]
        st.note = "covered: " + ", ".join(covered) if covered else "mostly exposed"
        return st
