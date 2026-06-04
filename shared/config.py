"""
Central config + paths for DermaScout. Reads .env if present.

Everything is overridable by environment variable so the four team members
can run different subsets (sim vs real, Mac vs 4090) without editing code.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
SNAPSHOTS = OUT / "snapshots"
ANALYSIS = OUT / "analysis"
MESHES = OUT / "meshes"
MACRO = OUT / "macro"
EVENTS_PATH = OUT / "events.jsonl"
LESION_DB = OUT / "lesions.db"

for _p in (OUT, SNAPSHOTS, ANALYSIS, MESHES, MACRO):
    _p.mkdir(parents=True, exist_ok=True)


def _flag(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


# ---- Demo failsafe flags (Tier ladder) -------------------------------------
USE_ARM = _flag("DERMA_USE_ARM", False)        # serial actuator
USE_MACRO = _flag("DERMA_USE_MACRO", False)    # macro UVC camera
USE_SLAM = _flag("DERMA_USE_SLAM", False)      # RTABMap sweep (experimental)
USE_VOICE = _flag("DERMA_USE_VOICE", True)     # ElevenLabs voice
USE_CLASSIFIER = _flag("DERMA_USE_CLASSIFIER", True)  # HAM10000 ViT/EffNet
USE_POSE = _flag("DERMA_USE_POSE", True)       # MediaPipe pose + clothing

# ---- Camera ----------------------------------------------------------------
CAM_W = int(os.getenv("DERMA_CAM_W", "640"))
CAM_H = int(os.getenv("DERMA_CAM_H", "400"))
CAM_FPS = int(os.getenv("DERMA_CAM_FPS", "30"))

# ---- Serial / actuator -----------------------------------------------------
SERIAL_PORT = os.getenv("DERMA_SERIAL_PORT", "")  # e.g. /dev/tty.usbmodem1101
SERIAL_BAUD = int(os.getenv("DERMA_SERIAL_BAUD", "115200"))

# ---- Macro camera ----------------------------------------------------------
MACRO_CAM_INDEX = int(os.getenv("DERMA_MACRO_CAM_INDEX", "1"))  # cv2.VideoCapture index

# ---- Triage ----------------------------------------------------------------
# Primary: EfficientNetV2-S (88% acc). Backup: ViT base (84%).
CLASSIFIER_MODEL = os.getenv(
    "DERMA_CLASSIFIER_MODEL", "ahishamm/vit-base-HAM-10000-patch-16"
)
DEVICE = os.getenv("DERMA_DEVICE", "")  # "", "cpu", "mps", "cuda"

# ---- VLM explanation -------------------------------------------------------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
VLM_PROVIDER = os.getenv("DERMA_VLM_PROVIDER", "anthropic")  # anthropic | openai | off

# ---- ElevenLabs ------------------------------------------------------------
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")  # for plain TTS prompt bank

# ---- Backend ---------------------------------------------------------------
BACKEND_HOST = os.getenv("DERMA_BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("DERMA_BACKEND_PORT", "8000"))

# ---- Inference offload (optional 4090) -------------------------------------
INFERENCE_URL = os.getenv("DERMA_INFERENCE_URL", "")  # http://4090-host:9000


def summary() -> dict:
    return {
        "USE_ARM": USE_ARM,
        "USE_MACRO": USE_MACRO,
        "USE_SLAM": USE_SLAM,
        "USE_VOICE": USE_VOICE,
        "USE_CLASSIFIER": USE_CLASSIFIER,
        "USE_POSE": USE_POSE,
        "CAM": f"{CAM_W}x{CAM_H}@{CAM_FPS}",
        "SERIAL_PORT": SERIAL_PORT or "(none)",
        "classifier": CLASSIFIER_MODEL,
        "vlm": VLM_PROVIDER,
        "inference_url": INFERENCE_URL or "(local)",
    }
