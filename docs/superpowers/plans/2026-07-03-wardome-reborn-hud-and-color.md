# Wardome Reborn — HUD and ANSI Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live HP/mana/moves/level/gold/experience HUD in the browser side panel, and render the original server's ANSI color output as real color in the browser terminal instead of stripping it.

**Architecture:** Two independent additions to the existing pipeline. (1) HUD: a second additive C tag — `$$STATS:hp/maxHp/mana/maxMana/move/maxMove/exp/gold/level$$` — emitted on every prompt via `write_to_descriptor()` inside `make_prompt()` in `wdii/src/comm.c` (mirrors the room-tag pattern from the foundation plan, but hooks a different, higher-frequency point: `make_prompt()` runs after every single command, so the HUD updates every turn, not just on room look). The bridge gains a second tag-extraction regex and emits `{"type":"stats", ...}` JSON messages; the client renders three bars (HP/MP/MV) plus a level/gold/exp line. (2) ANSI color: the original server already emits real ANSI SGR codes (`\x1B[0;37m` etc., defined in `wdii/src/screen.h`) whenever a player has color enabled (character-creation choice, or the in-game `color` command) — nothing server-side needs to change for this. The client currently strips every SGR code (`web/client.js`'s `stripAnsi`); this plan replaces that with a small ANSI-to-HTML converter that turns colored server output into styled `<span>` elements in the terminal panel.

**Tech Stack:** C (additive-only change to `wdii/src/comm.c`, same constraint as the room tag), Node.js (bridge regex extraction, no new dependency), plain HTML/CSS/JS (client HUD rendering + ANSI parsing, no framework, no build step).

## Global Constraints

- The only permitted change to `wdii/src/*.c` or `*.h` in this plan is the single additive block in Task 1 (mirrors the room tag's precedent — additive `write_to_descriptor()` call, zero changes to existing game logic, prompt text, or preference-flag behavior). No default preference flags may be changed (e.g. do not force ANSI-on for new characters — that's an existing player choice via character creation or the `color` command, out of scope to touch).
- `web/` stays dependency-free (no npm install, no bundler).
- `bridge/server.js`'s existing room-tag extraction logic may be refactored into a shared helper to avoid duplicating the same loop for two tag types (DRY) — this is the one allowed non-additive change, confined entirely to `bridge/`, never touching `wdii/src`.
- The stats tag's 9 numeric fields, in order, are: `hp, maxHp, mana, maxMana, move, maxMove, exp, gold, level` — this exact order and field count must match across the C emitter, the bridge regex/JSON, and the client consumer. A mismatch anywhere in this chain silently corrupts the HUD.
- Every task must end in a state that builds and runs — verify with the literal commands in each task.
- Never commit unless explicitly instructed.

---

### Task 1: Additive HP/mana/moves/exp/gold/level tag in the C source

**Files:**
- Modify: `wdii/src/comm.c:1208` (single insertion, inside `make_prompt()`)

**Interfaces:**
- Produces: every time a playing, non-NPC character's prompt is generated (i.e. after every command — `make_prompt()` is called from the main loop at `comm.c:924`, `write_to_descriptor(d->descriptor, make_prompt(d));`), the descriptor's output stream now also contains a line of the exact form `$$STATS:<hp>/<maxHp>/<mana>/<maxMana>/<move>/<maxMove>/<exp>/<gold>/<level>$$\r\n` immediately before the existing prompt text. All 9 values come from existing macros already used elsewhere in this same file/codebase: `GET_HIT`, `GET_MAX_HIT`, `GET_MANA`, `GET_MAX_MANA`, `GET_MOVE`, `GET_MAX_MOVE`, `GET_EXP`, `GET_GOLD`, `GET_LEVEL` (all defined in `wdii/src/utils.h`).
- Consumed by: Task 2's bridge regex `/\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\$\$\r?\n?/g`.

- [ ] **Step 1: Make the change**

Current code at `wdii/src/comm.c:1207-1211`:

```c
  else if (STATE(d) == CON_PLAYING && !IS_NPC(d->character)) {
    *prompt = '\0';

   if(PRF_FLAGGED(d->character, PRF_INFO_START))
      sprintf(prompt, "%sDigite/Type [INFO]%s ", CCBYEL(d->character, C_NRM), KNRM);
```

Change to:

```c
  else if (STATE(d) == CON_PLAYING && !IS_NPC(d->character)) {

    {
      char stats_tag_buf[160];
      snprintf(stats_tag_buf, sizeof(stats_tag_buf),
        "$$STATS:%d/%d/%d/%d/%d/%d/%d/%d/%d$$\r\n",
        GET_HIT(d->character), GET_MAX_HIT(d->character),
        GET_MANA(d->character), GET_MAX_MANA(d->character),
        GET_MOVE(d->character), GET_MAX_MOVE(d->character),
        GET_EXP(d->character), GET_GOLD(d->character), GET_LEVEL(d->character));
      write_to_descriptor(d->descriptor, stats_tag_buf);
    }

    *prompt = '\0';

   if(PRF_FLAGGED(d->character, PRF_INFO_START))
      sprintf(prompt, "%sDigite/Type [INFO]%s ", CCBYEL(d->character, C_NRM), KNRM);
```

This is a standalone scoped block (its own `{ }`) that writes directly to the socket via `write_to_descriptor` — it does not touch the `prompt` buffer or any of the existing conditional prompt-building logic below it (`PRF_INFO_START`/`PRF_AFK`/`PLR_DEAD`/`PRF_DISPHP`/etc.), exactly mirroring how the room tag's block in `act.informative.c` is a standalone addition that doesn't alter surrounding logic. `write_to_descriptor` is already used elsewhere in this same file before its own definition (e.g. `comm.c:392`), so no forward declaration is needed — this codebase's existing K&R-style compilation already relies on that.

- [ ] **Step 2: Rebuild the Docker image**

Run: `docker build -f docker/Dockerfile -t wardome-server .`
Expected: clean build, no new warnings from `comm.c`.

- [ ] **Step 3: Verify the tag appears over a raw socket**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
telnet localhost 4000
```

Log in with any existing character (or create one — alphabetic name only, no digits). Expected: immediately after entering the game and after every subsequent command (e.g. `look`, `north`), a line reading exactly `$$STATS:<hp>/<maxHp>/<mana>/<maxMana>/<move>/<maxMove>/<exp>/<gold>/<level>$$` appears right before the normal prompt line, e.g.:
```
$$STATS:20/20/100/100/82/82/0/0/1$$
Digite/Type [INFO] >
```
Confirm the numbers are real (not zero/garbage) and change after taking an action that should change them (e.g. `north` doesn't change hp/mana/move for a healthy character, but moving does cost `move` points on some CircleMUD builds — if `move` doesn't visibly drop, that's fine, just confirm the tag's format and presence, not a specific gameplay mechanic).

- [ ] **Step 4: Stop the container**

```bash
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 5: Commit**

```bash
git add wdii/src/comm.c
git commit -m "feat: emit additive HP/mana/moves/exp/gold/level tag for browser HUD"
```

---

### Task 2: Bridge extraction of the stats tag

**Files:**
- Modify: `bridge/server.js`

**Interfaces:**
- Consumes: TCP text stream from `wardome-server:4000` (Task 1), containing `$$STATS:<hp>/<maxHp>/<mana>/<maxMana>/<move>/<maxMove>/<exp>/<gold>/<level>$$\r\n` tags interleaved with the existing `$$ROOM:<vnum>$$\r\n` tags and normal game text.
- Produces: in addition to the existing `{"type":"text",...}` and `{"type":"room","id":<int>}` messages, a new message shape sent to the browser: `{"type":"stats","hp":<int>,"maxHp":<int>,"mana":<int>,"maxMana":<int>,"move":<int>,"maxMove":<int>,"exp":<int>,"gold":<int>,"level":<int>}`.

- [ ] **Step 1: Refactor the tag-extraction loop into a shared helper, add the stats regex**

Current `bridge/server.js`:

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

Change to:

```javascript
// bridge/server.js
const WebSocket = require('ws');
const net = require('net');

const GAME_HOST = process.env.GAME_HOST || 'localhost';
const GAME_PORT = parseInt(process.env.GAME_PORT || '4000', 10);
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8080', 10);

const ROOM_TAG_RE = /\$\$ROOM:(\d+)\$\$\r?\n?/g;
const STATS_TAG_RE = /\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\$\$\r?\n?/g;

const wss = new WebSocket.Server({ port: BRIDGE_PORT });

function extractTag(text, re, onMatch) {
  let cleaned = '';
  let lastIndex = 0;
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    cleaned += text.slice(lastIndex, match.index);
    lastIndex = re.lastIndex;
    onMatch(match);
  }
  cleaned += text.slice(lastIndex);
  return cleaned;
}

wss.on('connection', (ws) => {
  const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });

  tcp.on('data', (chunk) => {
    const text = chunk.toString('binary');

    let cleaned = extractTag(text, ROOM_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'room', id: parseInt(match[1], 10) }));
      }
    });

    cleaned = extractTag(cleaned, STATS_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stats',
          hp: parseInt(match[1], 10),
          maxHp: parseInt(match[2], 10),
          mana: parseInt(match[3], 10),
          maxMana: parseInt(match[4], 10),
          move: parseInt(match[5], 10),
          maxMove: parseInt(match[6], 10),
          exp: parseInt(match[7], 10),
          gold: parseInt(match[8], 10),
          level: parseInt(match[9], 10),
        }));
      }
    });

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

- [ ] **Step 2: Start the game server and bridge, run the existing manual smoke-test client**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
cd bridge && node server.js &
sleep 1
node test-client.js
```

(`bridge/test-client.js` already exists from the foundation plan — it connects, logs whatever comes over the WebSocket, and sends `quit` after 3 seconds.) Expected: the banner prints as before (proving room-tag extraction still works unchanged), and if you extend the 3-second window enough to log in and see a prompt (edit the `setTimeout` delay or drive it manually), you should see a `stats` message logged as raw JSON text mixed in with the banner text (the test client just does `process.stdout.write(msg.data)` for `type:'text'` and doesn't have special handling for `type:'stats'` — that's fine, this step just proves the bridge doesn't crash and still relays `text`/`room` messages correctly with the new code path added; Task 3's browser client is the first consumer that visually renders `stats` messages).

- [ ] **Step 3: Stop everything**

```bash
kill %1  # backgrounded node server.js
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 4: Commit**

```bash
git add bridge/server.js
git commit -m "feat: extract HUD stats tag in the bridge, refactor tag extraction into a shared helper"
```

---

### Task 3: HUD display in the browser client

**Files:**
- Modify: `web/index.html`
- Modify: `web/style.css`
- Modify: `web/client.js`

**Interfaces:**
- Consumes: `{"type":"stats","hp":<int>,"maxHp":<int>,"mana":<int>,"maxMana":<int>,"move":<int>,"maxMove":<int>,"exp":<int>,"gold":<int>,"level":<int>}` WebSocket messages (Task 2).
- Produces: no new interfaces — this is the terminal UI update.

- [ ] **Step 1: Add the HUD markup to the side panel**

Current `web/index.html:9-15`:

```html
  <div id="layout">
    <div id="side-panel">
      <img id="room-art" src="assets/rooms/placeholder.jpg" alt="Room illustration">
      <h2>Room</h2>
      <div id="room-id">—</div>
    </div>
```

Change to:

```html
  <div id="layout">
    <div id="side-panel">
      <img id="room-art" src="assets/rooms/placeholder.jpg" alt="Room illustration">
      <h2>Room</h2>
      <div id="room-id">—</div>
      <h2 class="hud-heading">Status</h2>
      <div id="hud">
        <div class="stat-bar-row">
          <span class="stat-label">HP</span>
          <div class="stat-bar"><div id="hp-bar-fill" class="stat-bar-fill"></div></div>
          <span id="hp-text" class="stat-value">—/—</span>
        </div>
        <div class="stat-bar-row">
          <span class="stat-label">MP</span>
          <div class="stat-bar"><div id="mana-bar-fill" class="stat-bar-fill"></div></div>
          <span id="mana-text" class="stat-value">—/—</span>
        </div>
        <div class="stat-bar-row">
          <span class="stat-label">MV</span>
          <div class="stat-bar"><div id="move-bar-fill" class="stat-bar-fill"></div></div>
          <span id="move-text" class="stat-value">—/—</span>
        </div>
        <div id="stat-line">Lvl — · — gold · — exp</div>
      </div>
    </div>
```

- [ ] **Step 2: Style the HUD**

Append to `web/style.css` (after the existing `#room-id` rule, `web/style.css:44-47`):

```css
.hud-heading {
  margin-top: 16px;
}

#hud {
  font-size: 12px;
}

.stat-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.stat-label {
  width: 24px;
  color: #888;
  font-weight: bold;
}

.stat-bar {
  flex: 1;
  height: 10px;
  background: #0d0d0d;
  border: 1px solid #333;
  border-radius: 3px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  width: 0%;
  background-color: #4caf50;
  transition: width 0.2s ease, background-color 0.2s ease;
}

.stat-value {
  width: 70px;
  text-align: right;
  color: #ccc;
  font-size: 11px;
}

#stat-line {
  margin-top: 8px;
  color: #aaa;
}
```

- [ ] **Step 3: Render stats messages**

Current `web/client.js:1-14`:

```javascript
// web/client.js
const output = document.getElementById('output');
const roomIdEl = document.getElementById('room-id');
const roomArtEl = document.getElementById('room-art');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const ws = new WebSocket('ws://localhost:8080');

const MVP_ROOM_ART = new Set([3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603]);

function setRoomArt(id) {
  roomArtEl.src = MVP_ROOM_ART.has(id) ? `assets/rooms/${id}.jpg` : 'assets/rooms/placeholder.jpg';
}
```

Change to:

```javascript
// web/client.js
const output = document.getElementById('output');
const roomIdEl = document.getElementById('room-id');
const roomArtEl = document.getElementById('room-art');
const hpBarFillEl = document.getElementById('hp-bar-fill');
const hpTextEl = document.getElementById('hp-text');
const manaBarFillEl = document.getElementById('mana-bar-fill');
const manaTextEl = document.getElementById('mana-text');
const moveBarFillEl = document.getElementById('move-bar-fill');
const moveTextEl = document.getElementById('move-text');
const statLineEl = document.getElementById('stat-line');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const ws = new WebSocket('ws://localhost:8080');

const MVP_ROOM_ART = new Set([3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603]);

function setRoomArt(id) {
  roomArtEl.src = MVP_ROOM_ART.has(id) ? `assets/rooms/${id}.jpg` : 'assets/rooms/placeholder.jpg';
}

function barColor(pct) {
  if (pct > 0.5) return '#4caf50';
  if (pct > 0.25) return '#d4af37';
  return '#e05252';
}

function setBar(fillEl, textEl, current, max) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  fillEl.style.width = `${pct * 100}%`;
  fillEl.style.backgroundColor = barColor(pct);
  textEl.textContent = `${current}/${max}`;
}

function setStats(stats) {
  setBar(hpBarFillEl, hpTextEl, stats.hp, stats.maxHp);
  setBar(manaBarFillEl, manaTextEl, stats.mana, stats.maxMana);
  setBar(moveBarFillEl, moveTextEl, stats.move, stats.maxMove);
  statLineEl.textContent = `Lvl ${stats.level} · ${stats.gold} gold · ${stats.exp} exp`;
}
```

Then, current `web/client.js:32-41` (the message handler):

```javascript
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.textContent += stripAnsi(msg.data);
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
    setRoomArt(msg.id);
  }
});
```

Change to:

```javascript
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.textContent += stripAnsi(msg.data);
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
    setRoomArt(msg.id);
  } else if (msg.type === 'stats') {
    setStats(msg);
  }
});
```

(`stripAnsi` here is unchanged in this task — Task 4 replaces it. Keep it exactly as-is for this task so the two tasks stay independently testable.)

- [ ] **Step 4: Run the full stack and verify the HUD updates live in a real browser**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
cd bridge && node server.js &
sleep 1
cd ../web && python3 -m http.server 8000 &
```

Open `http://localhost:8000`, log in / create a character. Expected:
1. Before entering the game, the HUD bars show `—/—` and the stat line shows `Lvl — · — gold · — exp` (the HTML's initial static content).
2. As soon as you're in the game (after the first prompt), all three bars fill in with real values and the stat line shows real `Lvl`/`gold`/`exp` numbers — a fresh level-1 warrior should show something like `HP 20/20`, `MV 82/82`, `Lvl 1 · 0 gold · 0 exp` (exact numbers depend on race/class rolled).
3. Fight something (e.g. a newbie-zone mob) or take damage — the HP bar should visibly shrink and change color (green above 50%, yellow 25-50%, red below 25%) after the next prompt.
4. HUD updates on every command, not just room changes — typing `look` twice in a row with no state change should re-render the same values without errors.

- [ ] **Step 5: Stop everything**

```bash
kill %1 %2
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/style.css web/client.js
git commit -m "feat: render live HP/mana/moves/level/gold/exp HUD in the browser side panel"
```

---

### Task 4: Render ANSI color instead of stripping it

**Files:**
- Modify: `web/client.js`

**Interfaces:**
- Consumes: raw `msg.data` text from `{"type":"text",...}` messages (unchanged from the bridge — the bridge has never stripped ANSI, `web/client.js`'s `stripAnsi` function was always the only thing removing it).
- Produces: no new interfaces — replaces plain-text terminal rendering with styled HTML rendering.

- [ ] **Step 1: Replace `stripAnsi` with an ANSI-to-HTML converter**

Current `web/client.js` (the `stripAnsi` function, as it exists after Task 3):

```javascript
function stripAnsi(text) {
  // Strip ANSI escape codes for this milestone; color rendering is a later task.
  // Also strip raw Telnet IAC negotiation sequences (e.g. IAC WILL/WONT/DO/DONT ECHO)
  // that the bridge passes through unmodified; without this they render as garbage
  // characters around prompts like "Password:". Real password masking (switching the
  // input to type="password" based on server echo state) is out of scope here and is
  // deferred alongside the ANSI-color work.
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\xff[\xfb-\xfe]./g, '');
}
```

Change to:

```javascript
// Maps the 8 base ANSI foreground color codes used by wdii/src/screen.h
// (KRED=31, KGRN=32, ... KWHT=37, both normal "0;NN" and bold "1;NN" forms)
// to colors that stay readable on this terminal's dark background.
const ANSI_COLORS = {
  30: '#6b6b6b',
  31: '#e05252',
  32: '#4caf50',
  33: '#d4af37',
  34: '#4a90d9',
  35: '#b366cc',
  36: '#4dd0c4',
  37: '#e0e0e0',
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripTelnetIac(text) {
  // Raw Telnet IAC negotiation sequences (e.g. IAC WILL/WONT/DO/DONT ECHO) that the
  // bridge passes through unmodified; without this they render as garbage characters
  // around prompts like "Password:". Real password masking (switching the input to
  // type="password" based on server echo state) is a separate, still-deferred task.
  return text.replace(/\xff[\xfb-\xfe]./g, '');
}

function ansiToHtml(rawText) {
  const text = stripTelnetIac(rawText);
  const parts = text.split(/(\x1b\[[0-9;]*[A-Za-z])/);
  let html = '';
  let openSpan = false;
  let bold = false;
  let dim = false;
  let underline = false;
  let color = null;

  for (const part of parts) {
    if (/^\x1b\[[0-9;]*[A-Za-z]$/.test(part)) {
      if (!part.endsWith('m')) {
        continue; // non-SGR CSI sequence (e.g. clear-screen "\x1b[2J"), drop it
      }
      const codes = part.slice(2, -1).split(';').filter(Boolean).map(Number);
      const effectiveCodes = codes.length ? codes : [0];
      for (const code of effectiveCodes) {
        if (code === 0) {
          bold = false;
          dim = false;
          underline = false;
          color = null;
        } else if (code === 1) {
          bold = true;
        } else if (code === 2) {
          dim = true;
        } else if (code === 4) {
          underline = true;
        } else if (ANSI_COLORS[code]) {
          color = ANSI_COLORS[code];
        }
      }
      if (openSpan) {
        html += '</span>';
        openSpan = false;
      }
      const styles = [];
      if (color) styles.push(`color:${color}`);
      if (bold) styles.push('font-weight:bold');
      if (dim) styles.push('opacity:0.6');
      if (underline) styles.push('text-decoration:underline');
      if (styles.length > 0) {
        html += `<span style="${styles.join(';')}">`;
        openSpan = true;
      }
    } else if (part) {
      html += escapeHtml(part);
    }
  }
  if (openSpan) {
    html += '</span>';
  }
  return html;
}
```

- [ ] **Step 2: Use the converter in the message handler**

Current `web/client.js` (the `text` branch of the message handler, as it exists after Task 3):

```javascript
  if (msg.type === 'text') {
    output.textContent += stripAnsi(msg.data);
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
```

Change to:

```javascript
  if (msg.type === 'text') {
    output.insertAdjacentHTML('beforeend', ansiToHtml(msg.data));
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
```

`output.insertAdjacentHTML('beforeend', ...)` is safe here because `ansiToHtml` only ever emits `<span style="...">` wrapper tags it built itself (from a fixed, hardcoded set of CSS property names and hex-color/keyword values, never from server text) around HTML-escaped text content — the raw MUD text (which can include other players' `gossip`/`tell` input) is always passed through `escapeHtml` first, so no server-supplied text can inject markup.

- [ ] **Step 3: Run the full stack and verify colored output in a real browser**

```bash
docker run -d --name wardome-server -p 4000:4000 wardome-server
sleep 2
cd bridge && node server.js &
sleep 1
cd ../web && python3 -m http.server 8000 &
```

Open `http://localhost:8000`. Log in / create a character, choosing `a` for ANSI Terminal at the terminal-type prompt during character creation (if using an existing character created with `n` for Normal Terminal, type the `color` command once logged in instead — the server prints "IMPORTANT: You can change this using the color command on the game." at that same prompt, confirming this is the documented way to enable it after the fact). Expected:
1. With color enabled, the `Digite/Type [INFO] >` prompt (or whichever prompt text is active) renders in a visibly bright yellow color, not plain white — this comes from the server's own `CCBYEL` macro in `make_prompt()`, now rendered instead of stripped.
2. Room text rendered via `look_at_room()` (which calls `send_to_char(CCCYN(ch, C_NRM), ch)` right after the room tag) shows a cyan tint on room output.
3. No literal escape-code garbage (`\x1b[0;33m` etc.) is ever visible as text in the terminal panel — everything either renders as color or is cleanly invisible.
4. Typing a command with an intentionally malicious-looking payload, e.g. `say <script>alert(1)</script>`, and observing the message echoed back in the terminal panel: it must appear as literal escaped text (`<script>alert(1)</script>` displayed, not executed) — confirms `escapeHtml` is actually being applied to server-echoed text, not just to your own local assumptions about server behavior.
5. Confirm the HUD from Task 3 still updates correctly alongside colored text (the two tasks are independent code paths in the same message handler; this is a quick regression check, not new functionality).

- [ ] **Step 4: Stop everything**

```bash
kill %1 %2
docker stop wardome-server && docker rm wardome-server
```

- [ ] **Step 5: Commit**

```bash
git add web/client.js
git commit -m "feat: render ANSI color output as styled HTML instead of stripping it"
```

---

## What's deliberately NOT in this plan

- Mob/item illustrations, extraction-tooling fix for the missing `18605`-`18607`+ Newbie Zone rooms — unrelated to HUD/color, deferred per the room-illustrations plan.
- Forcing ANSI-on by default for new characters, or any other change to character-creation defaults — that's existing player-facing behavior, out of scope to touch (see Global Constraints).
- Real password masking (switching the input to `type="password"` based on server echo state) — still deferred, unrelated to color rendering (color and password-echo are both about terminal control codes but are handled by entirely different mechanisms in this codebase: SGR color codes vs. Telnet ECHO negotiation).
- Blink (`\x1B[5m`/`FLASH`) rendering — the codebase defines it but this plan doesn't implement CSS blink animation for it (YAGNI; the code silently consumes and ignores the code rather than leaking it as garbage text, which is the important part).
- Docker Compose / one-command startup — still deferred from the foundation plan.
- HUD bar color thresholds are a new browser-only design choice (green/yellow/red at 50%/25%), not a reproduction of the original telnet prompt's exact color thresholds (which used a single red/white cutoff at 10%) — the original prompt text itself is untouched and still available to players who prefer it.
