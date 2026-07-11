# One-command startup — design

## Problem

Running Wardome Reborn locally requires 3 manual steps in 3 terminals: `docker run` (game server), `node bridge/server.js` (bridge), `python3 -m http.server` in `web/` (static client). Pure dev-ergonomics friction, no functional gap.

## Approach: hybrid (compose for game only + shell script for the rest)

Rejected full containerization of bridge/web: adds a new bridge Dockerfile and live-edit friction (rebuild-or-volume-mount complexity) for zero functional gain — the actual pain point is "too many commands," not "not containerized enough." Hybrid solves the real pain with the smallest change.

**`docker-compose.yml`** (repo root): single service `game`, builds `docker/Dockerfile` (unchanged), maps `4000:4000`, matches today's `docker run` invocation.

**`start.sh`** (repo root, executable):
1. `docker compose up -d` — starts/reuses the game container.
2. `node bridge/server.js &` — background, capture PID.
3. `python3 -m http.server --directory web 8000 &` — background, capture PID.
4. Print the 3 URLs/ports (game :4000 internal, bridge ws :8080, client http://localhost:8000).
5. `trap` on EXIT/INT/TERM: kill both background PIDs, `docker compose down`.
6. `wait` to block in foreground until Ctrl+C.

## Out of scope

- Containerizing bridge or web (unnecessary per above).
- Auto-restart/hot-reload for bridge on file change (YAGNI, not asked for).
- Windows support (project only runs on macOS/Linux dev machines so far).

## Testing

Manual: run `./start.sh`, confirm all 3 processes up, browser client connects and plays normally, Ctrl+C cleanly stops all 3 (check `docker ps`, `lsof -i :8080`, `lsof -i :8000` show nothing after). Matches project's existing manual-verification testing rigor — no automated suite.
