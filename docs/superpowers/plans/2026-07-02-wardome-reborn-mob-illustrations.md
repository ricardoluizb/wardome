# Mob Illustrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show AI-generated art for the 5 MVP mobs when a player looks at one (same side-panel slot the room art already uses), and improve room-art prompt fidelity + cross-room visual continuity by regenerating the 9 existing room images with richer, real-data-grounded prompts.

**Architecture:** A third additive C tag (`$$MOB:<vnum>$$`) fires from `look_at_char()` when the looked-at target is an NPC, mirroring the existing room tag's mechanism exactly. The bridge extracts it into a `{"type":"mob","id":...}` message using the existing `extractTag` helper. The browser client swaps the same `room-art` `<img>` to mob art on that message; the existing room-message handler already unconditionally restores room art on the next room view, so no new revert logic is needed. Separately, `tools/gen-room-art.js`'s prompt gains zone name + sector type, plus a same-segment seed + continuity/transition text mechanism (segments = contiguous runs of same-`sector` rooms along the fixed MVP walk order), and is re-run to regenerate all 9 room images in place. A new `tools/gen-mob-art.js` (same Pollinations.ai pattern) generates the 5 mob portraits + a mob placeholder.

**Tech Stack:** Same as the rest of the project — C (CircleMUD 3.0 fork), Node.js (bridge + one-shot art-gen scripts, no new dependencies), vanilla JS/HTML/CSS (browser client), Pollinations.ai (`https://image.pollinations.ai/prompt/...`, free, key-less).

## Global Constraints

- Never modify anything under `wdii/src` except the one additive block specified in Task 2 (the third and final permitted `wdii/src` change for this project, after the room tag and stats tag).
- No automated test suite for this project — manual/observational verification only. Every verification step below is a manual command + expected observable output.
- MVP mob slate (exact vnums, do not add or remove): Pit Beast `18601`, Newbie Monster `18602`, Newbie Guard `18604`, Annoying Newbie `18611`, Smart Newbie `18615` — all in zone `186` ("Newbie Zone").
- MVP room slate (exact vnums and order, do not add or remove): `3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603`.
- Item illustrations are out of scope for this plan (separate future spec).
- `web/client.js`'s mob art reuses the existing `room-art` `<img id="room-art">` element — no new DOM element, no new panel.

---

### Task 1: Room-art prompt enrichment + regeneration

**Files:**
- Modify: `tools/gen-room-art.js` (whole file — small enough to rewrite in full)

**Interfaces:**
- Consumes: `extract/out/rooms/<id>.json` (`zone_id`, `sector`, `name`, `description` — all already present), `extract/out/zones/<zone_id>.json` (`name` field, e.g. `{"id":30,"name":"Northern Midgaard Main City",...}`).
- Produces: `web/assets/rooms/{3001,3054,3059,3060,3061,18600,18601,18602,18603,placeholder}.jpg` — same filenames as before, overwritten in place. No other task depends on this one; it's independent of Tasks 2-5.

- [ ] **Step 1: Confirm the real sector values for the MVP room slate**

Run (from repo root):
```bash
for v in 3001 3054 3059 3060 3061 18600 18601 18602 18603; do
  python3 -c "import json; d=json.load(open('extract/out/rooms/$v.json')); print($v, d['zone_id'], d['sector'])"
done
```
Expected output (one line per room, `id zone_id sector`):
```
3001 30 0
3054 30 0
3059 30 1
3060 30 1
3061 30 1
18600 186 1
18601 186 0
18602 186 0
18603 186 0
```
This confirms 3 contiguous segments in walk order: `[3001,3054]` (sector 0), `[3059,3060,3061,18600]` (sector 1), `[18601,18602,18603]` (sector 0). Segments 1 and 3 share sector value 0 but are NOT adjacent in the walk, so they get independent seeds/continuity — do not merge them.

- [ ] **Step 2: Rewrite `tools/gen-room-art.js`**

