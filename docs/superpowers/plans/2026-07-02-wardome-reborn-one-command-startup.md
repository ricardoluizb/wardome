# One-Command Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 3-manual-command dev startup (`docker run`, `node bridge/server.js`, `python3 -m http.server`) with a single `./start.sh` that brings up all three and cleans them all up on Ctrl+C.

**Architecture:** A `docker-compose.yml` at repo root formalizes the existing game-server `docker run` invocation as a compose service (same image/container name, same port mapping, no other change). A `start.sh` shell script at repo root orchestrates: `docker compose up -d` for the game, then backgrounds the existing `node bridge/server.js` and `python3 -m http.server` commands exactly as documented in the foundation plan, prints the 3 endpoints, and traps EXIT/INT/TERM to kill the two background jobs and `docker compose down`.

**Tech Stack:** Docker Compose v2 (`docker compose`, the plugin subcommand — not the standalone legacy `docker-compose` binary), POSIX shell (`bash`), no new dependencies.

## Global Constraints

- Never modify anything under `wdii/src` (locked architecture rule — this plan touches zero C files).
- No automated test suite for this project — manual/observational verification only (confirmed project-wide testing rigor). Every verification step below is a manual command + expected observable output, not a script assertion.
- Match the exact image name (`wardome-server`), container name (`wardome-server`), and port mapping (`4000:4000`) already used by the documented `docker run -d --name wardome-server -p 4000:4000 wardome-server` command — do not rename or remap.
- Bridge and web client are unchanged: bridge listens on `ws://localhost:8080` (hardcoded in `web/client.js`), dials the game at `localhost:4000` (`bridge/server.js` defaults `GAME_HOST=localhost`, `GAME_PORT=4000`), web client is static files served on port `8000`.

---

### Task 1: `docker-compose.yml` — formalize the game-server container

**Files:**
- Create: `docker-compose.yml` (repo root)

**Interfaces:**
- Consumes: `docker/Dockerfile` (unchanged, existing file — build context is repo root, same as the documented `docker build -f docker/Dockerfile -t wardome-server .`).
- Produces: a `game` compose service that builds to image `wardome-server`, container name `wardome-server`, exposing host port `4000` → container port `4000`. Task 2's `start.sh` consumes this via `docker compose up -d` / `docker compose down`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  game:
    build:
      context: .
      dockerfile: docker/Dockerfile
    image: wardome-server
    container_name: wardome-server
    ports:
      - "4000:4000"
```

- [ ] **Step 2: Build and start the service**

Run: `docker compose up -d --build`
Expected: pulls/builds `wardome-server` image, prints `Container wardome-server  Started` (or `Running`).

- [ ] **Step 3: Verify the game server is reachable**

Run: `docker compose ps` then `echo | nc -w2 localhost 4000 | head -c 200`
Expected: `docker compose ps` shows service `game` / container `wardome-server` state `running`. The `nc` command prints the game's login banner text (any non-empty bytes confirm the port is live and speaking telnet — do not send further input, this is a connectivity smoke test only).

- [ ] **Step 4: Tear down**

Run: `docker compose down`
Expected: `Container wardome-server  Removed`, `docker compose ps` shows no rows.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for the game server container"
```

---

### Task 2: `start.sh` — one-command orchestration with cleanup

**Files:**
- Create: `start.sh` (repo root, executable)

**Interfaces:**
- Consumes: Task 1's `docker-compose.yml` (via `docker compose up -d`/`down`), the existing unmodified `bridge/server.js` (run as `node bridge/server.js`, listens `ws://localhost:8080`), the existing unmodified `web/` static files (served via `python3 -m http.server 8000` from inside `web/`).
- Produces: a single foreground command, `./start.sh`, that a developer runs instead of the 3 manual commands. Ctrl+C (SIGINT) or normal exit stops all 3 cleanly. Nothing else in the repo depends on this script's internals — it's a leaf orchestration script.

- [ ] **Step 1: Write `start.sh`**

```bash
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
(cd web && python3 -m http.server 8000) &
WEB_PID=$!

cat <<EOF

Wardome Reborn is up:
  Game server (telnet, internal): localhost:4000
  Bridge (WebSocket):              ws://localhost:8080
  Web client:                      http://localhost:8000

Press Ctrl+C to stop everything.
EOF

wait "$BRIDGE_PID" "$WEB_PID"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x start.sh`
Expected: no output; `ls -l start.sh` shows the `x` bit set (e.g. `-rwxr-xr-x`).

- [ ] **Step 3: Run it and verify all 3 processes are up**

Run: `./start.sh` (foreground, leave running), then in a second terminal:
`docker compose ps` — expect `wardome-server` running.
`lsof -iTCP:8080 -sTCP:LISTEN` — expect one `node` process.
`lsof -iTCP:8000 -sTCP:LISTEN` — expect one `Python` process.

- [ ] **Step 4: Verify the browser client end-to-end**

Open `http://localhost:8000` in a browser. Expected, in order: terminal UI loads, connection banner/login prompt from the game appears in the output pane (confirms bridge↔game↔browser round trip is live). This is the same smoke check used in the foundation plan — no need to log in a full character for this task, just confirm the banner renders.

- [ ] **Step 5: Verify Ctrl+C cleans up everything**

In the terminal running `./start.sh`, press Ctrl+C.
Expected console output: `Shutting down...` then `docker compose down` output (`Container wardome-server  Removed`).
Then run: `docker compose ps` (expect no rows), `lsof -iTCP:8080 -sTCP:LISTEN` (expect no output), `lsof -iTCP:8000 -sTCP:LISTEN` (expect no output).

- [ ] **Step 6: Commit**

```bash
git add start.sh
git commit -m "feat: add start.sh for one-command dev startup"
```

---

## Explicitly out of scope (do not implement)

- Containerizing the bridge or web client (rejected in design — adds rebuild/volume-mount friction for zero functional gain).
- Auto-restart or hot-reload of the bridge on file change.
- Windows support.
