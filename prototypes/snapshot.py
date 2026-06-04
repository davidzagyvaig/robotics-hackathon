"""
Snapshot persistence for DermaScout.

Each snapshot is its own folder under out/snapshots/:

    snap_001_2026-06-04T00-18-32_arm/
        rgb.png         — raw RGB frame
        depth_vis.png   — colorized depth (turbo colormap)
        depth.npy       — raw uint16 depth in mm
        cloud.ply       — XYZ point cloud (mm, camera frame)
        preview.png     — single side-by-side RGB|depth, for quick reading
        info.json       — all metadata + stats

A flat out/snapshots/index.json keeps a list of every snap with key stats so
analysis tools can read one file instead of crawling all folders.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np


SNAPSHOT_DIR_NAME = "snapshots"


def _slug(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:32]


def colorize_depth(depth_mm: np.ndarray, near: int = 200, far: int = 1200) -> np.ndarray:
    d = depth_mm.astype(np.float32)
    d[d == 0] = far
    d = np.clip(d, near, far)
    d = ((d - near) / (far - near) * 255).astype(np.uint8)
    return cv2.applyColorMap(255 - d, cv2.COLORMAP_TURBO)


def _make_preview(rgb: np.ndarray, depth_vis: np.ndarray, info: dict) -> np.ndarray:
    """Side-by-side RGB|depth with a stats banner — for fast visual reading."""
    h = max(rgb.shape[0], depth_vis.shape[0])

    def fit(img):
        if img.shape[0] != h:
            return cv2.resize(img, (int(img.shape[1] * h / img.shape[0]), h))
        return img

    composed = np.hstack([fit(rgb), fit(depth_vis)])
    banner_h = 50
    banner = np.full((banner_h, composed.shape[1], 3), 30, dtype=np.uint8)
    canvas = np.vstack([banner, composed])
    label = info.get("label") or "(unlabeled)"
    d = info["depth"]
    pc = info["point_cloud"]
    line1 = f"{info['id']}  |  {label}  |  {info['timestamp']}"
    line2 = (
        f"depth: {d['valid_pct']:.1f}% valid   "
        f"{d['min_mm']}-{d['p95_mm']}mm p95   median {d['median_mm']}mm   "
        f"pts {pc['n_points']:,}"
    )
    cv2.putText(canvas, line1, (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)
    cv2.putText(canvas, line2, (12, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 220, 180), 1)
    return canvas


def next_snap_id(snapshots_dir: Path) -> int:
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    existing = [p.name for p in snapshots_dir.iterdir() if p.is_dir() and p.name.startswith("snap_")]
    ns = []
    for name in existing:
        m = re.match(r"snap_(\d+)", name)
        if m:
            ns.append(int(m.group(1)))
    return (max(ns) if ns else 0) + 1


def save_snapshot(
    rgb: np.ndarray,
    depth_mm: np.ndarray,
    point_cloud: np.ndarray,
    out_root: Path,
    label: str = "",
    device_id: str | None = None,
) -> dict:
    """Persist a snapshot. Returns the info dict that was written to info.json."""
    out_root = Path(out_root)
    snaps_dir = out_root / SNAPSHOT_DIR_NAME
    snap_n = next_snap_id(snaps_dir)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    slug = _slug(label)
    folder_name = f"snap_{snap_n:03d}_{ts}" + (f"_{slug}" if slug else "")
    snap_dir = snaps_dir / folder_name
    snap_dir.mkdir(parents=True, exist_ok=True)

    valid_mask = depth_mm > 0
    if valid_mask.any():
        valid_depths = depth_mm[valid_mask]
        d_stats = {
            "valid_pct": float(valid_mask.mean() * 100),
            "min_mm": int(valid_depths.min()),
            "median_mm": int(np.median(valid_depths)),
            "p95_mm": int(np.percentile(valid_depths, 95)),
            "max_mm": int(valid_depths.max()),
            "in_sweet_spot_pct": float(((depth_mm >= 200) & (depth_mm <= 1000)).mean() * 100),
        }
    else:
        d_stats = {"valid_pct": 0.0, "min_mm": 0, "median_mm": 0, "p95_mm": 0, "max_mm": 0, "in_sweet_spot_pct": 0.0}

    if len(point_cloud) > 0:
        pts = point_cloud[~np.isnan(point_cloud).any(axis=1)]
        pts = pts[(pts != 0).any(axis=1)]
    else:
        pts = np.zeros((0, 3), dtype=np.float32)
    if len(pts):
        bbox = {
            "x": [float(pts[:, 0].min()), float(pts[:, 0].max())],
            "y": [float(pts[:, 1].min()), float(pts[:, 1].max())],
            "z": [float(pts[:, 2].min()), float(pts[:, 2].max())],
        }
    else:
        bbox = {"x": [0, 0], "y": [0, 0], "z": [0, 0]}

    info = {
        "id": f"snap_{snap_n:03d}",
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "label": label or "",
        "folder": folder_name,
        "camera": {
            "device_id": device_id or "",
            "rgb_shape": list(rgb.shape),
            "depth_shape": list(depth_mm.shape),
            "depth_align": "CAM_B",
        },
        "depth": d_stats,
        "point_cloud": {"n_points": int(len(pts)), "bbox_mm": bbox},
        "files": {
            "rgb": "rgb.png",
            "depth_vis": "depth_vis.png",
            "depth_mm": "depth.npy",
            "cloud_ply": "cloud.ply",
            "preview": "preview.png",
        },
    }

    cv2.imwrite(str(snap_dir / "rgb.png"), rgb)
    depth_vis = colorize_depth(depth_mm)
    cv2.imwrite(str(snap_dir / "depth_vis.png"), depth_vis)
    np.save(snap_dir / "depth.npy", depth_mm)

    if len(pts):
        with open(snap_dir / "cloud.ply", "w") as f:
            f.write("ply\nformat ascii 1.0\n")
            f.write(f"element vertex {len(pts)}\n")
            f.write("property float x\nproperty float y\nproperty float z\nend_header\n")
            np.savetxt(f, pts, fmt="%.3f")
    else:
        (snap_dir / "cloud.ply").write_text("ply\nformat ascii 1.0\nelement vertex 0\nend_header\n")

    preview = _make_preview(rgb, depth_vis, info)
    cv2.imwrite(str(snap_dir / "preview.png"), preview)
    (snap_dir / "info.json").write_text(json.dumps(info, indent=2))

    _update_index(snaps_dir, info)
    return info


def _update_index(snaps_dir: Path, info: dict) -> None:
    index_path = snaps_dir / "index.json"
    if index_path.exists():
        try:
            data = json.loads(index_path.read_text())
        except Exception:
            data = {"snapshots": []}
    else:
        data = {"snapshots": []}

    entry = {
        "id": info["id"],
        "folder": info["folder"],
        "timestamp": info["timestamp"],
        "label": info["label"],
        "valid_pct": round(info["depth"]["valid_pct"], 1),
        "median_mm": info["depth"]["median_mm"],
        "in_sweet_spot_pct": round(info["depth"]["in_sweet_spot_pct"], 1),
        "n_points": info["point_cloud"]["n_points"],
    }
    data["snapshots"] = [s for s in data.get("snapshots", []) if s["id"] != entry["id"]]
    data["snapshots"].append(entry)
    data["snapshots"].sort(key=lambda s: s["id"])
    data["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    index_path.write_text(json.dumps(data, indent=2))
