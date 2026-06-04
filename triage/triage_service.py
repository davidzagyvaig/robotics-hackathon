"""
Triage service — score every lesion in a session.

For each lesion: load its macro crop (or a synthetic crop), run ABCD/TDS, run the
classifier, gate the flag on (TDS suspicious OR malignant classifier signal),
generate a plain-language explanation, and write it all back to the DB.

Flag gating (intentionally high-sensitivity for triage):
    flag = (TDS > 5.45) OR (classifier malignant_signal AND score > 0.5)

Run:
  python -m triage.triage_service              # latest session
  python -m triage.triage_service --session <id>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared import config  # noqa: E402
from shared.events import default_bus  # noqa: E402
from shared.lesions import LesionDB  # noqa: E402
from triage import abcd as abcd_mod  # noqa: E402
from triage.classifier import LesionClassifier  # noqa: E402
from triage.explain import explain  # noqa: E402

BUS = default_bus("triage")


def _crop_for(les: dict) -> np.ndarray | None:
    """Get a lesion crop: prefer a captured macro, else crop the locator snapshot."""
    if les.get("macro_image") and Path(les["macro_image"]).exists():
        return cv2.imread(les["macro_image"])
    # fall back: crop around (u,v) from the session's snapshot rgb if we can find one
    for snap in sorted(config.SNAPSHOTS.iterdir()):
        rgb = snap / "rgb.png"
        if rgb.exists():
            img = cv2.imread(str(rgb))
            u, v = les["u"], les["v"]
            r = 40
            h, w = img.shape[:2]
            crop = img[max(0, v - r):min(h, v + r), max(0, u - r):min(w, u + r)]
            if crop.size:
                return cv2.resize(crop, (128, 128))
    return None


def run(session_id: str | None = None) -> None:
    db = LesionDB(config.LESION_DB)
    session_id = session_id or db.latest_session()
    if not session_id:
        print("[triage] no session")
        return
    lesions = db.lesions(session_id)
    clf = LesionClassifier(config.CLASSIFIER_MODEL) if config.USE_CLASSIFIER else None
    print(f"[triage] scoring {len(lesions)} lesions in {session_id} "
          f"(classifier={'on' if clf and clf.available else 'off'})")

    n_flag = 0
    for les in lesions:
        crop = _crop_for(les)
        if crop is None:
            continue
        abcd = abcd_mod.tds_score(crop)
        clf_out = clf.classify(crop) if clf and clf.available else {}
        flag = abcd["TDS"] > 5.45 or (
            clf_out.get("malignant_signal") and clf_out.get("score", 0) > 0.5
        )
        text = explain(abcd, clf_out, flag, les.get("macro_image"))
        db.conn.execute(
            """UPDATE lesions SET abcd_tds=?, classifier_label=?, classifier_score=?,
               flag=?, explanation=? WHERE id=? AND session_id=?""",
            (abcd["TDS"], clf_out.get("human"), clf_out.get("score"),
             int(bool(flag)), text, les["id"], session_id),
        )
        db.conn.commit()
        if flag:
            n_flag += 1
        BUS.emit("INFO", stage="triage", lesion=les["id"], tds=abcd["TDS"],
                 verdict=abcd["verdict"], flag=bool(flag),
                 classifier=clf_out.get("human"))
        print(f"  {les['id']}: TDS={abcd['TDS']} {abcd['verdict']} "
              f"clf={clf_out.get('label','-')} flag={flag}")
    print(f"[triage] done. {n_flag}/{len(lesions)} flagged for review.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default=None)
    args = ap.parse_args()
    run(args.session)


if __name__ == "__main__":
    main()