```js
// tools/gen-room-art.js
const fs = require('fs');
const path = require('path');

const ROOM_IDS = [3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603];
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'rooms');
const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');

// Matches wdii/src/constants.c:176 sector_types[] exactly.
const SECTOR_NAMES = [
  'Inside', 'City', 'Field', 'Forest', 'Hills', 'Mountains',
  'Water (Swim)', 'Water (No Swim)', 'Underwater', 'In Flight',
];

const STYLE_SUFFIX =
  "dark fantasy RPG environment concept art, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, moody atmospheric lighting, painterly detail, " +
  "wide shot, no text, no UI, no people, no characters";

function loadRoom(id) {
  const room = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, `${id}.json`), 'utf8'));
  const zone = JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${room.zone_id}.json`), 'utf8'));
  return { id, sector: room.sector, name: room.name, zoneName: zone.name,
            desc: room.description.replace(/\s+/g, ' ').trim() };
}

// Groups ROOM_IDS into contiguous runs of equal `sector`, in walk order.
// Each segment shares one Pollinations seed (its first room's id) so the
// underlying image noise pattern stays anchored across the whole run.
function computeSegments(rooms) {
  const segments = [];
  for (const room of rooms) {
    const last = segments[segments.length - 1];
    if (last && last.sector === room.sector) {
      last.rooms.push(room);
    } else {
      segments.push({ sector: room.sector, seedId: room.id, rooms: [room] });
    }
  }
  return segments;
}

function continuityClause(segments, segIndex, roomIndexInSegment) {
  if (roomIndexInSegment > 0) {
    return 'Continuing the same environment as before, consistent architecture, materials, and lighting.';
  }
  if (segIndex === 0) {
    return '';
  }
  const prevSector = SECTOR_NAMES[segments[segIndex - 1].sector];
  const thisSector = SECTOR_NAMES[segments[segIndex].sector];
  return `Transitioning from ${prevSector} to ${thisSector}.`;
}

async function fetchImage(prompt, seed, outPath) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&seed=${seed}&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching seed ${seed}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-room-art] wrote ${outPath} (${buf.length} bytes)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rooms = ROOM_IDS.map(loadRoom);
  const segments = computeSegments(rooms);

  let segIndex = 0;
  for (const segment of segments) {
    for (let i = 0; i < segment.rooms.length; i++) {
      const room = segment.rooms[i];
      const clause = continuityClause(segments, segIndex, i);
      const sectorLine = `Sector: ${SECTOR_NAMES[room.sector]}.`;
      const prompt = [
        `${room.zoneName} — ${room.name}.`,
        sectorLine,
        room.desc,
        clause,
        STYLE_SUFFIX,
      ].filter(Boolean).join(' ');
      await fetchImage(prompt, segment.seedId, path.join(OUT_DIR, `${room.id}.jpg`));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    segIndex++;
  }

  const placeholderPrompt = `A foggy, dim, unmapped stone corridor fading into darkness. ${STYLE_SUFFIX}`;
  await fetchImage(placeholderPrompt, 0, path.join(OUT_DIR, 'placeholder.jpg'));

  console.log('[gen-room-art] done');
}

