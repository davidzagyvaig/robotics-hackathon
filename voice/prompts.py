"""
Voice prompt bank — the lines DermaScout speaks.

Architecture (per the latency analysis): scan-flow commands are PRE-GENERATED /
streamed TTS (instant, deterministic). The live conversational Agent is used only
for the state-aware greeting and optional patient Q&A.

The three "states" below are the ElevenLabs-prize-winning copy: clothing-aware
greeting, private-mode consent, and the bump-recovery moment (say it on purpose
in the demo).
"""

from __future__ import annotations

# --- Deterministic scan commands (pre-generate these as WAV for zero latency) ---
SCAN_COMMANDS = {
    "raise_left_arm": "Please raise your left arm out to the side, palm forward, shoulder height.",
    "raise_right_arm": "Now your right arm, the same way.",
    "lower_arms": "You can lower your arms.",
    "turn_left_30": "Slowly turn about thirty degrees to your left.",
    "turn_right_30": "Now turn about thirty degrees to your right.",
    "hold_still": "Hold still for three seconds while I capture.",
    "found_one": "I found a skin mark — taking a closer look now.",
    "scan_complete": "All done. Your results are ready on the screen.",
    "come_closer": "Could you step a little closer to me?",
    "step_back": "Step back just slightly, you're a bit too close.",
}


def greeting(exposed_regions: list[str]) -> str:
    """State A — clothing-aware greeting. Names what's exposed, offers private mode."""
    if exposed_regions:
        regions = _natural_list(exposed_regions)
        body = (f"Looks like you're set up for a partial scan today — I can see your "
                f"{regions} are exposed, so that's where I'll focus.")
    else:
        body = "It looks like most of your skin is covered right now."
    return (
        "Hi — welcome. I'm the DermaScout assistant; I'll walk you through your skin check. "
        f"{body} Before we start: this is a documentation scan, not a diagnosis — anything I "
        "flag goes to your doctor. If you want to stop at any point, just say 'pause'. "
        "If you'd like a fuller scan that includes your back or torso, I can switch to a "
        "private mode in a separate room — totally optional. Ready when you are."
    )


PRIVATE_MODE = (  # State B — consent flow
    "Sure — happy to do a full-body scan. Quick note first: in private mode you'll be in a "
    "room by yourself with the scanner. You undress to whatever level you're comfortable with — "
    "there's no minimum, and you can keep underwear on. The more skin I can see, the more "
    "complete the record, but it's entirely your call. Everything goes straight to your "
    "encrypted record — only you and your doctor see it. If you want me to skip any area, just "
    "say 'skip this region' and I will, no questions asked. Walk through the door on your right "
    "when you're ready, and say 'I'm ready' when you're set."
)

BUMP_RECOVERY = (  # State C — the demo's killer moment; trigger it on purpose
    "Whoa — don't worry, I'm fine. Are you okay? Good. That happens; the rig is sturdier than "
    "it looks. Let me re-check my alignment… we're still good, no need to redo anything. We "
    "were partway through your right shoulder — want to pick up where we left off?"
)


def lesion_summary(n_lesions: int, n_flagged: int) -> str:
    if n_lesions == 0:
        return "I didn't find any marks worth noting on the exposed skin today."
    base = f"I logged {n_lesions} skin mark{'s' if n_lesions != 1 else ''} on the screen."
    if n_flagged:
        return (base + f" {n_flagged} of them I've flagged for your dermatologist to look at "
                "more closely. Nothing here is a diagnosis — just a closer look recommended.")
    return base + " None of them look urgent, but they're all logged so we can track changes over time."


def _natural_list(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"
