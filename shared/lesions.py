"""
SQLite lesion catalog — the longitudinal record (the moat).

Each scan = a session. Each session has N lesions, each with a 3D coordinate.
Cross-session matching (delta_area_pct vs matched_prior_id) is what lets us
say "this mole grew 18% since March" — the thing a phone photo cannot do.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from .types import Lesion

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    patient TEXT,
    started REAL,
    ended REAL,
    mesh_path TEXT,
    note TEXT
);
CREATE TABLE IF NOT EXISTS lesions (
    id TEXT,
    session_id TEXT,
    u INTEGER, v INTEGER,
    x_mm REAL, y_mm REAL, z_mm REAL,
    area_px INTEGER,
    region TEXT,
    abcd_tds REAL,
    classifier_label TEXT,
    classifier_score REAL,
    flag INTEGER,
    explanation TEXT,
    macro_image TEXT,
    matched_prior_id TEXT,
    delta_area_pct REAL,
    PRIMARY KEY (id, session_id)
);
"""


class LesionDB:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # ---- sessions ----
    def start_session(self, session_id: str, patient: str = "", note: str = "") -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO sessions (id, patient, started, note) VALUES (?,?,?,?)",
            (session_id, patient, time.time(), note),
        )
        self.conn.commit()

    def end_session(self, session_id: str, mesh_path: str = "") -> None:
        self.conn.execute(
            "UPDATE sessions SET ended=?, mesh_path=? WHERE id=?",
            (time.time(), mesh_path, session_id),
        )
        self.conn.commit()

    def sessions(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM sessions ORDER BY started DESC")]

    def latest_session(self) -> str | None:
        row = self.conn.execute("SELECT id FROM sessions ORDER BY started DESC LIMIT 1").fetchone()
        return row["id"] if row else None

    # ---- lesions ----
    def upsert_lesion(self, les: Lesion) -> None:
        d = les.to_dict()
        self.conn.execute(
            """INSERT OR REPLACE INTO lesions
               (id, session_id, u, v, x_mm, y_mm, z_mm, area_px, region,
                abcd_tds, classifier_label, classifier_score, flag, explanation,
                macro_image, matched_prior_id, delta_area_pct)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                d["id"], d["session_id"], d["u"], d["v"], d["x_mm"], d["y_mm"], d["z_mm"],
                d["area_px"], d["region"], d["abcd_tds"], d["classifier_label"],
                d["classifier_score"], int(bool(d["flag"])), d["explanation"],
                d["macro_image"], d["matched_prior_id"], d["delta_area_pct"],
            ),
        )
        self.conn.commit()

    def lesions(self, session_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM lesions WHERE session_id=? ORDER BY id", (session_id,)
        )
        return [dict(r) for r in rows]

    def match_to_prior(self, session_id: str, prior_session_id: str, tol_mm: float = 25.0) -> int:
        """Nearest-neighbour 3D match of this session's lesions to a prior session.

        Sets matched_prior_id + delta_area_pct. Returns count matched.
        This is the longitudinal change-detection kernel.
        """
        cur = self.lesions(session_id)
        prior = self.lesions(prior_session_id)
        matched = 0
        for c in cur:
            best, best_d = None, tol_mm
            for p in prior:
                d = (
                    (c["x_mm"] - p["x_mm"]) ** 2
                    + (c["y_mm"] - p["y_mm"]) ** 2
                    + (c["z_mm"] - p["z_mm"]) ** 2
                ) ** 0.5
                if d < best_d:
                    best, best_d = p, d
            if best is not None:
                delta = None
                if best["area_px"]:
                    delta = (c["area_px"] - best["area_px"]) / best["area_px"] * 100.0
                self.conn.execute(
                    "UPDATE lesions SET matched_prior_id=?, delta_area_pct=? WHERE id=? AND session_id=?",
                    (best["id"], delta, c["id"], session_id),
                )
                matched += 1
        self.conn.commit()
        return matched

    def close(self) -> None:
        self.conn.close()