main().catch((err) => {
  console.error('[gen-room-art] failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Run it and verify**

Run: `node tools/gen-room-art.js`
Expected: 10 lines of `[gen-room-art] wrote ...` (9 rooms + placeholder), then `[gen-room-art] done`, exit code 0.

Then confirm files were actually overwritten (mtime is recent):
```bash
ls -la web/assets/rooms/*.jpg
```
Expected: all 10 files with a `mtime` from the last few minutes.

- [ ] **Step 4: Spot-check visual continuity**

Open `web/assets/rooms/3001.jpg` and `web/assets/rooms/3054.jpg` side by side (same segment, sector 0) — confirm they read as plausibly the same physical space (similar palette/architecture), not two unrelated scenes. Open `web/assets/rooms/3061.jpg` and `web/assets/rooms/18601.jpg` (segment boundary, sector 1 → sector 0) — confirm they read as a believable transition (different setting is expected here, that's correct).

- [ ] **Step 5: Commit**

```bash
git add tools/gen-room-art.js web/assets/rooms/
git commit -m "feat: enrich room-art prompts with zone/sector and cross-room continuity"
```

---

### Task 2: Mob C tag (`wdii/src/act.informative.c`)

**Files:**
- Modify: `wdii/src/act.informative.c:807` (top of `look_at_char`)

**Interfaces:**
- Consumes: `IS_NPC(i)` (macro, `wdii/src/utils.h:250`), `GET_MOB_VNUM(mob)` (macro, `wdii/src/utils.h:448-449`, returns the mob's vnum as an int, or `-1` if not actually a mob — never `-1` here since we gate on `IS_NPC`).
- Produces: a new telnet output line, `$$MOB:<vnum>$$\r\n`, written to the looking player's socket via `send_to_char` whenever they `look` at an NPC. Task 3 (bridge) parses this exact format.

- [ ] **Step 1: Add the additive tag block**

Open `wdii/src/act.informative.c`. Find `look_at_char` at line 807:

```c
void look_at_char(struct char_data * i, struct char_data * ch)
{
  int j, found;

  if (!ch->desc)
    return;

   if (i->player.description)
```

Change it to:

```c
void look_at_char(struct char_data * i, struct char_data * ch)
{
  int j, found;

  if (!ch->desc)
    return;

  if (IS_NPC(i)) {
    char mob_tag_buf[32];
    snprintf(mob_tag_buf, sizeof(mob_tag_buf), "$$MOB:%d$$\r\n", GET_MOB_VNUM(i));
    send_to_char(mob_tag_buf, ch);
  }

   if (i->player.description)
```

Only the 5 new lines (the `if (IS_NPC(i)) { ... }` block) are added — everything else in the function is untouched.

- [ ] **Step 2: Rebuild and verify via direct telnet (bypassing the bridge)**

Run (from repo root):
```bash
docker compose up -d --build
```
Expected: image rebuilds cleanly (no compiler errors/warnings from this change), container starts.

Connect directly and log in an existing or new short-named test character (see naming gotchas below), walk to a room with one of the 5 MVP mobs (e.g. `18601` has the Pit Beast), then `look pitbeast`:
```bash
telnet localhost 4000
```
Expected: right before the normal "You see nothing special about..." (or the mob's `player.description` text), a raw line `$$MOB:18601$$` appears — confirms the tag fires with the correct vnum. `look` at a normal player character (not a mob) should NOT show any `$$MOB:...$$` line.

Test-character naming reminder: alphabetic-only, no digits, and avoid any name containing the substring "war" (both cause the server to reject/hang on the name prompt) — reuse a short known-good name like `Testwalk` if you have one, or pick a new short alphabetic name.

- [ ] **Step 3: Commit**

```bash
git add wdii/src/act.informative.c
git commit -m "feat: emit additive mob-vnum tag when looking at an NPC"
```

---

### Task 3: Bridge mob-tag extraction (`bridge/server.js`)

**Files:**
- Modify: `bridge/server.js:9` (add a new regex constant), `bridge/server.js:33-51` (add one more `extractTag` call in the `tcp.on('data', ...)` handler)

**Interfaces:**
- Consumes: Task 2's `$$MOB:<vnum>$$\r\n` tag text; the existing `extractTag(text, re, onMatch)` helper (`bridge/server.js:15-25`, unchanged, already used for `ROOM_TAG_RE` and `STATS_TAG_RE`).
- Produces: a new WebSocket message shape sent to the browser, `{"type":"mob","id":<int>}` — same shape convention as the existing `{"type":"room","id":<int>}` message. Task 5 (client) consumes this exact shape.

- [ ] **Step 1: Add the regex constant**

In `bridge/server.js`, right after the existing tag regex constants:

```js
const ROOM_TAG_RE = /\$\$ROOM:(\d+)\$\$\r?\n?/g;
const STATS_TAG_RE = /\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\$\$\r?\n?/g;
const MOB_TAG_RE = /\$\$MOB:(\d+)\$\$\r?\n?/g;
```

- [ ] **Step 2: Extract it in the data handler**

In the `tcp.on('data', (chunk) => { ... })` handler, after the existing `STATS_TAG_RE` extraction block and before the final `if (cleaned.length > 0 ...)` check, add:

```js
    cleaned = extractTag(cleaned, MOB_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'mob', id: parseInt(match[1], 10) }));
      }
    });
```

(This chains onto the same `cleaned` variable the room/stats extraction already reassigns, so the `$$MOB:...$$` text is stripped from what eventually gets sent as `{"type":"text",...}`.)

- [ ] **Step 3: Verify with the existing test client**

Start the bridge (game server must already be up from Task 2's verification, or run `docker compose up -d`):
```bash
node bridge/server.js &
```
In another terminal, temporarily edit `bridge/test-client.js`'s logged message types to also print `mob`, or just run it as-is and watch stdout while manually connecting a second telnet session to send a `look <mob>` — simplest: run
```bash
node bridge/test-client.js
```
and, while it's connected, use a **second** connection (telnet or another `node bridge/test-client.js` instance logged into a character in the mob's room) to `look` at one of the 5 MVP mobs. Confirm the first client's stdout is unaffected (mob tag is per-connection, only the looking player's own socket receives it) — then repeat by having the *same* test-client session's character walk to a mob room and send `look <mob>` via the bridge (`ws.send(JSON.stringify({type:'cmd',data:'look pitbeast'}))`, adapting `test-client.js`'s existing `setTimeout` pattern). Confirm the console prints the mob's description text with no raw `$$MOB:...$$` noise, and check application-level (e.g. add a temporary `console.log` in `test-client.js`'s `ws.on('message', ...)` or inspect via a quick Node one-liner) that a `{"type":"mob","id":18601}` message actually arrived.

Kill the bridge afterward: `kill %1` (or the job number `node bridge/server.js` was started as).

- [ ] **Step 4: Commit**

```bash
git add bridge/server.js
git commit -m "feat: extract mob-vnum tag in the bridge"
```

---

### Task 4: Mob art generation (`tools/gen-mob-art.js`)

**Files:**
- Create: `tools/gen-mob-art.js`

**Interfaces:**
- Consumes: `extract/out/mobs/<vnum>.json` (`short_desc`, `long_desc`, `source_path` — used to derive the zone), `extract/out/zones/<zone_id>.json` (`name` field).
- Produces: `web/assets/mobs/{18601,18602,18604,18611,18615,placeholder}.jpg`. Task 5 (client) references these exact filenames.

- [ ] **Step 1: Confirm the mob JSON shape and zone derivation**

Run:
```bash
for v in 18601 18602 18604 18611 18615; do
  python3 -c "
import json, re
d = json.load(open('extract/out/mobs/$v.json'))
m = re.search(r'/(\d+)\.mob$', d['source_path'])
print($v, '| zone_id_from_path=', m.group(1) if m else None, '|', d['short_desc'], '|', d['long_desc'])
"
done
```
Expected: all 5 print `zone_id_from_path= 186`, with real `short_desc`/`long_desc` text (e.g. `18601 | zone_id_from_path= 186 | the pit beast | The big, ugly pit-beast is standing here sizing you up.`). This confirms the source-path regex is the right way to derive a mob's zone (mob JSON has no `zone_id` field, unlike room JSON).

- [ ] **Step 2: Write `tools/gen-mob-art.js`**

```js
// tools/gen-mob-art.js
const fs = require('fs');
const path = require('path');

const MOB_IDS = [18601, 18602, 18604, 18611, 18615];
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'mobs');
const MOBS_DIR = path.join(__dirname, '..', 'extract', 'out', 'mobs');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');

const STYLE_SUFFIX =
  "dark fantasy RPG creature portrait, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, dramatic lighting, painterly detail, " +
  "single creature centered, no text, no UI, no environment clutter";

function loadMob(id) {
  const mob = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, `${id}.json`), 'utf8'));
  const zoneMatch = mob.source_path.match(/\/(\d+)\.mob$/);
  const zoneId = zoneMatch ? zoneMatch[1] : null;
  const zone = zoneId
    ? JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${zoneId}.json`), 'utf8'))
    : null;
  return { id, shortDesc: mob.short_desc, longDesc: mob.long_desc,
           zoneName: zone ? zone.name : 'Unknown Zone' };
}

