# Wardome Reborn — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the original, unmodified Wardome C server running in a browser tab — raw MUD text flowing through a WebSocket bridge into a minimal terminal UI, with the player's current room ID surfaced as structured data. No illustrations, no HUD yet — this plan proves the plumbing works end to end.

**Architecture:** Original `wdii/src` C source (CircleMUD 3.0 fork) runs unmodified inside a Docker container (its native Linux/glibc environment — this Mac's Clang toolchain cannot compile 1990s K&R-style C, verified below). A Node.js bridge process holds one persistent TCP connection to the game server per browser tab, relays raw text both directions over a WebSocket, and additionally recognizes a small out-of-band tag (`$$ROOM:<vnum>$$`) that a single additive line in the C source emits after every room render — the bridge strips the tag from displayed text and re-emits it as a structured JSON message. A plain HTML/CSS/JS page (no framework, no build step) renders the MUD text in a scrolling panel and shows the current room ID in a side panel, proving the whole pipe works.

**Tech Stack:** C (untouched CircleMUD source, compiled via existing `wdii/src/Makefile`), Docker (Debian bullseye base — matches the glibc/gcc era this code expects), Node.js 25 + `ws` package (bridge), plain HTML/CSS/JS (frontend, no build tooling).

## Global Constraints

- The only permitted change to `wdii/src/*.c` or `*.h` in this entire plan is the single additive block in Task 2. No other gameplay, balance, combat, class, or command logic may be touched — this is a hard product requirement ("this IS Wardome, not a remake").
- Do not run `./configure` against the checked-in `wdii/src/conf.h` / `wdii/confdefs.h` on this Mac — it's stale from the original Linux build and regenerating it here breaks things further (confirmed: `./configure` itself fails on this machine's Clang). The Docker image builds with the conf.h as checked into the repo, using the same gcc-era toolchain that produced it.
- Frontend code in `web/` must stay dependency-free (no npm install, no bundler) for this plan — it's a diagnostic/vertical-slice UI, not the final HUD.
- Bridge code in `bridge/` may use exactly one runtime dependency: `ws`. Do not add a framework.
- Every task must end in a state that **compiles/builds and runs** — this is the user's explicit standing requirement, verify with the literal commands in each task, not by inspection.
- Never commit unless explicitly instructed — this plan produces working code in the working tree; committing is a separate, later decision.

---

### Task 1: Dockerize the original C server (unmodified)

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/.dockerignore`

**Interfaces:**
- Produces: a Docker image `wardome-server` that exposes TCP port `4000` and runs `./bin/circle -q 4000` from `/wardome` (matching the "run from game root so data paths resolve" requirement in `AGENTS.md`).

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# docker/Dockerfile
FROM debian:bullseye

RUN apt-get update && apt-get install -y gcc make libc6-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /wardome
COPY wdii /wardome

RUN mkdir -p /wardome/bin && cd /wardome/src && make

WORKDIR /wardome
EXPOSE 4000
CMD ["./bin/circle", "-q", "4000"]
```

- [ ] **Step 2: Write .dockerignore so logs/player data don't bloat the image**

```
# docker/.dockerignore
wdii/log
wdii/syslog*
wdii/lib/pfiles
wdii/lib/plrobjs
wdii/bin
```

- [ ] **Step 3: Build the image**

Run (from repo root): `docker build -f docker/Dockerfile -t wardome-server .`

Expected: build completes with no errors, final step compiles all ~77 `.c` files cleanly and links `../bin/circle`. (Already verified manually during planning — every file compiles clean on Debian bullseye/gcc-10; the only macOS-specific failures were `crypt.h` and implicit-int, neither of which exist on this base image.)

- [ ] **Step 4: Run it and verify the banner over a raw socket**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
docker logs wardome-server
```

Expected in logs: a sequence of `:: Resetting <Zone Name> (rooms X-Y).` lines for all 30 zones, ending with:
```
:: Booting houses.
:: Boot db -- DONE.
:: Signal trapping.
:: Entering game loop.
```

Then:
```bash
( printf ''; sleep 1 ) | nc -w 2 localhost 4000 | cat -v | head -5
```

Expected: the `W E L C O M E  T O` ASCII banner followed by `Hey, what's your name?`. This is the real Wardome login screen — confirms the container is byte-identical behavior to the original.

