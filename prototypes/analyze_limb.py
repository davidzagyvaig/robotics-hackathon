"""
DermaScout — Stage 1 + Stage 2 prototype on an existing snapshot.

Given out/snapshots/<snap_dir>/, this script:

  1. SEGMENTS the limb (closest 20 cm slab of depth, intersected with HSV skin mask).
  2. Computes the limb's PRINCIPAL AXIS (PCA on the 3D points) — direction the arm extends.
  3. Computes the limb's SURFACE NORMAL at the centroid (plane fit on local patch).
  4. DETECTS dark mole candidates inside the skin mask (local-contrast threshold).
  5. TRIANGULATES each candidate's pixel position to a 3D (x,y,z) mm coordinate.
  6. Renders an annotated overview (RGB + depth, with limb axis arrow + mole pins).

Writes results to out/analysis/<snap_id>/ :
  overview.png   side-by-side annotated visualization
  limb.json      centroid, axis, normal, dims (mm)
  moles.json     list of {id, pixel_uv, xyz_mm, area_px, contrast}

This proves the full closed-loop targeting pipeline without any robot hardware.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).parent / "out"
SNAPS = OUT / "snapshots"
ANALYSIS = OUT / "analysis"

# Camera intrinsics for OAK-D-SR CAM_B at 640x400 (OV9782, ~80° HFoV).
# Good enough for visualization; replace with device.readCalibration() at runtime.
INTRINSICS = {"fx": 400.0, "fy": 400.0, "cx": 320.0, "cy": 200.0}


def pixel_to_xyz(u: int, v: int, z_mm: float) -> tuple[float, float, float]:
    fx, fy, cx, cy = INTRINSICS["fx"], INTRINSICS["fy"], INTRINSICS["cx"], INTRINSICS["cy"]
    x = (u - cx) * z_mm / fx
    y = (v - cy) * z_mm / fy
    return float(x), float(y), float(z_mm)


def skin_mask(bgr: np.ndarray) -> np.ndarray:
    """HSV-based skin mask. OV9782 colour is muted, so ranges are loose."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, (0, 20, 50), (28, 200, 255))
    m2 = cv2.inRange(hsv, (160, 20, 50), (179, 200, 255))
    mask = cv2.bitwise_or(m1, m2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return mask


def foreground_mask(depth_mm: np.ndarray, slab_mm: float = 200.0) -> np.ndarray:
    """Closest 20cm slab from the nearest valid pixel — the limb."""
    valid = depth_mm > 0
    if not valid.any():
        return np.zeros_like(depth_mm, dtype=np.uint8)
    z_near = depth_mm[valid].min()
    mask = valid & (depth_mm < z_near + slab_mm)
    return (mask.astype(np.uint8)) * 255


def limb_pose(depth_mm: np.ndarray, fg_mask: np.ndarray) -> dict:
    """PCA on the foreground 3D points → centroid + axes + bbox."""
    ys, xs = np.where(fg_mask > 0)
    if len(xs) < 100:
        return {"ok": False, "reason": "foreground too small"}
    zs = depth_mm[ys, xs].astype(np.float32)
    fx, fy, cx, cy = INTRINSICS["fx"], INTRINSICS["fy"], INTRINSICS["cx"], INTRINSICS["cy"]
    X = (xs - cx) * zs / fx
    Y = (ys - cy) * zs / fy
    Z = zs
    pts = np.stack([X, Y, Z], axis=1)  # (N, 3) in mm

    centroid = pts.mean(axis=0)
    centered = pts - centroid
    cov = (centered.T @ centered) / len(centered)
    eigvals, eigvecs = np.linalg.eigh(cov)
    # Principal axis = eigvec with largest eigenvalue (limb extension direction)
    order = np.argsort(eigvals)[::-1]
    axes = eigvecs[:, order]
    principal_axis = axes[:, 0]
    # Surface normal = smallest eigvec (least variance)
    normal = axes[:, 2]
    # Make normal point toward camera (negative Z)
    if normal[2] > 0:
        normal = -normal

    # Find a centroid pixel for arrow drawing
    px_centroid = (int(xs.mean()), int(ys.mean()))

    return {
        "ok": True,
        "centroid_mm": centroid.tolist(),
        "principal_axis": principal_axis.tolist(),
        "surface_normal": normal.tolist(),
        "eigenvalues_mm2": eigvals[order].tolist(),
        "px_centroid": list(px_centroid),
        "n_points": int(len(pts)),
        "extent_mm": {
            "along_axis": float(np.sqrt(eigvals[order][0]) * 2),
            "across": float(np.sqrt(eigvals[order][1]) * 2),
            "thickness": float(np.sqrt(eigvals[order][2]) * 2),
        },
    }


def find_moles(bgr: np.ndarray, skin: np.ndarray, depth_mm: np.ndarray) -> list[dict]:
    """Local-contrast dark blob detection within the skin mask."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    skin_only = cv2.bitwise_and(gray, gray, mask=skin)
    if skin_only.max() == 0:
        return []

    # Local background = large median blur
    bg = cv2.medianBlur(skin_only, 31)
    diff = bg.astype(np.int16) - gray.astype(np.int16)  # positive where pixel is darker than local bg
    diff[skin == 0] = 0

    # Threshold = mean + 1.5*std of positive diff inside skin
    pos = diff[skin > 0]
    if len(pos) == 0:
        return []
    thr = max(15, int(pos.mean() + 1.5 * pos.std()))
    dark = (diff > thr).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

    nb, labels, stats, centroids = cv2.connectedComponentsWithStats(dark, connectivity=8)
    moles = []
    for i in range(1, nb):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 4 or area > 400:  # filter trivially small + suspiciously large
            continue
        cx, cy = centroids[i]
        u, v = int(round(cx)), int(round(cy))
        if v < 0 or v >= depth_mm.shape[0] or u < 0 or u >= depth_mm.shape[1]:
            continue
        z = float(depth_mm[v, u])
        if z <= 0:
            # Fall back to median depth in a 5x5 neighbourhood
            patch = depth_mm[max(0, v - 2): v + 3, max(0, u - 2): u + 3]
            valid = patch[patch > 0]
            if len(valid) == 0:
                continue
            z = float(np.median(valid))
        xyz = pixel_to_xyz(u, v, z)
        moles.append({
            "id": f"m{i:03d}",
            "uv": [u, v],
            "xyz_mm": [round(c, 1) for c in xyz],
            "area_px": area,
            "z_mm": round(z, 1),
        })
    return moles


def draw_overview(rgb: np.ndarray, depth_vis: np.ndarray, skin: np.ndarray, fg_mask: np.ndarray,
                  pose: dict, moles: list[dict]) -> np.ndarray:
    """Side-by-side: RGB (annotated) | Depth (annotated) with limb arrow + mole pins."""
    rgb_ann = rgb.copy()
    depth_ann = depth_vis.copy()

    # 1) limb mask outline in green on RGB
    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(rgb_ann, contours, -1, (0, 255, 0), 1)

    # 2) limb principal-axis arrow projected to image plane
    if pose.get("ok"):
        px, py = pose["px_centroid"]
        axis = np.array(pose["principal_axis"])
        normal = np.array(pose["surface_normal"])
        L = 80  # px
        ax_2d = axis[:2] / (np.linalg.norm(axis[:2]) + 1e-6)
        nm_2d = normal[:2] / (np.linalg.norm(normal[:2]) + 1e-6)
        cv2.arrowedLine(rgb_ann, (px, py), (int(px + ax_2d[0] * L), int(py + ax_2d[1] * L)),
                        (0, 255, 255), 2, tipLength=0.2)
        cv2.arrowedLine(rgb_ann, (px, py), (int(px + nm_2d[0] * L * 0.6), int(py + nm_2d[1] * L * 0.6)),
                        (255, 0, 255), 2, tipLength=0.3)
        cv2.circle(rgb_ann, (px, py), 4, (0, 255, 255), -1)
        cv2.putText(rgb_ann, "limb axis", (px + 6, py - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        cv2.putText(rgb_ann, "scan normal", (px + 6, py + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 255), 1)

    # 3) mole pins on both panes
    for m in moles:
        u, v = m["uv"]
        cv2.circle(rgb_ann, (u, v), 8, (0, 0, 255), 2)
        cv2.circle(depth_ann, (u, v), 8, (255, 255, 255), 2)
        x, y, z = m["xyz_mm"]
        label = f"{m['id']}  z={int(z)}mm"
        cv2.putText(rgb_ann, label, (u + 10, v + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1)

    # 4) compose
    canvas = np.hstack([rgb_ann, depth_ann])
    banner_h = 70
    banner = np.full((banner_h, canvas.shape[1], 3), 24, dtype=np.uint8)
    out = np.vstack([banner, canvas])
    line1 = f"Stage 1+2 prototype  |  {len(moles)} mole candidates detected"
    if pose.get("ok"):
        c = pose["centroid_mm"]
        line2 = (
            f"limb centroid: ({c[0]:+.0f}, {c[1]:+.0f}, {c[2]:.0f}) mm   "
            f"length~{pose['extent_mm']['along_axis']:.0f}mm  "
            f"width~{pose['extent_mm']['across']:.0f}mm"
        )
    else:
        line2 = "limb: not detected"
    cv2.putText(out, line1, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (230, 230, 230), 1)
    cv2.putText(out, line2, (12, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 220, 180), 1)
    return out


def process_snapshot(snap_dir: Path) -> dict:
    info = json.loads((snap_dir / "info.json").read_text())
    rgb = cv2.imread(str(snap_dir / "rgb.png"))
    depth = np.load(snap_dir / "depth.npy")
    depth_vis = cv2.imread(str(snap_dir / "depth_vis.png"))

    if rgb.shape[:2] != depth.shape:
        rgb = cv2.resize(rgb, (depth.shape[1], depth.shape[0]))

    skin = skin_mask(rgb)
    fg = foreground_mask(depth)
    # Final limb mask = skin ∩ foreground (skin pixels close to camera)
    limb = cv2.bitwise_and(skin, fg)
    # If skin mask collapses (OAK colours odd), fall back to foreground only
    if cv2.countNonZero(limb) < 0.3 * cv2.countNonZero(fg):
        limb = fg

    pose = limb_pose(depth, limb)
    moles = find_moles(rgb, limb, depth)

    out_dir = ANALYSIS / info["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    overview = draw_overview(rgb, depth_vis, skin, limb, pose, moles)
    cv2.imwrite(str(out_dir / "overview.png"), overview)
    cv2.imwrite(str(out_dir / "limb_mask.png"), limb)
    (out_dir / "limb.json").write_text(json.dumps(pose, indent=2))
    (out_dir / "moles.json").write_text(json.dumps(moles, indent=2))

    return {
        "snap_id": info["id"],
        "label": info["label"],
        "limb_ok": pose.get("ok", False),
        "n_moles": len(moles),
        "out_dir": str(out_dir.relative_to(OUT.parent)),
    }


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else None
    if not SNAPS.exists():
        print("No snapshots yet.")
        return
    index = json.loads((SNAPS / "index.json").read_text())
    chosen = []
    for entry in index["snapshots"]:
        if targets and entry["id"] not in targets:
            continue
        snap_dir = SNAPS / entry["folder"]
        chosen.append(snap_dir)

    print(f"Processing {len(chosen)} snapshots …\n")
    results = []
    for d in chosen:
        try:
            res = process_snapshot(d)
            results.append(res)
            print(f"  {res['snap_id']:<10} {res['label']:<16}  "
                  f"limb={'OK' if res['limb_ok'] else 'fail'}  moles={res['n_moles']}")
        except Exception as e:
            print(f"  {d.name}: FAILED ({e})")

    (ANALYSIS / "limb_analysis_summary.json").write_text(json.dumps(results, indent=2))
    print(f"\nWrote per-snap results to out/analysis/<snap_id>/")


if __name__ == "__main__":
    main()
