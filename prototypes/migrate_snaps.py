"""
One-shot: move old flat snap_NN_*.png/npy/ply files under out/
into the new out/snapshots/snap_NNN_<ts>_<label>/ folder structure.
"""

from pathlib import Path

import cv2
import numpy as np

from snapshot import save_snapshot

OUT = Path(__file__).parent / "out"

LEGACY_LABELS = {
    1: "arm-close",
    2: "hand-spread",
    3: "arm-extended",
    4: "face-torso",
    5: "legs",
}


def main():
    flat_rgb = sorted(OUT.glob("snap_*_rgb.png"))
    if not flat_rgb:
        print("No legacy flat snapshots to migrate.")
        return

    migrated = []
    for rgb_path in flat_rgb:
        stem = rgb_path.name.replace("_rgb.png", "")
        try:
            idx = int(stem.split("_")[1])
        except (IndexError, ValueError):
            continue

        depth_npy = OUT / f"{stem}_depth_mm.npy"
        cloud_ply = OUT / f"{stem}_cloud.ply"
        if not depth_npy.exists():
            print(f"  skip {stem}: missing depth")
            continue

        rgb = cv2.imread(str(rgb_path))
        depth = np.load(depth_npy)
        if cloud_ply.exists():
            with open(cloud_ply) as f:
                lines = f.readlines()
            data_start = next(
                (i + 1 for i, ln in enumerate(lines) if ln.strip() == "end_header"), 0
            )
            try:
                pts = np.array(
                    [list(map(float, ln.split())) for ln in lines[data_start:] if ln.strip()],
                    dtype=np.float32,
                )
            except Exception:
                pts = np.zeros((0, 3), dtype=np.float32)
        else:
            pts = np.zeros((0, 3), dtype=np.float32)

        info = save_snapshot(
            rgb=rgb,
            depth_mm=depth,
            point_cloud=pts,
            out_root=OUT,
            label=LEGACY_LABELS.get(idx, f"legacy-{idx}"),
            device_id="19443010E1E2775A00",
        )
        migrated.append(info)
        print(f"  migrated {stem}  →  {info['folder']}  ({info['point_cloud']['n_points']:,} pts)")

    print(f"\nMigrated {len(migrated)} snapshots into out/snapshots/.")
    print("Old flat files left in place. Delete them with:")
    print("  rm out/snap_*_rgb.png out/snap_*_depth_*.* out/snap_*_cloud.ply")


if __name__ == "__main__":
    main()
