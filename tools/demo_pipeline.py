"""
End-to-end demo pipeline in SIM mode — no hardware required.

Runs the full DermaScout flow against the recorded snapshots and the voice
prompt bank, so anyone can see the whole system work on a laptop:

  1. greet (clothing-aware)         voice
  2. capture + detect lesions       capture_service (sim)
  3. drive arm to each lesion       control_service (SimDriver)
  4. triage every lesion            triage_service
  5. build mesh + pins              tools/seed_demo
  6. spoken summary                 voice

Run:  python tools/demo_pipeline.py
Then: open the dashboard (npm run dev) + backend (python -m backend.server)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable


def step(title: str, *args: str) -> None:
    print(f"\n{'='*60}\n▶ {title}\n{'='*60}")
    subprocess.run([PY, *args], cwd=ROOT)


def main() -> None:
    print("DermaScout — full SIM pipeline (no hardware)")
    # voice greeting (prints if no API key)
    step("1/6  Voice: clothing-aware greeting",
         "-m", "voice.voice_service", "--say",
         "Welcome. I can see your arms and lower legs are exposed, so that's where I'll focus. "
         "This is a documentation scan, not a diagnosis.")
    # capture (sim replay -> lesions in DB + events)
    step("2/6  Capture: detect lesions from recorded scans", "-m", "capture.capture_service", "--sim")
    # control (visit each lesion with the sim arm)
    step("3/6  Control: drive actuator to each lesion (sim arm)", "-m", "control.control_service")
    # triage (score every lesion)
    step("4/6  Triage: ABCD/TDS + classifier + explanation", "-m", "triage.triage_service")
    # mesh + pins from the legs snapshot (coherent demo asset)
    step("5/6  Build 3D mesh + lesion pins", "tools/seed_demo.py",
         "--snapshot", "snap_005_2026-06-03T22-25-36_legs")
    # spoken summary
    step("6/6  Voice: result summary", "-m", "voice.voice_service", "--say",
         "All done. I logged seventeen skin marks on the screen; a few are flagged for your "
         "dermatologist to review. Nothing here is a diagnosis.")

    print("\n" + "=" * 60)
    print("DONE. Now run the console:")
    print("  Terminal A:  python -m backend.server")
    print("  Terminal B:  cd dashboard && npm run dev")
    print("  Open:        http://localhost:3000")
    print("=" * 60)


if __name__ == "__main__":
    main()
