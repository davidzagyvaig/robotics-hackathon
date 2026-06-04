"""
Control service — drives the actuator to each detected lesion and captures macros.

Reads the lesion catalog for the latest session, visits each lesion (feed-forward
pan/tilt), captures a macro close-up, and emits ARM_MOVED / MACRO_CAPTURED events.

Works with SimDriver (no hardware) or SerialDriver (real ESP32) transparently.

Run:
  python -m control.control_service                 # visit latest session's lesions
  python -m control.control_service --session <id>
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared import config  # noqa: E402
from shared.events import default_bus  # noqa: E402
from shared.lesions import LesionDB  # noqa: E402
from control.arm_driver import make_driver  # noqa: E402
from control.macro import MacroCamera  # noqa: E402
from control.servoing import lesion_to_pan_tilt  # noqa: E402

BUS = default_bus("control")


def run(session_id: str | None = None, approve_each: bool = False) -> None:
    db = LesionDB(config.LESION_DB)
    session_id = session_id or db.latest_session()
    if not session_id:
        print("[control] no session found; run capture first")
        return
    lesions = db.lesions(session_id)
    if not lesions:
        print(f"[control] session {session_id} has no lesions")
        return

    arm = make_driver()
    macro = MacroCamera(config.MACRO_CAM_INDEX) if config.USE_MACRO else None
    print(f"[control] visiting {len(lesions)} lesions in {session_id} "
          f"(arm={'serial' if config.USE_ARM else 'sim'}, macro={'on' if macro else 'off'})")

    for les in lesions:
        if approve_each:
            input(f"  [enter] to visit {les['id']} at ({les['x_mm']},{les['y_mm']},{les['z_mm']})mm ...")
        pan, tilt = lesion_to_pan_tilt(les["u"], les["v"])
        ok = arm.move_to(pan, tilt)
        BUS.emit("ARM_MOVED", lesion=les["id"], pan=round(pan, 2), tilt=round(tilt, 2), ok=ok)
        if macro is not None:
            out = config.MACRO / f"{session_id}_{les['id']}.png"
            path = macro.capture(out)
            db.conn.execute(
                "UPDATE lesions SET macro_image=? WHERE id=? AND session_id=?",
                (str(path), les["id"], session_id),
            )
            db.conn.commit()
            BUS.emit("MACRO_CAPTURED", lesion=les["id"], path=str(path))
        time.sleep(0.1)

    arm.home()
    arm.close()
    if macro is not None:
        macro.close()
    print("[control] done; returned home")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default=None)
    ap.add_argument("--approve-each", action="store_true",
                    help="Tier-2 semi-auto: operator confirms each move")
    args = ap.parse_args()
    print("[control] config:", config.summary())
    run(args.session, approve_each=args.approve_each)


if __name__ == "__main__":
    main()
