"""
Vision kernel for DermaScout — the verified Stage 1 + Stage 2 pipeline.

Lifted and cleaned from the prototype `analyze_limb.py` that was validated on
5 real snapshots (arm / hand / face-torso / legs, 63-81% valid depth).

  foreground_mask   closest 20cm depth slab = the limb
  skin_mask         HSV skin (loose ranges for OV9782's muted color)
  limb_pose         PCA on 3D points -> centroid + principal axis + normal
  find_moles        local-contrast dark blobs within skin -> 3D coords
  pixel_to_xyz      back-project (u,v,depth) to camera-frame mm

No ML here by design — robust, fast, lighting-tolerant, runs at 30 fps.
"""

from __future__ import annotations

import cv2
import numpy as np

from shared.types import Lesion, LimbPose

# OAK-D-SR CAM_B (OV9782) approx intrinsics at 640x400, ~80 deg HFoV.
# Replace at runtime with device.readCalibration() when available.
FX = FY = 400.0
CX, CY = 320.0, 200.0


def set_intrinsics(fx: float, fy: float, cx: float, cy: float) -> None:
    global FX, FY, CX, CY
    FX, FY, CX, CY = fx, fy, cx, cy


def pixel_to_xyz(u: int, v: int, z_mm: float) -> tuple[float, float, float]:
    x = (u - CX) * z_mm / FX
    y = (v - CY) * z_mm / FY
    return float(x), float(y), float(z_mm)


def skin_mask(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, (0, 20, 50), (28, 200, 255))
    m2 = cv2.inRange(hsv, (160, 20, 50), (179, 200, 255))
    mask = cv2.bitwise_or(m1, m2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return mask


def foreground_mask(depth_mm: np.ndarray, slab_mm: float = 200.0) -> np.ndarray:
    valid = depth_mm > 0
    if not valid.any():
        return np.zeros_like(depth_mm, dtype=np.uint8)
    z_near = depth_mm[valid].min()
    return ((valid & (depth_mm < z_near + slab_mm)).astype(np.uint8)) * 255


def limb_mask(bgr: np.ndarray, depth_mm: np.ndarray) -> np.ndarray:
    """skin ∩ foreground, falling back to foreground if skin mask collapses."""
    skin = skin_mask(bgr)
    fg = foreground_mask(depth_mm)
    limb = cv2.bitwise_and(skin, fg)
    if cv2.countNonZero(limb) < 0.3 * max(cv2.countNonZero(fg), 1):
        limb = fg
    return limb


def limb_pose(depth_mm: np.ndarray, mask: np.ndarray) -> LimbPose:
    ys, xs = np.where(mask > 0)
    if len(xs) < 100:
        return LimbPose(ok=False)
    zs = depth_mm[ys, xs].astype(np.float32)
    keep = zs > 0
    xs, ys, zs = xs[keep], ys[keep], zs[keep]
    if len(xs) < 100:
        return LimbPose(ok=False)
    X = (xs - CX) * zs / FX
    Y = (ys - CY) * zs / FY
    pts = np.stack([X, Y, zs], axis=1)
    centroid = pts.mean(axis=0)
    centered = pts - centroid
    cov = (centered.T @ centered) / len(centered)
    eigvals, eigvecs = np.linalg.eigh(cov)
    order = np.argsort(eigvals)[::-1]
    axes = eigvecs[:, order]
    principal = axes[:, 0]
    normal = axes[:, 2]
    if normal[2] > 0:
        normal = -normal
    return LimbPose(
        centroid_mm=centroid.tolist(),
        principal_axis=principal.tolist(),
        surface_normal=normal.tolist(),
        px_centroid=[int(xs.mean()), int(ys.mean())],
        length_mm=float(np.sqrt(eigvals[order][0]) * 2),
        width_mm=float(np.sqrt(eigvals[order][1]) * 2),
        n_points=int(len(pts)),
        ok=True,
    )


def find_moles(bgr: np.ndarray, mask: np.ndarray, depth_mm: np.ndarray,
               min_area: int = 4, max_area: int = 400) -> list[Lesion]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    skin_only = cv2.bitwise_and(gray, gray, mask=mask)
    if skin_only.max() == 0:
        return []
    bg = cv2.medianBlur(skin_only, 31)
    diff = bg.astype(np.int16) - gray.astype(np.int16)
    diff[mask == 0] = 0
    pos = diff[mask > 0]
    if len(pos) == 0:
        return []
    thr = max(15, int(pos.mean() + 1.5 * pos.std()))
    dark = (diff > thr).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    nb, _, stats, centroids = cv2.connectedComponentsWithStats(dark, connectivity=8)
    out: list[Lesion] = []
    h, w = depth_mm.shape
    n = 0
    for i in range(1, nb):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area or area > max_area:
            continue
        cx, cy = centroids[i]
        u, v = int(round(cx)), int(round(cy))
        if not (0 <= v < h and 0 <= u < w):
            continue
        z = float(depth_mm[v, u])
        if z <= 0:
            patch = depth_mm[max(0, v - 2): v + 3, max(0, u - 2): u + 3]
            valid = patch[patch > 0]
            if len(valid) == 0:
                continue
            z = float(np.median(valid))
        x, y, z = pixel_to_xyz(u, v, z)
        n += 1
        out.append(Lesion(id=f"L{n:03d}", u=u, v=v, x_mm=round(x, 1),
                          y_mm=round(y, 1), z_mm=round(z, 1), area_px=area))
    return out


def colorize_depth(depth_mm: np.ndarray, near: int = 200, far: int = 1200) -> np.ndarray:
    d = depth_mm.astype(np.float32)
    d[d == 0] = far
    d = np.clip(d, near, far)
    d = ((d - near) / (far - near) * 255).astype(np.uint8)
    return cv2.applyColorMap(255 - d, cv2.COLORMAP_TURBO)


def annotate(bgr: np.ndarray, mask: np.ndarray, pose: LimbPose,
             moles: list[Lesion]) -> np.ndarray:
    out = bgr.copy()
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(out, contours, -1, (0, 255, 0), 1)
    if pose.ok:
        px, py = pose.px_centroid
        ax = np.array(pose.principal_axis[:2])
        ax = ax / (np.linalg.norm(ax) + 1e-6)
        cv2.arrowedLine(out, (px, py), (int(px + ax[0] * 80), int(py + ax[1] * 80)),
                        (0, 255, 255), 2, tipLength=0.2)
        cv2.circle(out, (px, py), 4, (0, 255, 255), -1)
    for m in moles:
        cv2.circle(out, (m.u, m.v), 8, (0, 0, 255), 2)
        cv2.putText(out, m.id, (m.u + 10, m.v + 4), cv2.FONT_HERSHEY_SIMPLEX,
                    0.35, (0, 0, 255), 1)
    return out
