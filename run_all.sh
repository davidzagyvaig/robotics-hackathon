#!/bin/bash
# DermaScout — launch the clinician console (backend + dashboard).
# Usage: ./run_all.sh
set -e
cd "$(dirname "$0")"

echo "==> Starting DermaScout console"

# 1. backend (FastAPI)
echo "==> backend on :8000"
.venv/bin/python -m backend.server &
BACKEND_PID=$!

# 2. dashboard (Next.js)
echo "==> dashboard on :3000"
( cd dashboard && npm run dev ) &
DASH_PID=$!

trap "echo; echo 'stopping...'; kill $BACKEND_PID $DASH_PID 2>/dev/null" INT TERM

echo ""
echo "  Console:  http://localhost:3000"
echo "  API:      http://localhost:8000/api/health"
echo ""
echo "  In another terminal, run a scan:"
echo "    .venv/bin/python -m capture.capture_service --sim     # or --live with the OAK"
echo ""
echo "  Ctrl-C to stop."
wait
