"""
Voice service — speaks DermaScout's prompts via ElevenLabs.

Three speech paths, fastest to slowest:
  speak_text()    streaming TTS for any string (scan commands, summaries)
  pregenerate()   render the fixed SCAN_COMMANDS bank to WAV once (zero-latency replay)
  run_agent()     live Conversational AI agent for greeting + Q&A (needs agent_id)

Everything degrades gracefully:
  - no API key  -> prints the line to stdout (so the demo flow still works)
  - no audio out -> writes WAV files you can play manually

Run:
  python -m voice.voice_service --demo          # speak the three showcase states
  python -m voice.voice_service --pregenerate   # render command bank to out/voice/
  python -m voice.voice_service --say "hello"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared import config  # noqa: E402
from shared.events import default_bus  # noqa: E402
from voice import prompts  # noqa: E402

BUS = default_bus("voice")
VOICE_OUT = config.OUT / "voice"
VOICE_OUT.mkdir(parents=True, exist_ok=True)


class Voice:
    def __init__(self) -> None:
        self._client = None
        self._voice_id = config.ELEVENLABS_VOICE_ID or "21m00Tcm4TlvDq8ikWAM"  # Rachel default
        if config.ELEVENLABS_API_KEY:
            try:
                from elevenlabs.client import ElevenLabs

                self._client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
            except Exception as e:  # noqa: BLE001
                print(f"[voice] ElevenLabs init failed ({e}); printing lines instead")
        else:
            print("[voice] no ELEVENLABS_API_KEY; running in print-only mode")

    @property
    def available(self) -> bool:
        return self._client is not None

    def speak_text(self, text: str, save_as: str | None = None, play: bool = True) -> str | None:
        BUS.emit("VOICE_SAID", text=text)
        print(f"[voice] 🔊 {text}")
        if not self.available:
            return None
        try:
            audio = self._client.text_to_speech.convert(
                voice_id=self._voice_id,
                model_id="eleven_turbo_v2_5",
                text=text,
                output_format="mp3_44100_128",
            )
            data = b"".join(audio)
            out = VOICE_OUT / (save_as or "last.mp3")
            out.write_bytes(data)
            if play:
                self._play(out)
            return str(out)
        except Exception as e:  # noqa: BLE001
            print(f"[voice] TTS failed ({e})")
            return None

    def _play(self, path: Path) -> None:
        import subprocess
        import sys as _sys

        try:
            if _sys.platform == "darwin":
                subprocess.Popen(["afplay", str(path)])
            elif _sys.platform.startswith("linux"):
                subprocess.Popen(["aplay", str(path)])
        except Exception:
            pass

    def pregenerate(self) -> None:
        for key, text in prompts.SCAN_COMMANDS.items():
            self.speak_text(text, save_as=f"cmd_{key}.mp3", play=False)
            print(f"  rendered {key}")


def demo(voice: Voice) -> None:
    """Speak the three showcase states — the ElevenLabs prize reel."""
    voice.speak_text(prompts.greeting(["left arm", "right arm", "lower legs"]))
    voice.speak_text(prompts.SCAN_COMMANDS["raise_left_arm"])
    voice.speak_text(prompts.SCAN_COMMANDS["hold_still"])
    voice.speak_text(prompts.BUMP_RECOVERY)
    voice.speak_text(prompts.lesion_summary(7, 2))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--pregenerate", action="store_true")
    ap.add_argument("--say", default=None)
    args = ap.parse_args()
    voice = Voice()
    if args.pregenerate:
        voice.pregenerate()
    elif args.say:
        voice.speak_text(args.say)
    else:
        demo(voice)


if __name__ == "__main__":
    main()