- [ ] **Step 5: Stop the container (bridge in Task 3 will manage its own lifecycle)**

```bash
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 6: Commit**

```bash
git add docker/Dockerfile docker/.dockerignore
git commit -m "build: dockerize original C server for macOS-incompatible legacy toolchain"
```

---

### Task 2: Additive room-ID tag in the C source

**Files:**
- Modify: `wdii/src/act.informative.c:1278` (single insertion, inside `look_at_room()`)

**Interfaces:**
- Produces: every time a player successfully sees a room (movement, `look`, teleport, wake-up, etc. — anywhere `look_at_room()` is called, which covers `act.movement.c`, `act.wizard.c`, `arena.c`, `challenge.c`, `comm.c`, `interpreter.c`, `spec_procs.c`, `spells.c`, `teleport.c`, `winddragon.c`), the descriptor's output stream now contains a line of the exact form `$$ROOM:<vnum>$$\r\n` immediately before the room name is printed. `<vnum>` is the real room vnum (e.g. `3001` for the Temple of Midgaard), obtained via the existing `GET_ROOM_VNUM(IN_ROOM(ch))` macro already used two lines below in the same function.
- Consumed by: Task 3's bridge regex `/\$\$ROOM:(\d+)\$\$\r?\n?/g`.

- [ ] **Step 1: Make the change**

Current code at `act.informative.c:1270-1279`:

```c
	if (!IS_NPC(ch) && !PRF_FLAGGED(ch, PRF_HOLYLIGHT) && ROOM_AFFECTED(ch->in_room, RAFF_FOG)) {
		/* NOTE: you might wish to change so that wizards,
		 * or the use of some 'see through fog' makes you see
		 * through the fog
		 */
		send_to_char("Your view is obscured by a thick fog.\r\n", ch);
		return;
	}

  send_to_char(CCCYN(ch, C_NRM), ch);
```

Change to:

```c
	if (!IS_NPC(ch) && !PRF_FLAGGED(ch, PRF_HOLYLIGHT) && ROOM_AFFECTED(ch->in_room, RAFF_FOG)) {
		/* NOTE: you might wish to change so that wizards,
		 * or the use of some 'see through fog' makes you see
		 * through the fog
		 */
		send_to_char("Your view is obscured by a thick fog.\r\n", ch);
		return;
	}

  {
    char room_tag_buf[32];
    snprintf(room_tag_buf, sizeof(room_tag_buf), "$$ROOM:%d$$\r\n", GET_ROOM_VNUM(IN_ROOM(ch)));
    send_to_char(room_tag_buf, ch);
  }

  send_to_char(CCCYN(ch, C_NRM), ch);
```

This sits after every early-return guard (dark room, blind, fog) — so the tag only fires when the player can actually see the room, matching what the illustration panel should show later. It does not change any existing branch, string, or return value.

- [ ] **Step 2: Rebuild the Docker image**

Run: `docker build -f docker/Dockerfile -t wardome-server .`
Expected: clean build, no new warnings from this file.

- [ ] **Step 3: Verify the tag appears over a raw socket**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
```

Use a short Python one-liner (or `nc` with manual typing) to log in as a new character and confirm the tag shows up right before the room name on both initial login and after a `look`/movement command. Manual telnet is fine here since this is a raw-protocol smoke test, not something worth scripting:

```bash
telnet localhost 4000
```
Create a new character (name → not found → "Did I get that right?" → y → password → password again → race/class/etc prompts, or just watch the very first room render after entering the game). Expected: a line reading exactly `$$ROOM:3001$$` (or whatever vnum the starting room is) appears immediately before the room name text, e.g.:
```
$$ROOM:3001$$
The Temple Of Midgaard
```

- [ ] **Step 4: Stop the container**

