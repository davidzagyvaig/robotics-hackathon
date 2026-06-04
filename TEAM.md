# Team guide — who owns what

Four people, one contract (`shared/protocol.py` + `events.jsonl`). Work in parallel.

## The contract that lets us work in parallel
- **Actuator**: firmware accepts `P<pan> T<tilt>\n` over USB serial and exposes a UVC macro camera. Nothing else crosses the hardware/software boundary. (`firmware/PROTOCOL.md`)
- **Data bus**: every service appends to `out/events.jsonl`. The dashboard tails it. (`shared/events.py`)
- **Lesion record**: everything lands in `out/lesions.db`. (`shared/lesions.py`)

## Roles

### Mete — vision / ML / AI / dashboard (all software)
Owns: `capture/`, `triage/`, `voice/`, `backend/`, `dashboard/`, `tools/`.
- Live OAK pipeline (`capture/`), lesion detection + 3D triangulation (`capture/vision.py`).
- Triage: ABCD/TDS + HAM10000 classifier + VLM explanation (`triage/`).
- ElevenLabs voice (`voice/`), the clinician console (`dashboard/`), the API (`backend/`).
- Can build the entire stack in **sim mode** with zero hardware — see Quick start.

### Samer — mechanical / electronics / 3D print
Owns: the physical pan-tilt rig + macro-camera mount + power.
- Assemble pan-tilt (MG996R pan + MG90S tilt) on the PCA9685.
- Dedicated 5.5–6 V servo rail, common ground, 1000 µF cap. **This is the #1 risk — get it solid first.**
- Print the standoff cone + bracket. Mount the OAK-D-SR and the macro borescope.

### Dave — firmware / hardware↔software bridge / CAD
Owns: `firmware/` + making the real arm obey Mete's commands.
- Flash `firmware/dermascout_esp32` to the ESP32. Verify `BOOT` + `ST` over serial.
- Confirm `python -m control.control_service` (with `DERMA_USE_ARM=true`) drives it.
- Buy a USB borescope Thursday AM (UVC, ~25–40 mm working distance). Confirm `cv2.VideoCapture` opens it.

### Zsombor — MD / clinical / demo
Owns: clinical correctness + the LOI campaign + demo script.
- Sanity-check ABCD/TDS thresholds and the "documentation, not diagnosis" framing everywhere.
- Tune the voice copy in `voice/prompts.py` (clothing greeting, consent, bump recovery).
- Email dermatologists for letters of intent. Run the patient role-play in the demo.

## Build order (ship-blockers first)
1. **serial servo loop** (COBS/watchdog) — Dave + Samer
2. **find → center → capture** on the OAK — Mete  ← *the only thing that must be bulletproof*
3. triage + voice + dashboard — Mete
4. clothing/private-mode + change detection — Mete + Zsombor
5. SLAM sweep — *bonus only, not on the judged path*

## Failsafe tiers (degrade gracefully, never "fail")
| Tier | Running | If it breaks, say |
|---|---|---|
| 3 full auto | everything | "production runs this end-to-end" |
| **2 semi-auto** ← demo target | auto-find, operator approves each move (`--approve-each`) | — |
| 1 RC | voice + manual macro positioning | "same voice + mesh, I'm driving the head by hand" |
| 0 voice-only | voice + 3D mesh + click lesions on screen | "this is the version we'd ship first anyway" |

Flip tiers with env flags in `.env` (`DERMA_USE_ARM`, `DERMA_USE_MACRO`, …).
