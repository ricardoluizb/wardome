#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

cleanup() {
  echo
  echo "Shutting down..."
  [[ -n "${BRIDGE_PID:-}" ]] && kill "$BRIDGE_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  docker compose down
}
trap cleanup EXIT INT TERM

echo "Starting game server (docker compose)..."
docker compose up -d --build

echo "Starting bridge (node bridge/server.js)..."
node bridge/server.js &
BRIDGE_PID=$!

echo "Starting web client (python3 -m http.server 8000)..."
python3 -m http.server 8000 --directory web &
WEB_PID=$!

cat <<EOF

Wardome Reborn is up:
  Game server (telnet, internal): localhost:4000
  Bridge (WebSocket):              ws://localhost:8080
  Web client:                      http://localhost:8000

Press Ctrl+C to stop everything.
EOF

wait "$BRIDGE_PID" "$WEB_PID"
