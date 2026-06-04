"""
Seed a clean, coherent demo session from ONE snapshot, then build the matching
mesh + lesion pins for the dashboard. This gives the judge-facing story:

    one body region  ->  one 3D mesh  ->  its own lesion pins, triaged.

Produces:
    out/meshes/demo.glb
    dashboard/public/mesh.glb
    dashboard/public/pins.json

Usage:
  python tools/seed_demo.py --snapshot snap_005_2026-06-03T22-25-36_legs
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared import config  # noqa: E402
from shared.lesions import LesionDB  # noqa: E402
from capture import vision  # noqa: E402
from triage import abcd as abcd_mod  # noqa: E402
from triage.classifier import LesionClassifier  # noqa: E402
from triage.explain import explain  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default=None, help="snapshot dir name; default = first legs/arm")
    ap.add_argument("--no-classifier", action="store_true")
    args = ap.parse_args()

    snaps = sorted(p for p in config.SNAPSHOTS.iterdir() if p.is_dir())
    if not snaps:
        print("no snapshots")
        return
    snap = None
    if args.snapshot:
        snap = config.SNAPSHOTS / args.snapshot
    else:
        snap = next((s for s in snaps if "legs" in s.name or "arm-extended" in s.name), snaps[0])
    print(f"[seed] using {snap.name}")

    bgr = cv2.imread(str(snap / "rgb.png"))
    depth = np.load(snap / "depth.npy")
    if bgr.shape[:2] != depth.shape:
        bgr = cv2.resize(bgr, (depth.shape[1], depth.shape[0]))

    mask = vision.limb_mask(bgr, depth)
    moles = vision.find_moles(bgr, mask, depth)
    print(f"[seed] {len(moles)} lesions")

    db = LesionDB(config.LESION_DB)
    session_id = f"demo_{int(time.time())}"
    db.start_session(session_id, patient="demo", note=f"seed from {snap.name}")

    clf = None if args.no_classifier else LesionClassifier(config.CLASSIFIER_MODEL)
    region = "legs" if "legs" in snap.name else ("arm" if "arm" in snap.name else "body")
    n_flag = 0
    for m in moles:
        m.session_id = session_id
        m.region = region
        r = 24
        crop = bgr[max(0, m.v - r):m.v + r, max(0, m.u - r):m.u + r]
        if crop.size:
            sc = abcd_mod.tds_score(crop)
            m.abcd_tds = sc["TDS"]
            clf_out = clf.classify(crop) if clf and clf.available else {}
            m.classifier_label = clf_out.get("human")
            m.classifier_score = clf_out.get("score")
            m.flag = bool(sc["TDS"] > 5.45 or (clf_out.get("malignant_signal") and clf_out.get("score", 0) > 0.5))
            m.explanation = explain(sc, clf_out, m.flag)
            if m.flag:
                n_flag += 1
        db.upsert_lesion(m)
    db.end_session(session_id)
    print(f"[seed] session {session_id}: {len(moles)} lesions, {n_flag} flagged")

    # build mesh from this snapshot's point cloud
    ply = snap / "cloud.ply"
    mesh_glb = config.MESHES / "demo.glb"
    dash_public = config.ROOT / "dashboard" / "public"
    dash_public.mkdir(parents=True, exist_ok=True)
    import subprocess

    subprocess.run([sys.executable, str(config.ROOT / "tools" / "ply_to_glb.py"),
                    str(ply), str(mesh_glb), "--pins", str(dash_public / "pins.json"),
                    "--session", session_id], check=True)
    # copy glb into dashboard public
    import shutil

    shutil.copy(mesh_glb, dash_public / "mesh.glb")
    print(f"[seed] wrote {dash_public/'mesh.glb'} and pins.json")


if __name__ == "__main__":
    main()