async function fetchImage(prompt, seed, outPath) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&seed=${seed}&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching seed ${seed}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-mob-art] wrote ${outPath} (${buf.length} bytes)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const id of MOB_IDS) {
    const mob = loadMob(id);
    const prompt = `${mob.zoneName}. ${mob.shortDesc} — ${mob.longDesc} ${STYLE_SUFFIX}`;
    await fetchImage(prompt, id, path.join(OUT_DIR, `${id}.jpg`));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const placeholderPrompt = `A shadowy, indistinct creature silhouette, details obscured by darkness. ${STYLE_SUFFIX}`;
  await fetchImage(placeholderPrompt, 0, path.join(OUT_DIR, 'placeholder.jpg'));

  console.log('[gen-mob-art] done');
}

main().catch((err) => {
  console.error('[gen-mob-art] failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Run it and verify**

Run: `node tools/gen-mob-art.js`
Expected: 6 lines of `[gen-mob-art] wrote ...` (5 mobs + placeholder), then `[gen-mob-art] done`, exit code 0.

```bash
ls -la web/assets/mobs/*.jpg
```
Expected: 6 files present. Open `web/assets/mobs/18601.jpg` and confirm it plausibly depicts "the pit beast" (a slimy black/green creature) rather than an unrelated scene.

- [ ] **Step 4: Commit**

```bash
git add tools/gen-mob-art.js web/assets/mobs/
git commit -m "feat: add mob-art generation tool and MVP mob illustrations"
```

---

### Task 5: Client mob-art display + live end-to-end verification

**Files:**
- Modify: `web/client.js:16-20` (add `MVP_MOB_ART`, add mob-art swap logic), `web/client.js:129-139` (handle the `mob` message type)

**Interfaces:**
- Consumes: Task 3's `{"type":"mob","id":<int>}` WebSocket message; Task 4's `web/assets/mobs/*.jpg` files; the existing `roomArtEl` (`web/client.js:4`, `const roomArtEl = document.getElementById('room-art')`).
- Produces: nothing further downstream — this is the last task in the plan.

- [ ] **Step 1: Add the MVP mob set and a `setMobArt` helper**

In `web/client.js`, right after the existing `MVP_ROOM_ART` line:

```js
const MVP_ROOM_ART = new Set([3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603]);
const MVP_MOB_ART = new Set([18601, 18602, 18604, 18611, 18615]);

function setRoomArt(id) {
  roomArtEl.src = MVP_ROOM_ART.has(id) ? `assets/rooms/${id}.jpg` : 'assets/rooms/placeholder.jpg';
}

function setMobArt(id) {
  roomArtEl.src = MVP_MOB_ART.has(id) ? `assets/mobs/${id}.jpg` : 'assets/mobs/placeholder.jpg';
}
```

(`setRoomArt` is shown unchanged above for context — only `MVP_MOB_ART` and `setMobArt` are new.)

- [ ] **Step 2: Handle the `mob` message type**

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
  }
});
```

No revert logic is needed here: the `room` branch above already runs `setRoomArt(msg.id)` unconditionally on every room view, so the next `look` or movement (which re-triggers `look_at_room` server-side) naturally overwrites `roomArtEl.src` back to room art.

- [ ] **Step 3: Live end-to-end verification**

Ensure all 3 dev processes are up (`./start.sh` from the previous plan, or manually `docker compose up -d --build`, `node bridge/server.js &`, `python3 -m http.server 8000 --directory web &`).

Using Playwright (or the available browser tool), open `http://localhost:8000`, create/log in a short alphabetic-name test character, walk to room `18601` (the Pit Beast's room — from the temple, this is reachable via the documented MVP path), and send `look pitbeast`.

Expected, in order:
1. The output pane shows the pit beast's description text with no raw `$$MOB:...$$` noise.
2. The side-panel image (`#room-art`) swaps from the room-18601 art to `assets/mobs/18601.jpg`.
3. Sending a plain `look` (re-looking at the room) swaps the image back to `assets/rooms/18601.jpg`.
4. Zero new browser console errors (the pre-existing favicon 404 is expected and not a regression).

- [ ] **Step 4: Commit**

```bash
git add web/client.js
git commit -m "feat: display mob art in the browser client on look"
```

---

## Explicitly out of scope (do not implement)

- Item illustrations (separate future spec).
- Any combat-triggered art (this plan only wires the look-triggered path).
- Per-instance mob art variation (art is per-vnum, matching the room-art precedent).
