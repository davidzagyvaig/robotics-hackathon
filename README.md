# DermaScout 🔬

**A voice-guided 3D skin-documentation & longitudinal-monitoring station.**
Built for the 2nd Hungarian Robotics Hackathon @ Formlabs Budapest (June 4–6 2026) by **Team Nexus**.

> The patient stands still; a calm voice agent directs them ("raise your left arm, turn 30° to your right, hold still"). A depth camera builds a **textured 3D model** of the exposed skin, classical vision finds every skin mark and pins it to a **3D coordinate**, a small actuator drives a macro camera to each one for a close-up, and a triage layer (ABCD/TDS + a HAM10000 model + a VLM) flags anything worth a dermatologist's eyes. Next visit, we re-find the same mark at the same scale and measure how it changed.

**The wedge:** a phone can't reproduce scale and pose across sessions — so it can't track *change*, the one signal that actually matters in skin cancer (the "E" / Evolving in ABCDE). A calibrated capture station can. We're the sub-€5k version of a €50k–500k enterprise rig (Canfield Vectra, FotoFinder ATBM, SquareMind Swan).

**Triage, never diagnosis.** Every flag routes to a dermatologist. Nothing here diagnoses anything.

---

## What's in the box

```
dermascout/
├── capture/        OAK-D-SR locator: depth → skin mask → blob detect → 3D triangulate → pose/clothing
├── control/        ArmDriver (sim + ESP32 serial), visual servoing, macro capture
├── triage/         ABCD/TDS classical score + HAM10000 classifier + VLM explanation
├── voice/          ElevenLabs prompt bank + 3 showcase states (clothing greet / consent / bump)
├── backend/        FastAPI: REST + WebSocket event stream to the dashboard
├── dashboard/      Next.js + React-Three-Fiber clinician console (rotatable 3D mesh + clickable pins)
├── firmware/       ESP32 + PCA9685 pan-tilt firmware (Arduino) + the serial PROTOCOL.md
├── shared/         events bus, lesion DB (SQLite), serial protocol, config, types
├── tools/          ply→glb, demo seeder, full-pipeline runner
├── out/            recorded OAK snapshots + generated meshes/lesions/events
└── prototypes      test_oak.py · live_view.py · app.py · analyze*.py (verified standalone scripts)
```

Architecture: every service is its own process; they talk **only** through `out/events.jsonl` (append-only log) and `out/lesions.db` (SQLite). Any service can crash and restart without taking the others down. The actuator boundary is one line of ASCII serial. That's what lets four people build in parallel.

---

## Quick start (no hardware needed — everything has a sim path)

```bash
# 1. Python env
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Run the whole pipeline against recorded scans (capture → control → triage → mesh → voice)
python tools/demo_pipeline.py

# 3. Launch the clinician console
./run_all.sh                      # starts FastAPI (:8000) + Next.js dashboard (:3000)
#   ...then in another terminal, fire a scan to watch events stream live:
python -m capture.capture_service --sim

# open http://localhost:3000
```

You'll see a rotatable 3D mesh of a scanned limb with **17 lesion pins (4 flagged)**, a lesion
detail panel (macro crop + ABCD/TDS + model label + plain-language explanation), and a live
event feed. All from data the OAK-D-SR actually captured.

### Dashboard only (front-end devs)
```bash
cd dashboard && npm install && npm run dev   # reads the pre-built public/mesh.glb + pins.json
```

---

## Running it for real (with the OAK-D-SR + actuator)

```bash
cp .env.example .env          # then flip the flags as hardware comes online
# DERMA_USE_ARM=true  DERMA_SERIAL_PORT=/dev/tty.usbmodemXXXX  DERMA_USE_MACRO=true

python -m capture.capture_service --live    # live OAK pipeline
python -m control.control_service           # drive the arm to each lesion (--approve-each for Tier 2)
python -m triage.triage_service             # score every lesion
python tools/seed_demo.py                   # rebuild the dashboard mesh+pins from the latest session
```

Hardware: **OAK-D-SR** (locator + depth + 3D), **ESP32 + PCA9685 + MG996R/MG90S** servos
(`firmware/`), a **USB borescope** as the macro imager. See [`firmware/PROTOCOL.md`](firmware/PROTOCOL.md)
and [`TEAM.md`](TEAM.md).

---

## The five subsystems (so it's not "just an arm")

1. **Autonomous targeting** — it finds its own targets (skin mask → dark-blob → 3D coordinate). No teleop.
2. **3D body model** — depth → textured mesh; every lesion is a clickable 3D pin a doctor can rotate to.
3. **Longitudinal change detection** — re-find the same mark across sessions at constant scale (`shared/lesions.py: match_to_prior`). **The moat.**
4. **Patient guidance** — pose + clothing detection drive an adaptive ElevenLabs voice ("nice shirt — I'll scan your exposed arms; private mode for full-body").
5. **Triage** — ABCD/TDS (transparent) gated with a HAM10000 model (tie-breaker) + VLM explanation. Routes to a dermatologist.

## Honest limitations (we lead with these)
- **Triage, not diagnosis.** No regulatory clearance. Every flag → dermatologist.
- HAM10000/ISIC models are trained on **polarized dermoscopic** images; without a dermatoscope our captures are out-of-distribution, so the classifier is a **low-weight tie-breaker**, not the decision. The flag is gated on ABCD/TDS.
- These models **underperform on darker skin** (Fitzpatrick V–VI). Stated up front.
- Change detection is a geometric heuristic. It raises concern; it never clears it.

## Status — what's verified
- ✅ OAK-D-SR live on macOS (depthai v3, USB SUPER, 30 fps RGB+depth, ~200k-pt cloud/frame)
- ✅ Vision pipeline on 5 real snapshots (63–81% valid depth on arm/hand/face/legs)
- ✅ Single-frame Poisson mesh (35k verts) → GLB → 3D dashboard with pins
- ✅ Full sim pipeline end-to-end; FastAPI WebSocket delivers live events to the console
- ✅ Dashboard builds clean (Next 14.2, type-checked) and serves
- 🔜 actuator firmware on real servos · macro borescope · RTABMap sweep (bonus)

---

Made by **Team Nexus** · TRIAGE not diagnosis · built in 48h.
