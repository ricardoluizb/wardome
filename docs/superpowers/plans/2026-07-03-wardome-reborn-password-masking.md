# Password Masking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser client's command input actually mask typed characters (`type="password"`) during every real password prompt (login, new-character password + confirmation, in-game password change), instead of always showing plaintext.

**Architecture:** The game server already sends standard Telnet `IAC WILL ECHO` / `IAC WONT ECHO` byte sequences at every masked-input state (via `wdii/src/comm.c`'s existing, unmodified `echo_off()`/`echo_on()`) — no C changes needed. The bridge detects these two exact byte patterns (the only Telnet IAC sequences this codebase ever emits — confirmed via `grep`, only `echo_off`/`echo_on` reference `IAC`), strips them from the outgoing text, and emits a new `{"type":"echo","on":<bool>}` WebSocket message, following the same `extractTag`-based pattern already used for the room/stats/mob tags. The client toggles `input.type` between `"password"` and `"text"` on that message, and its old client-side `stripTelnetIac` workaround is removed since the bridge now handles this at the source.

**Tech Stack:** Same as the rest of the project — Node.js (bridge, no new dependencies), vanilla JS (browser client).

## Global Constraints

- No `wdii/src` changes in this plan — the C server already emits the exact bytes needed.
- No automated test suite for this project — manual/observational verification only.
- The bridge's `extractTag(text, re, onMatch)` helper (`bridge/server.js`) must be reused, not duplicated.
- Masking must apply generically to every masked-input state (login, new-char password + confirm, in-game password-change) — no per-state special-casing, since the bridge/client only react to the real signal, not to which menu triggered it.

---

### Task 1: Bridge echo-state detection

**Files:**
- Modify: `bridge/server.js` (add 2 regex constants near the existing tag regexes, add 1 `extractTag` call in the `tcp.on('data', ...)` handler)

**Interfaces:**
- Consumes: the existing `extractTag(text, re, onMatch)` helper (unchanged); the raw Telnet bytes `IAC WILL ECHO` = `0xFF 0xFB 0x01` and `IAC WONT ECHO` = `0xFF 0xFC 0x01` (the latter followed by 2 incidental `\r\n` bytes emitted by `wdii/src/comm.c`'s `echo_on()`, due to it reusing the `TELOPT_NAOFFD`/`TELOPT_NAOCRD` constants — which happen to equal 13/10 — as raw trailing bytes; these are eaten by the regex below so they don't leak as a stray blank line).
- Produces: a new WebSocket message shape, `{"type":"echo","on":<bool>}` — `on: false` means "mask input now" (server just suppressed local echo), `on: true` means "unmask input now" (server restored local echo). Task 2 (client) consumes this exact shape.

- [ ] **Step 1: Add the two regex constants**

In `bridge/server.js`, right after the existing `MOB_TAG_RE` line:

```js
const ROOM_TAG_RE = /\$\$ROOM:(\d+)\$\$\r?\n?/g;
const STATS_TAG_RE = /\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\$\$\r?\n?/g;
const MOB_TAG_RE = /\$\$MOB:(-?\d+)\$\$\r?\n?/g;
const ECHO_OFF_RE = /\xFF\xFB\x01/g;
const ECHO_ON_RE = /\xFF\xFC\x01\r?\n?/g;
```

- [ ] **Step 2: Extract both in the data handler**

In the `tcp.on('data', (chunk) => { ... })` handler, after the existing `MOB_TAG_RE` extraction block and before the final `if (cleaned.length > 0 ...)` check, add:

```js
    cleaned = extractTag(cleaned, ECHO_OFF_RE, () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'echo', on: false }));
      }
    });

    cleaned = extractTag(cleaned, ECHO_ON_RE, () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'echo', on: true }));
      }
    });
```

(These two callbacks ignore `match` entirely since there's no captured value to parse — unlike `ROOM_TAG_RE`/`MOB_TAG_RE`, which capture a vnum, these regexes just detect a fixed byte sequence.)

- [ ] **Step 3: Verify live via direct telnet + the bridge**

Start the game server and bridge:
```bash
docker compose up -d --build
node bridge/server.js &
```

Use `bridge/test-client.js` (existing, unmodified) as a base, or a quick adapted script, to connect via `ws://localhost:8080` and log the raw messages as they arrive while going through the name/password login prompts (create a short alphabetic test-character name, e.g. reuse `Showcase` if it already exists from the mob-illustrations testing, or pick a new short name — avoid digits and the substring "war"). Confirm you see, in order: a `{"type":"text",...}` message containing "Hey, what's your name?" (or similar), then after sending the name, a `{"type":"echo","on":false}` message arriving BEFORE the `{"type":"text",...}` message containing "Password:" — this ordering matters (mask before the prompt text renders). After sending the password and continuing past the masked prompt(s), confirm a `{"type":"echo","on":true}` message eventually arrives. Confirm no raw `\xFF`-prefixed bytes appear in any `{"type":"text",...}` message's `data` field.

- [ ] **Step 4: Commit**

```bash
git add bridge/server.js
git commit -m "feat: detect telnet echo on/off in the bridge for password masking"
```

---

### Task 2: Client input masking + cleanup

**Files:**
- Modify: `web/client.js` (add an `echo` message handler; remove `stripTelnetIac` and its call site in `ansiToHtml`)

**Interfaces:**
- Consumes: Task 1's `{"type":"echo","on":<bool>}` WebSocket message; the existing `const input = document.getElementById('command-input')` element (`web/client.js:12`).
- Produces: nothing further downstream — this is the last task in the plan.

- [ ] **Step 1: Remove `stripTelnetIac` and its call site**

In `web/client.js`, find:

```js
function stripTelnetIac(text) {
  // Raw Telnet IAC negotiation sequences (e.g. IAC WILL/WONT/DO/DONT ECHO) that the
  // bridge passes through unmodified; without this they render as garbage characters
  // around prompts like "Password:". Real password masking (switching the input to
  // type="password" based on server echo state) is a separate, still-deferred task.
  return text.replace(/\xff[\xfb-\xfe]./g, '');
}

function ansiToHtml(rawText) {
  const text = stripTelnetIac(rawText);
```

Replace with:

```js
function ansiToHtml(rawText) {
  const text = rawText;
```

(The bridge now strips these bytes at the source per Task 1, so this client-side workaround is dead code. The only remaining Telnet IAC sequences this codebase ever emits — `IAC WILL/WONT ECHO` — are exactly the two Task 1 now handles; confirmed via `grep -rn "(char) IAC" wdii/src/*.c` returning only `echo_off`/`echo_on`, so no other stray IAC bytes can reach the client.)

- [ ] **Step 2: Add the `echo` message handler**

Find the `ws.addEventListener('message', ...)` handler:

```js
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.insertAdjacentHTML('beforeend', ansiToHtml(msg.data));
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
    setRoomArt(msg.id);
  } else if (msg.type === 'mob') {
    setMobArt(msg.id);
  } else if (msg.type === 'stats') {
    setStats(msg);
  }
});
```

Add one more branch:

```js
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.insertAdjacentHTML('beforeend', ansiToHtml(msg.data));
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
    setRoomArt(msg.id);
  } else if (msg.type === 'mob') {
    setMobArt(msg.id);
  } else if (msg.type === 'stats') {
    setStats(msg);
  } else if (msg.type === 'echo') {
    input.type = msg.on ? 'text' : 'password';
  }
});
```

- [ ] **Step 3: Live end-to-end verification**

Bring up all 3 dev processes (`./start.sh`, or the 3 manual commands). Using Playwright (or the available browser tool), open `http://localhost:8000` and go through character login from scratch:

1. Send the character name — confirm the input is still `type="text"` (name isn't masked).
2. As soon as the "Password:" prompt appears, confirm (via `element.type` read, e.g. `document.getElementById('command-input').type`) that the input is now `"password"`.
3. Type the password and submit — confirm the command still round-trips correctly (you successfully log in), even though the input was masked while typing.
4. After the masked prompt(s) finish (past login, in the game or at the main menu), confirm the input reverts to `"password"` → `"text"` at the right moment — i.e., `element.type` reads `"text"` again once you're clearly past any password step.
5. If creating a brand-new character (not reusing an existing one), confirm the input re-masks correctly for BOTH the initial password prompt and the "Please retype password:" confirmation prompt.
6. Check browser console for errors (only the pre-existing favicon 404 is expected, not a regression).

- [ ] **Step 4: Commit**

```bash
git add web/client.js
git commit -m "feat: mask password input in the browser client using real telnet echo state"
```

---

## Explicitly out of scope (do not implement)

- Any `wdii/src` change (none needed — the server already emits the right bytes).
- Handling the theoretical mid-typing echo-state-change race (matches real telnet client behavior already, not a bug to engineer around).
- Browser autofill/password-manager interactions.
