"""
VLM plain-language explanation (the patient-readable layer, NOT the decision).

Takes the ABCD/TDS numbers + classifier output and produces a short, calm,
non-alarming explanation. The VLM can only ESCALATE concern, never clear a flag.
Falls back to a deterministic template if no API key is configured, so the demo
always produces text.
"""

from __future__ import annotations

from shared import config

DISCLAIMER = "This is a documentation aid, not a diagnosis. A dermatologist reviews every result."


def _template(abcd: dict, clf: dict, flag: bool) -> str:
    tds = abcd.get("TDS", 0)
    verdict = abcd.get("verdict", "benign-appearing")
    parts = [f"This spot scored {tds} on the ABCD scale ({verdict})."]
    if clf:
        parts.append(f"The reference model's closest match was {clf.get('human','?')} "
                     f"({int(clf.get('score',0)*100)}% similarity).")
    if flag:
        parts.append("Because of its irregularity, it's been flagged for a closer look by your dermatologist.")
    else:
        parts.append("Nothing here looks urgent, but it's logged so changes can be tracked over time.")
    parts.append(DISCLAIMER)
    return " ".join(parts)


def explain(abcd: dict, clf: dict, flag: bool, image_path: str | None = None) -> str:
    """Generate a one-paragraph explanation. Uses VLM if configured, else template."""
    if config.VLM_PROVIDER == "off":
        return _template(abcd, clf, flag)

    prompt = (
        "You are a calm dermatology documentation assistant. In 2-3 plain sentences, "
        "explain this skin-mark scan result to a patient. Never diagnose; recommend "
        "dermatologist review for any flag; do not alarm. "
        f"ABCD/TDS: {abcd}. Reference model: {clf or 'n/a'}. Flagged: {flag}. "
        f"End with: '{DISCLAIMER}'"
    )

    try:
        if config.VLM_PROVIDER == "anthropic" and config.ANTHROPIC_API_KEY:
            import anthropic

            client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
            msg = client.messages.create(
                model="claude-sonnet-4-6", max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text.strip()
        if config.VLM_PROVIDER == "openai" and config.OPENAI_API_KEY:
            from openai import OpenAI

            client = OpenAI(api_key=config.OPENAI_API_KEY)
            resp = client.chat.completions.create(
                model="gpt-4o-mini", max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content.strip()
    except Exception as e:  # noqa: BLE001
        print(f"[explain] VLM failed ({e}); using template")
    return _template(abcd, clf, flag)