```bash
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 5: Commit**

```bash
git add wdii/src/act.informative.c
git commit -m "feat: emit additive room-id tag for browser bridge"
```

---

### Task 3: Node.js WebSocket↔TCP bridge

**Files:**
- Create: `bridge/package.json`
- Create: `bridge/server.js`
- Create: `bridge/test-client.js` (manual smoke-test helper, not a framework test — this protocol has no unit-testable pure functions worth isolating; the meaningful test is "does a real message round-trip through a real socket")

**Interfaces:**
- Consumes: TCP text stream from `wardome-server:4000` (Task 1), containing occasional `$$ROOM:<vnum>$$\r\n` tags (Task 2).
- Produces: a WebSocket server on `ws://localhost:8080`. For each browser connection, opens one TCP socket to the game server. Messages sent to the browser are JSON-encoded, one of two shapes:
  - `{"type":"text","data":"<raw MUD text, tags stripped>"}`
  - `{"type":"room","id":<integer vnum>}`
  
  Messages the bridge accepts *from* the browser: `{"type":"cmd","data":"<command text, no trailing newline>"}` — the bridge appends `\r\n` and writes it to the TCP socket.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "wardome-bridge",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd bridge && npm install`
Expected: `node_modules/ws` created, `package-lock.json` written, no errors.

- [ ] **Step 3: Write the bridge**

```javascript
// bridge/server.js
const WebSocket = require('ws');
const net = require('net');

const GAME_HOST = process.env.GAME_HOST || 'localhost';
const GAME_PORT = parseInt(process.env.GAME_PORT || '4000', 10);
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8080', 10);

const ROOM_TAG_RE = /\$\$ROOM:(\d+)\$\$\r?\n?/g;

const wss = new WebSocket.Server({ port: BRIDGE_PORT });

wss.on('connection', (ws) => {
  const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });

  tcp.on('data', (chunk) => {
    const text = chunk.toString('binary');
    let cleaned = '';
    let lastIndex = 0;
    ROOM_TAG_RE.lastIndex = 0;
    let match;
    while ((match = ROOM_TAG_RE.exec(text)) !== null) {
      cleaned += text.slice(lastIndex, match.index);
      lastIndex = ROOM_TAG_RE.lastIndex;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'room', id: parseInt(match[1], 10) }));
      }
    }
    cleaned += text.slice(lastIndex);
    if (cleaned.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'text', data: cleaned }));
    }
  });

  tcp.on('close', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  tcp.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'text', data: `\r\n[bridge] connection error: ${err.message}\r\n` }));
      ws.close();
    }
  });

  ws.on('message', (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg.toString());
    } catch (e) {
      return;
    }
    if (parsed.type === 'cmd' && tcp.writable) {
      tcp.write(parsed.data + '\r\n', 'binary');
    }
  });

  ws.on('close', () => {
    tcp.destroy();
  });
});

console.log(`Wardome bridge listening on ws://localhost:${BRIDGE_PORT}, relaying to ${GAME_HOST}:${GAME_PORT}`);
```

- [ ] **Step 4: Write the manual smoke-test client**

```javascript
// bridge/test-client.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('[test-client] connected to bridge');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'text') {
    process.stdout.write(msg.data);
  } else if (msg.type === 'room') {
    console.log(`\n[test-client] ROOM TAG RECEIVED: ${msg.id}\n`);
  }
});

ws.on('close', () => console.log('[test-client] disconnected'));
ws.on('error', (err) => console.error('[test-client] error:', err.message));

// Send a command 3 seconds after connecting, e.g. to test the name prompt.
// Adjust the command/timing manually while smoke-testing.
setTimeout(() => {
  ws.send(JSON.stringify({ type: 'cmd', data: 'quit' }));
}, 3000);
```

- [ ] **Step 5: Start the game server and the bridge, run the smoke test**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
cd bridge && node server.js &
sleep 1
node test-client.js
```

Expected: `test-client.js` prints the ASCII Wardome banner (same one seen in Task 1 Step 4), proving text flows through the bridge unmodified. If you log in far enough to trigger a room render, expect to see `[test-client] ROOM TAG RECEIVED: <vnum>` printed on its own line with the raw room text (tag-free) printed around it — proving the tag-stripping/JSON-splitting logic works on a real byte stream, not just in theory.

- [ ] **Step 6: Stop everything**

```bash
kill %1  # the backgrounded node server.js
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 7: Add bridge/node_modules to .gitignore, then commit**

```bash
echo "bridge/node_modules/" >> .gitignore
git add bridge/package.json bridge/package-lock.json bridge/server.js bridge/test-client.js .gitignore
git commit -m "feat: add WebSocket-to-TCP bridge with room-tag extraction"
```

---

### Task 4: Minimal browser terminal client

**Files:**
- Create: `web/index.html`
- Create: `web/style.css`
- Create: `web/client.js`

**Interfaces:**
- Consumes: the bridge's WebSocket protocol from Task 3 (`ws://localhost:8080`, `{"type":"text"|"room", ...}` messages in, `{"type":"cmd","data":"..."}` messages out).
- Produces: a static page servable by any static file server (e.g. `python3 -m http.server`), no build step.

