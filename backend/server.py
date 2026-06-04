"""
DermaScout backend — FastAPI.

Endpoints:
  GET  /api/health                 service status + config summary
  GET  /api/sessions               list scan sessions
  GET  /api/lesions?session=<id>   lesions for a session (defaults to latest)
  GET  /api/pins?session=<id>      lesions as 3D pins for the mesh (normalized)
  GET  /api/events?n=200           recent events (REST snapshot)
  WS   /ws/events                  live event stream (tails events.jsonl)
  GET  /mesh.glb                   the demo mesh (served from dashboard/public)
  GET  /macro/<file>               macro close-up images

Run:
  python -m backend.server         (or: uvicorn backend.server:app --reload)
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402

from shared import config  # noqa: E402
from shared.lesions import LesionDB  # noqa: E402

app = FastAPI(title="DermaScout API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

PUBLIC = config.ROOT / "dashboard" / "public"


def _db() -> LesionDB:
    return LesionDB(config.LESION_DB)


@app.get("/api/health")
def health():
    return {"ok": True, "config": config.summary()}


@app.get("/api/sessions")
def sessions():
    return _db().sessions()


@app.get("/api/lesions")
def lesions(session: str | None = None):
    db = _db()
    sid = session or db.latest_session()
    if not sid:
        return {"session": None, "lesions": []}
    return {"session": sid, "lesions": db.lesions(sid)}


@app.get("/api/pins")
def pins(session: str | None = None):
    # serve the pre-built pins.json if present (fast path for the demo)
    pj = PUBLIC / "pins.json"
    if pj.exists() and session is None:
        return JSONResponse(json.loads(pj.read_text()))
    db = _db()
    sid = session or db.latest_session()
    if not sid:
        return {"session": None, "pins": []}
    out = []
    for les in db.lesions(sid):
        out.append({
            "id": les["id"], "position": None,  # raw mm; dashboard normalizes if needed
            "xyz_mm": [les["x_mm"], les["y_mm"], les["z_mm"]],
            "flag": bool(les["flag"]), "tds": les["abcd_tds"],
            "label": les["classifier_label"], "explanation": les["explanation"],
            "macro": les["macro_image"], "region": les["region"],
        })
    return {"session": sid, "pins": out}


@app.get("/api/events")
def events(n: int = 200):
    if not config.EVENTS_PATH.exists():
        return {"events": []}
    lines = config.EVENTS_PATH.read_text().splitlines()[-n:]
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return {"events": out}


@app.get("/mesh.glb")
def mesh():
    p = PUBLIC / "mesh.glb"
    if p.exists():
        return FileResponse(p, media_type="model/gltf-binary")
    return JSONResponse({"error": "no mesh"}, status_code=404)


@app.get("/macro/{name}")
def macro(name: str):
    p = config.MACRO / name
    if p.exists():
        return FileResponse(p)
    return JSONResponse({"error": "not found"}, status_code=404)


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    path = config.EVENTS_PATH
    path.touch(exist_ok=True)
    # send a backlog, then tail
    try:
        with open(path, "r") as f:
            backlog = f.readlines()[-50:]
            for line in backlog:
                line = line.strip()
                if line:
                    await ws.send_text(line)
            f.seek(0, 2)  # end
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.2)
                    continue
                line = line.strip()
                if line:
                    await ws.send_text(line)
    except WebSocketDisconnect:
        return
    except Exception:
        return


def main() -> None:
    import uvicorn

    print("[backend] config:", config.summary())
    uvicorn.run(app, host=config.BACKEND_HOST, port=config.BACKEND_PORT)


if __name__ == "__main__":
    main()
