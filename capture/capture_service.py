"""
Capture service — the locator pipeline.

Modes:
  --live   drive the OAK-D-SR (depthai v3), run vision every frame
  --sim    replay the recorded snapshots in out/snapshots (no hardware needed)

Emits to events.jsonl:
  SCAN_STARTED, FRAME, POSE_STATE, CLOTHING_STATE, LESION_DETECTED, MESH_READY, SCAN_ENDED

Run:
  python -m capture.capture_service --sim
  python -m capture.capture_service --live
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# allow running as `python -m capture.capture_service` from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared import config  # noqa: E402
from shared.events import default_bus  # noqa: E402
from shared.lesions import LesionDB  # noqa: E402
from capture import vision  # noqa: E402

BUS = default_bus("capture")


def _emit_results(session_id: str, bgr, depth, db: LesionDB, frame_idx: int) -> int:
    mask = vision.limb_mask(bgr, depth)
    pose = vision.limb_pose(depth, mask)
    moles = vision.find_moles(bgr, mask, depth)
    valid_pct = float((depth > 0).mean() * 100)
    BUS.emit("FRAME", frame=frame_idx, valid_pct=round(valid_pct, 1),
             limb_ok=pose.ok, n_moles=len(moles))
    if pose.ok:
        BUS.emit("POSE_STATE", centroid_mm=pose.centroid_mm,
                 length_mm=round(pose.length_mm, 1), width_mm=round(pose.width_mm, 1),
                 normal=pose.surface_normal)
    for m in moles:
        m.session_id = session_id
        # namespace lesion ids by frame so multi-frame sessions don't collide
        if frame_idx > 0:
            m.id = f"F{frame_idx:02d}_{m.id}"
        db.upsert_lesion(m)
        BUS.emit("LESION_DETECTED", id=m.id, u=m.u, v=m.v,
                 xyz_mm=[m.x_mm, m.y_mm, m.z_mm], area_px=m.area_px)
    return len(moles)


def run_sim(loop: bool = False) -> None:
    db = LesionDB(config.LESION_DB)
    snaps = sorted([p for p in config.SNAPSHOTS.iterdir() if p.is_dir()])
    if not snaps:
        print("No snapshots to replay. Run the OAK app first.")
        return
    session_id = f"sim_{int(time.time())}"
    db.start_session(session_id, patient="sim", note="snapshot replay")
    BUS.emit("SCAN_STARTED", session_id=session_id, mode="sim")
    print(f"[capture/sim] session {session_id}, replaying {len(snaps)} snapshots")
    frame_idx = 0
    while True:
        for snap in snaps:
            rgb_p, depth_p = snap / "rgb.png", snap / "depth.npy"
            if not (rgb_p.exists() and depth_p.exists()):
                continue
            bgr = cv2.imread(str(rgb_p))
            depth = np.load(depth_p)
            if bgr.shape[:2] != depth.shape:
                bgr = cv2.resize(bgr, (depth.shape[1], depth.shape[0]))
            n = _emit_results(session_id, bgr, depth, db, frame_idx)
            print(f"  {snap.name}: {n} lesions")
            frame_idx += 1
            time.sleep(0.5)
        if not loop:
            break
    db.end_session(session_id)
    BUS.emit("SCAN_ENDED", session_id=session_id, frames=frame_idx)
    print(f"[capture/sim] done. {frame_idx} frames -> {config.EVENTS_PATH}")


def run_live() -> None:
    import depthai as dai

    db = LesionDB(config.LESION_DB)
    session_id = f"live_{int(time.time())}"
    db.start_session(session_id, patient="live")
    BUS.emit("SCAN_STARTED", session_id=session_id, mode="live")

    W, H, FPS = config.CAM_W, config.CAM_H, config.CAM_FPS
    with dai.Pipeline() as pipeline:
        left = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_B)
        right = pipeline.create(dai.node.Camera).build(dai.CameraBoardSocket.CAM_C)
        rgb_out = left.requestOutput((W, H), dai.ImgFrame.Type.BGR888i, fps=FPS)
        stereo = pipeline.create(dai.node.StereoDepth)
        stereo.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.DEFAULT)
        stereo.setDepthAlign(dai.CameraBoardSocket.CAM_B)
        left.requestOutput((W, H), dai.ImgFrame.Type.NV12, fps=FPS).link(stereo.left)
        right.requestOutput((W, H), dai.ImgFrame.Type.NV12, fps=FPS).link(stereo.right)
        q_rgb = rgb_out.createOutputQueue(maxSize=1, blocking=False)
        q_depth = stereo.depth.createOutputQueue(maxSize=1, blocking=False)
        pipeline.start()
        print(f"[capture/live] session {session_id}, streaming {W}x{H}@{FPS}. Ctrl-C to stop.")
        frame_idx, last = 0, 0.0
        last_rgb = last_depth = None
        try:
            while True:
                rm, dm = q_rgb.tryGet(), q_depth.tryGet()
                if rm is not None:
                    last_rgb = rm.getCvFrame()
                if dm is not None:
                    last_depth = dm.getFrame()
                now = time.time()
                if last_rgb is not None and last_depth is not None and now - last > 0.5:
                    _emit_results(session_id, last_rgb, last_depth, db, frame_idx)
                    frame_idx += 1
                    last = now
                time.sleep(0.01)
        except KeyboardInterrupt:
            pass
    db.end_session(session_id)
    BUS.emit("SCAN_ENDED", session_id=session_id, frames=frame_idx)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--sim", action="store_true")
    ap.add_argument("--loop", action="store_true", help="sim: loop forever")
    args = ap.parse_args()
    print("[capture] config:", config.summary())
    if args.live:
        run_live()
    else:
        run_sim(loop=args.loop)


if __name__ == "__main__":
    main()