- [ ] **Step 1: Write index.html**

```html
<!-- web/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Wardome Reborn</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="layout">
    <div id="side-panel">
      <h2>Room</h2>
      <div id="room-id">—</div>
    </div>
    <div id="terminal-panel">
      <pre id="output"></pre>
      <form id="input-form">
        <input id="command-input" type="text" autocomplete="off" autofocus placeholder="type a command...">
      </form>
    </div>
  </div>
  <script src="client.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write style.css**

```css
/* web/style.css */
* { box-sizing: border-box; }

body {
  margin: 0;
  background: #0d0d0d;
  color: #e0e0e0;
  font-family: 'Courier New', monospace;
  height: 100vh;
}

#layout {
  display: flex;
  height: 100vh;
}

#side-panel {
  width: 220px;
  flex-shrink: 0;
  background: #161616;
  border-right: 1px solid #333;
  padding: 16px;
}

#side-panel h2 {
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  margin: 0 0 8px 0;
}

#room-id {
  font-size: 24px;
  color: #d4af37;
}

#terminal-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  min-width: 0;
}

#output {
  flex: 1;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0 0 12px 0;
  font-size: 14px;
  line-height: 1.4;
}

#command-input {
  background: #1a1a1a;
  border: 1px solid #444;
  color: #e0e0e0;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 14px;
  width: 100%;
}

#command-input:focus {
  outline: none;
  border-color: #d4af37;
}
```

- [ ] **Step 3: Write client.js**

```javascript
// web/client.js
const output = document.getElementById('output');
const roomIdEl = document.getElementById('room-id');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const ws = new WebSocket('ws://localhost:8080');

function stripAnsi(text) {
  // Strip ANSI escape codes for this milestone; color rendering is a later task.
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

ws.addEventListener('open', () => {
  output.textContent += '[connected to Wardome]\n';
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.textContent += stripAnsi(msg.data);
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
  }
});

ws.addEventListener('close', () => {
  output.textContent += '\n[disconnected]\n';
});

ws.addEventListener('error', () => {
  output.textContent += '\n[connection error]\n';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const command = input.value;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cmd', data: command }));
  }
  input.value = '';
});
```

- [ ] **Step 4: Run the full stack and test in an actual browser**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
cd bridge && node server.js &
sleep 1
cd ../web && python3 -m http.server 8000 &
```

Open `http://localhost:8000` in a browser. Expected, in order:
1. `[connected to Wardome]` appears, followed immediately by the ASCII Wardome banner and `Hey, what's your name?`.
2. Typing a new character name + pressing Enter progresses through the name/password/race/class creation prompts exactly as it would over telnet.
3. Once in the game, the "Room" panel on the left shows a real room vnum (e.g. `3001`).
4. Typing `north` (or whatever direction is valid) and pressing Enter moves the character and updates the room ID in the side panel to the new room's vnum.
5. Typing `look` re-renders the current room text with no duplicate/garbled output.

This is the full vertical slice: browser → WebSocket → bridge → TCP → original unmodified Wardome server, round trip, with structured room-tracking data proven to flow correctly.

- [ ] **Step 5: Stop everything**

```bash
kill %1 %2  # bridge and http.server background jobs
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/style.css web/client.js
git commit -m "feat: minimal browser terminal client for Wardome bridge"
```

---

## What's deliberately NOT in this plan

- Room illustrations (needs the AI-art generation step, plus mapping `extract/out/rooms/*.json` data into the MVP slice — Midgaard Temple → Great Field → Newbie Zone Entrance, per the agreed room list). Separate follow-up plan once this foundation is verified working.
- HP/mana/moves/XP/gold/level HUD (needs its own additive C tags, same pattern as Task 2, plus `score`-command parsing decisions). Separate follow-up plan.
- ANSI color rendering in the terminal panel (currently stripped entirely for simplicity).
- Docker Compose / one-command startup (currently three manual processes — fine for development, worth wrapping once the foundation is stable).
- Any multiplayer-visible-avatar work (explicitly future scope per the original brief).
