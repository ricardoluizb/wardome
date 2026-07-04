# Equipment Paperdoll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Diablo 2-style equipment paperdoll overlay to the browser client — a button opens a silhouette of all 23 equipment slots, each showing the equipped item's icon bordered by its rarity color, with generic outline placeholders for empty slots or items without generated art yet.

**Architecture:** A new additive `$$EQUIP$$` tag in `comm.c`'s `make_prompt()` (same cadence/pattern as the existing `$$STATS$$` tag) reports `vnum:tier` for all 23 `WEAR_*` slots. The bridge parses and forwards it as a `type: 'equip'` WebSocket message. The client renders a CSS-grid silhouette overlay, resolving each slot's icon from `web/assets/items/<vnum>.jpg` with a graceful fallback to `web/assets/items/slots/<type>.jpg` (also used directly for empty slots). Icons are generated ahead of time via Pollinations.ai (free, no key) — 19 generic slot-type placeholders plus 290 unique per-item icons, the latter using prompts written by a dedicated Fable 5 subagent from each item's real extracted description.

**Tech Stack:** C (CircleMUD 3.0 fork), Node.js (bridge + tooling), Pollinations.ai image API, plain CSS grid, Docker (build/run for the C change).

## Global Constraints

- No changes to `roll_item_rarity()` or any other gameplay logic in `fight.c` — the new tag only reads the `short_description` prefix it already writes.
- Rarity tag prefixes (exact, from `wdii/src/fight.c:396,399,402`): `"&B[I]&n "` (Uncommon), `"&Y[R]&n "` (Rare), `"&R[L]&n "` (Legendary). No prefix match = Common.
- Wear slot order is fixed: `WEAR_LIGHT=0` through `WEAR_FLOAT=22` (`structs.h:421-443`), and the C tag, bridge array, and client `EQUIP_SLOTS` table must all use this exact same order — index `i` in every layer refers to the same slot.
- Empty slot vnum is `-1` (matches `NOTHING`, `structs.h:37`), also what `GET_OBJ_VNUM()` already returns for an invalid rnum (`utils.h:496-498`) — no new sentinel invented.
- Rarity border colors (exact hex, already used elsewhere in this client): tier 0 (Common) = `var(--gold-dim)`, tier 1 (Uncommon) = `#4a90d9`, tier 2 (Rare) = `#d4af37`, tier 3 (Legendary) = `#e05252`.
- Icon size: generate at 128x128 via Pollinations' `width`/`height` query params. Displayed at 64x64 in the overlay grid.
- Item icon generation scope: exactly the objects in `extract/out/objects/*.json` whose `header_raw`'s first field is `5` (WEAPON), `9` (ARMOR), or `11` (WORN) — 290 items total.
- Only touch `wdii/src/comm.c` in the C source (one new tag block in `make_prompt()`), no other gameplay files.
- No automated test suite for this project (locked decision) — verification is manual/observational: rebuild, reload, visually confirm in a browser.

---

### Task 1: `$$EQUIP$$` C tag

**Files:**
- Modify: `wdii/src/comm.c:1208-1222` (`make_prompt()`, the `CON_PLAYING` block that already emits `$$STATS$$`)

**Interfaces:**
- Produces: a `$$EQUIP:<v0>:<t0>|<v1>:<t1>|...|<v22>:<t22>$$\r\n` line written to the socket right after the existing `$$STATS$$` line, once per prompt. Consumed by Task 2's bridge regex.

- [ ] **Step 1: Add the `$$EQUIP$$` block**

Open `wdii/src/comm.c`. Find this existing block (lines 1208-1222):

```c
  else if (STATE(d) == CON_PLAYING && !IS_NPC(d->character)) {

    {
      char stats_tag_buf[160];
      int exp_to_level = (GET_LEVEL(d->character) >= LVL_IMMORT) ? 0 :
        level_exp(GET_REMORT(d->character), GET_LEVEL(d->character) + 1);
      snprintf(stats_tag_buf, sizeof(stats_tag_buf),
        "$$STATS:%d/%d/%d/%d/%d/%d/%d/%d/%d/%d$$\r\n",
        GET_HIT(d->character), GET_MAX_HIT(d->character),
        GET_MANA(d->character), GET_MAX_MANA(d->character),
        GET_MOVE(d->character), GET_MAX_MOVE(d->character),
        GET_EXP(d->character), GET_GOLD(d->character), GET_LEVEL(d->character),
        exp_to_level);
      write_to_descriptor(d->descriptor, stats_tag_buf);
    }
```

Immediately after that closing `}` (still inside the same `else if` block, before `*prompt = '\0';`), add:

```c
    {
      char equip_tag_buf[320];
      char equip_body[280];
      int w;
      equip_body[0] = '\0';
      for (w = 0; w < NUM_WEARS; w++) {
        struct obj_data *eq_obj = GET_EQ(d->character, w);
        int vnum = -1;
        int tier = 0;
        char slot_piece[16];
        if (eq_obj != NULL) {
          vnum = GET_OBJ_VNUM(eq_obj);
          if (!strncmp(eq_obj->short_description, "&B[I]&n ", 8))
            tier = 1;
          else if (!strncmp(eq_obj->short_description, "&Y[R]&n ", 8))
            tier = 2;
          else if (!strncmp(eq_obj->short_description, "&R[L]&n ", 8))
            tier = 3;
        }
        snprintf(slot_piece, sizeof(slot_piece), "%s%d:%d", (w == 0 ? "" : "|"), vnum, tier);
        strncat(equip_body, slot_piece, sizeof(equip_body) - strlen(equip_body) - 1);
      }
      snprintf(equip_tag_buf, sizeof(equip_tag_buf), "$$EQUIP:%s$$\r\n", equip_body);
      write_to_descriptor(d->descriptor, equip_tag_buf);
    }
```

- [ ] **Step 2: Rebuild and verify**

```bash
cd /Users/ricardobussacro/Documents/Wardome
docker compose up -d --build
```

Expected: image builds with no new compiler warnings/errors, container starts and stays `Up`.

Connect with a raw telnet client (or `nc localhost 4000`), log in an existing test character, and confirm a line like `$$EQUIP:-1:0|-1:0|...|-1:0$$` (23 `vnum:tier` pairs) appears after every command, right after the `$$STATS$$` line. If the character has any item equipped, that slot's entry should show the item's real vnum instead of `-1`.

- [ ] **Step 3: Commit**

```bash
git add wdii/src/comm.c
git commit -m "feat: emit additive \$\$EQUIP\$\$ tag reporting vnum+rarity tier per equipment slot"
```

---

### Task 2: Bridge relay

**Files:**
- Modify: `bridge/server.js:9-14` (tag regex constants), `bridge/server.js:37-65` (tag extraction in the `tcp.on('data', ...)` handler)

**Interfaces:**
- Consumes: the `$$EQUIP:...$$` line from Task 1.
- Produces: `{ type: 'equip', slots: [{ vnum: number, tier: number }, ...23 entries in WEAR_LIGHT..WEAR_FLOAT order] }` sent over the WebSocket. Consumed by Task 4's client code.

- [ ] **Step 1: Add the tag regex**

Find (`bridge/server.js:9-11`):

```js
const ROOM_TAG_RE = /\$\$ROOM:(\d+)\|(.+?)\$\$\r?\n?/g;
const STATS_TAG_RE = /\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\/(\d+)\$\$\r?\n?/g;
const MOB_TAG_RE = /\$\$MOB:(-?\d+)\$\$\r?\n?/g;
```

Add a new line right after:

```js
const EQUIP_TAG_RE = /\$\$EQUIP:([^$]+)\$\$\r?\n?/g;
```

- [ ] **Step 2: Parse and forward it**

Find this block (`bridge/server.js`, right after the `STATS_TAG_RE` extraction and before the `MOB_TAG_RE` extraction):

```js
    cleaned = extractTag(cleaned, MOB_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'mob', id: parseInt(match[1], 10) }));
      }
    });
```

Insert a new `extractTag` call for `EQUIP_TAG_RE` immediately before it (so the pipeline order is ROOM, STATS, EQUIP, MOB):

```js
    cleaned = extractTag(cleaned, EQUIP_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        const slots = match[1].split('|').map((pair) => {
          const [vnum, tier] = pair.split(':').map((n) => parseInt(n, 10));
          return { vnum, tier };
        });
        ws.send(JSON.stringify({ type: 'equip', slots }));
      }
    });

    cleaned = extractTag(cleaned, MOB_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'mob', id: parseInt(match[1], 10) }));
      }
    });
```

- [ ] **Step 3: Restart and verify**

```bash
cd /Users/ricardobussacro/Documents/Wardome
pkill -f "node bridge/server.js"
nohup node bridge/server.js > /tmp/bridge.log 2>&1 &
cat /tmp/bridge.log
```

Expected: `Wardome bridge listening on ws://localhost:8080, relaying to localhost:4000` with no errors.

Open the browser client, open DevTools console, and run:

```js
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'equip') console.log(m.slots.length, m.slots);
});
```

Log in and confirm a log line with `23` and an array of 23 `{vnum, tier}` objects appears after each command.

- [ ] **Step 4: Commit**

```bash
git add bridge/server.js
git commit -m "feat: relay \$\$EQUIP\$\$ tag as a structured equip WebSocket message"
```

---

### Task 3: Generate the 19 empty-slot placeholder icons

**Files:**
- Create: `tools/gen-item-icons.js`
- Create (generated by running the script): `web/assets/items/slots/*.jpg` (19 files)

**Interfaces:**
- Produces: `web/assets/items/slots/<type>.jpg` for each of the 19 placeholder types below. Consumed by Task 4 (empty-slot rendering and the icon-load-error fallback) and unaffected by Task 6 (which only adds files under `web/assets/items/<vnum>.jpg`).

- [ ] **Step 1: Write `tools/gen-item-icons.js`**

```js
// tools/gen-item-icons.js
// Generates equipment paperdoll icons via Pollinations.ai (free, no key) --
// this project's original image pipeline, distinct from the paid gpt-image-1
// pipeline used for room/mob/UI-texture art.
//
// Usage:
//   node tools/gen-item-icons.js placeholders   -- the 19 generic empty-slot icons
//   node tools/gen-item-icons.js items          -- the real per-item icons (needs
//                                                   tools/item-icon-prompts.json,
//                                                   see docs/superpowers/plans/
//                                                   2026-07-04-equipment-paperdoll.md
//                                                   Task 5)
const fs = require('fs');
const path = require('path');

const ITEMS_OUT = path.join(__dirname, '..', 'web', 'assets', 'items');
const SLOTS_OUT = path.join(ITEMS_OUT, 'slots');
const PROMPTS_FILE = path.join(__dirname, 'item-icon-prompts.json');

const ICON_SIZE = 128;
const STYLE_SUFFIX =
  "dark fantasy RPG inventory icon, single object centered, dark neutral " +
  "background, no text, no UI, no scene, no hands, no character, isometric " +
  "game item icon style";

const PLACEHOLDER_PROMPTS = {
  light: "a simple unlit torch",
  ring: "a plain metal ring",
  neck: "an amulet pendant on a chain",
  body: "a chestplate armor",
  head: "a knight's helmet",
  legs: "leg armor greaves",
  feet: "leather boots",
  hands: "armored gloves",
  arms: "armored vambraces sleeves",
  shield: "a round wooden shield",
  about: "a hooded cloak",
  waist: "a leather belt",
  wrist: "a leather bracer",
  wield: "a steel longsword",
  hold: "a lit torch",
  dwield: "a curved dagger",
  ear: "a dangling earring",
  face: "a cloth mask",
  float: "a small glowing orb",
};

function seedFromString(s) {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed += s.charCodeAt(i);
  return seed;
}

function pollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${ICON_SIZE}&height=${ICON_SIZE}&seed=${seed}&nologo=true`;
}

async function fetchAndSave(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-item-icons] wrote ${outPath} (${buf.length} bytes)`);
}

async function generatePlaceholders() {
  for (const [type, desc] of Object.entries(PLACEHOLDER_PROMPTS)) {
    const prompt = `${desc}, faded ghosted outline silhouette, low opacity, empty equipment slot icon, ${STYLE_SUFFIX}`;
    const outPath = path.join(SLOTS_OUT, `${type}.jpg`);
    await fetchAndSave(pollinationsUrl(prompt, seedFromString(type)), outPath);
  }
}

async function generateItems() {
  if (!fs.existsSync(PROMPTS_FILE)) {
    throw new Error(`${PROMPTS_FILE} not found -- run Task 5 first`);
  }
  const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
  const vnums = Object.keys(prompts);
  for (const vnum of vnums) {
    const prompt = `${prompts[vnum]}, ${STYLE_SUFFIX}`;
    const outPath = path.join(ITEMS_OUT, `${vnum}.jpg`);
    await fetchAndSave(pollinationsUrl(prompt, parseInt(vnum, 10)), outPath);
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'placeholders') {
    await generatePlaceholders();
  } else if (mode === 'items') {
    await generateItems();
  } else {
    throw new Error('Usage: node tools/gen-item-icons.js <placeholders|items>');
  }
  console.log('[gen-item-icons] done');
}

main().catch((err) => {
  console.error('[gen-item-icons] failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it in placeholders mode**

```bash
cd /Users/ricardobussacro/Documents/Wardome
node tools/gen-item-icons.js placeholders
```

Expected: 19 `[gen-item-icons] wrote ...` lines, one per type listed in `PLACEHOLDER_PROMPTS`, ending with `[gen-item-icons] done`.

- [ ] **Step 3: Verify**

```bash
ls web/assets/items/slots/ | wc -l
file web/assets/items/slots/head.jpg
```

Expected: `19` and a valid image file (PNG or JPEG data — Pollinations, like this project's other generators, may return either).

- [ ] **Step 4: Commit**

```bash
git add tools/gen-item-icons.js web/assets/items/slots/
git commit -m "feat: generate the 19 empty-equipment-slot placeholder icons via Pollinations"
```

---

### Task 4: Client UI — button, overlay, silhouette grid, rendering

**Files:**
- Modify: `web/play.html` (button + overlay markup, inside `#side-panel`)
- Modify: `web/style.css` (button, overlay, grid, slot styling)
- Modify: `web/client.js` (equip message handling, slot table, icon resolution, toggle behavior)

**Interfaces:**
- Consumes: the `{ type: 'equip', slots: [...] }` message from Task 2; `web/assets/items/slots/<type>.jpg` from Task 3.
- Produces: nothing consumed by later tasks (Task 6 only adds new image files under an already-handled path pattern).

- [ ] **Step 1: Add the toggle button and overlay markup to `web/play.html`**

Find (`web/play.html`):

```html
      <h1 id="game-title">WARDOME II - REBORN</h1>
      <img id="room-art" src="assets/rooms/placeholder.jpg" alt="Room illustration">
```

Replace with:

```html
      <h1 id="game-title">WARDOME II - REBORN</h1>
      <button id="equipment-toggle" type="button">Equipment</button>
      <img id="room-art" src="assets/rooms/placeholder.jpg" alt="Room illustration">
```

Find the closing of `#layout` (`web/play.html`):

```html
    <div id="terminal-panel" class="ornate-frame">
```

Insert the overlay markup immediately before it (as a sibling of `#side-panel`/`#terminal-panel`, still inside `#layout`):

```html
    <div id="equipment-overlay" class="ornate-frame">
      <button id="equipment-close" type="button">&times;</button>
      <h2 id="equipment-title">Equipment</h2>
      <div id="equipment-grid">
        <div class="equip-slot" style="grid-area: ear-l;"><img id="equip-icon-ear-l" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: head;"><img id="equip-icon-head" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: ear-r;"><img id="equip-icon-ear-r" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: face;"><img id="equip-icon-face" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: neck-1;"><img id="equip-icon-neck-1" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: neck-2;"><img id="equip-icon-neck-2" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: about;"><img id="equip-icon-about" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: arms;"><img id="equip-icon-arms" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: body;"><img id="equip-icon-body" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: shield;"><img id="equip-icon-shield" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: wrist-l;"><img id="equip-icon-wrist-l" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: hands;"><img id="equip-icon-hands" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: wrist-r;"><img id="equip-icon-wrist-r" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: waist;"><img id="equip-icon-waist" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: ring-l;"><img id="equip-icon-ring-l" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: ring-r;"><img id="equip-icon-ring-r" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: legs;"><img id="equip-icon-legs" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: feet;"><img id="equip-icon-feet" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: hold;"><img id="equip-icon-hold" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: dwield;"><img id="equip-icon-dwield" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: wield;"><img id="equip-icon-wield" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: light;"><img id="equip-icon-light" class="equip-icon"></div>
        <div class="equip-slot" style="grid-area: float;"><img id="equip-icon-float" class="equip-icon"></div>
      </div>
    </div>
    <div id="terminal-panel" class="ornate-frame">
```

- [ ] **Step 2: Add CSS**

Append to the end of `web/style.css`:

```css
#equipment-toggle {
  display: block;
  width: 100%;
  margin: 0 0 12px 0;
  padding: 6px 10px;
  font-family: 'Cinzel', serif;
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.3);
  color: var(--gold);
  border: 1px solid var(--gold-dim);
  border-radius: 3px;
  cursor: pointer;
}

#equipment-toggle:hover {
  background: rgba(212, 175, 55, 0.15);
}

#equipment-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 50vw;
  height: 100vh;
  z-index: 50;
  padding: 24px;
  overflow-y: auto;
}

#equipment-overlay.open {
  display: block;
}

#equipment-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: var(--gold);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

#equipment-title {
  font-family: 'Cinzel', serif;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--gold);
  text-align: center;
  margin: 0 0 24px 0;
}

#equipment-grid {
  display: grid;
  grid-template-columns: repeat(3, 64px);
  grid-template-rows: repeat(11, 64px);
  grid-template-areas:
    "ear-l head ear-r"
    ".     face   .  "
    "neck-1 . neck-2"
    ".     about   .  "
    "arms  body  shield"
    "wrist-l hands wrist-r"
    ".     waist   .  "
    "ring-l . ring-r"
    "legs  .     feet"
    "hold dwield wield"
    "light .     float";
  gap: 8px;
  justify-content: center;
  margin: 40px auto 0 auto;
}

.equip-slot {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  overflow: hidden;
  background: #0d0d0d;
  border: 2px solid var(--gold-dim);
  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.7);
}

.equip-icon {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

- [ ] **Step 3: Add rendering logic to `web/client.js`**

Find:

```js
const goldTextEl = document.getElementById('gold-text');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');
```

Replace with:

```js
const goldTextEl = document.getElementById('gold-text');
const equipmentToggleEl = document.getElementById('equipment-toggle');
const equipmentOverlayEl = document.getElementById('equipment-overlay');
const equipmentCloseEl = document.getElementById('equipment-close');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');
```

Find:

```js
const MVP_ROOM_ART = new Set([3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603]);
const MVP_MOB_ART = new Set([18601, 18602, 18604, 18611, 18615]);
```

Add right after it:

```js
// Order matches WEAR_LIGHT=0..WEAR_FLOAT=22 (wdii/src/structs.h:421-443) --
// this is the exact same order the $$EQUIP$$ tag and bridge array use.
const EQUIP_SLOTS = [
  { area: 'light', type: 'light' },
  { area: 'ring-r', type: 'ring' },
  { area: 'ring-l', type: 'ring' },
  { area: 'neck-1', type: 'neck' },
  { area: 'neck-2', type: 'neck' },
  { area: 'body', type: 'body' },
  { area: 'head', type: 'head' },
  { area: 'legs', type: 'legs' },
  { area: 'feet', type: 'feet' },
  { area: 'hands', type: 'hands' },
  { area: 'arms', type: 'arms' },
  { area: 'shield', type: 'shield' },
  { area: 'about', type: 'about' },
  { area: 'waist', type: 'waist' },
  { area: 'wrist-r', type: 'wrist' },
  { area: 'wrist-l', type: 'wrist' },
  { area: 'wield', type: 'wield' },
  { area: 'hold', type: 'hold' },
  { area: 'dwield', type: 'dwield' },
  { area: 'ear-r', type: 'ear' },
  { area: 'ear-l', type: 'ear' },
  { area: 'face', type: 'face' },
  { area: 'float', type: 'float' },
];

const TIER_BORDER_COLORS = ['var(--gold-dim)', '#4a90d9', '#d4af37', '#e05252'];

const equipIconEls = EQUIP_SLOTS.map((def) => document.getElementById(`equip-icon-${def.area}`));
const lastEquipVnums = new Array(EQUIP_SLOTS.length).fill(undefined);

function slotPlaceholderPath(type) {
  return `assets/items/slots/${type}.jpg`;
}

function initEquipSlots() {
  EQUIP_SLOTS.forEach((def, i) => {
    const img = equipIconEls[i];
    img.src = slotPlaceholderPath(def.type);
    img.onerror = () => {
      img.onerror = null;
      img.src = slotPlaceholderPath(def.type);
    };
    img.parentElement.style.borderColor = TIER_BORDER_COLORS[0];
  });
}

function setEquip(msg) {
  msg.slots.forEach((slot, i) => {
    if (lastEquipVnums[i] === slot.vnum) return;
    lastEquipVnums[i] = slot.vnum;
    const def = EQUIP_SLOTS[i];
    const img = equipIconEls[i];
    if (slot.vnum === -1) {
      img.onerror = null;
      img.src = slotPlaceholderPath(def.type);
      img.parentElement.style.borderColor = TIER_BORDER_COLORS[0];
    } else {
      img.onerror = () => {
        img.onerror = null;
        img.src = slotPlaceholderPath(def.type);
      };
      img.src = `assets/items/${slot.vnum}.jpg`;
      img.parentElement.style.borderColor = TIER_BORDER_COLORS[slot.tier] || TIER_BORDER_COLORS[0];
    }
  });
}

initEquipSlots();
```

Find:

```js
  } else if (msg.type === 'stats') {
    setStats(msg);
  } else if (msg.type === 'echo') {
```

Replace with:

```js
  } else if (msg.type === 'stats') {
    setStats(msg);
  } else if (msg.type === 'equip') {
    setEquip(msg);
  } else if (msg.type === 'echo') {
```

At the end of the file, add the toggle behavior:

```js

equipmentToggleEl.addEventListener('click', () => {
  equipmentOverlayEl.classList.toggle('open');
});

equipmentCloseEl.addEventListener('click', () => {
  equipmentOverlayEl.classList.remove('open');
});
```

- [ ] **Step 4: Verify live**

```bash
cd /Users/ricardobussacro/Documents/Wardome
pkill -f "http.server 80" 2>/dev/null
python3 -m http.server 8050 --directory web &
```

Open `http://localhost:8050/play.html` (fresh port, avoids this project's known stale-browser-cache issue), log in with a test character. Confirm:
- The "Equipment" button appears under the title.
- Clicking it opens the overlay with all 23 slots visible in the D2-style silhouette, each showing its faded outline placeholder (since no real item icons exist yet).
- Equip a real item (`wear <item>` or similar) and confirm its slot immediately shows... still the placeholder for now (correct — the item's own vnum icon doesn't exist until Task 6), but the border color changes if the item carries a rarity tag (test with an item known to have one, e.g. one dropped by a mob kill per the existing item-rarity system).
- Clicking the close button (or toggling again) closes the overlay; room/status/HUD underneath are unaffected and still updating.

- [ ] **Step 5: Commit**

```bash
git add web/play.html web/style.css web/client.js
git commit -m "feat: add equipment paperdoll overlay UI (D2-style silhouette, rarity-bordered slots)"
```

---

### Task 5: Write per-item icon prompts (Fable 5 subagent)

**Files:**
- Create: `tools/build-item-icon-candidates.js`
- Create (generated): `tools/item-icon-candidates.json`
- Create (written by the Fable subagent): `tools/item-icon-prompts.json`

**Interfaces:**
- Produces: `tools/item-icon-prompts.json`, a flat JSON object mapping each equippable item's vnum (string key) to one plain-text image-generation prompt (string value, no style suffix — `gen-item-icons.js`'s `generateItems()` appends `STYLE_SUFFIX` itself). Consumed by Task 6.

- [ ] **Step 1: Write `tools/build-item-icon-candidates.js`**

```js
// tools/build-item-icon-candidates.js
// Filters extract/out/objects/*.json down to the 290 equippable items
// (WEAPON=5, ARMOR=9, WORN=11) and dumps their name/description data for
// the icon-prompt-writing step (see docs/superpowers/plans/
// 2026-07-04-equipment-paperdoll.md Task 5).
const fs = require('fs');
const path = require('path');

const OBJECTS_DIR = path.join(__dirname, '..', 'extract', 'out', 'objects');
const OUT_PATH = path.join(__dirname, 'item-icon-candidates.json');

const TYPE_NAMES = { '5': 'weapon', '9': 'armor', '11': 'worn' };

function main() {
  const files = fs.readdirSync(OBJECTS_DIR).filter((f) => f.endsWith('.json'));
  const candidates = {};
  for (const file of files) {
    const obj = JSON.parse(fs.readFileSync(path.join(OBJECTS_DIR, file), 'utf8'));
    const typeCode = obj.header_raw.split(' ')[0];
    if (!(typeCode in TYPE_NAMES)) continue;
    candidates[obj.id] = {
      shortDesc: obj.short_desc,
      longDesc: obj.long_desc,
      type: TYPE_NAMES[typeCode],
    };
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(candidates, null, 2));
  console.log(`[build-item-icon-candidates] wrote ${OUT_PATH} (${Object.keys(candidates).length} items)`);
}

main();
```

- [ ] **Step 2: Run it**

```bash
cd /Users/ricardobussacro/Documents/Wardome
node tools/build-item-icon-candidates.js
```

Expected: `[build-item-icon-candidates] wrote /Users/ricardobussacro/Documents/Wardome/tools/item-icon-candidates.json (290 items)`.

- [ ] **Step 3: Dispatch a Fable 5 subagent to write the prompts**

Dispatch an Agent with `model: "fable"` and this prompt (fill in nothing — this is the complete dispatch text):

> Read `/Users/ricardobussacro/Documents/Wardome/tools/item-icon-candidates.json` — it's a JSON object mapping ~290 item vnums to `{shortDesc, longDesc, type}` from a CircleMUD fantasy game (type is `weapon`, `armor`, or `worn`). For each entry, write one vivid, concise (15-25 words) visual description of that specific item suitable as a text-to-image prompt for a small RPG inventory icon — describe its physical appearance, material, and any notable visual detail implied by its name/description (do not invent lore beyond what the text implies, do not add camera/art-style directions, that's appended separately). Write the result to `/Users/ricardobussacro/Documents/Wardome/tools/item-icon-prompts.json` as a flat JSON object with the exact same vnum keys, each mapped to your prompt string. Do not modify any other file. When done, report how many prompts you wrote.

- [ ] **Step 4: Verify**

```bash
python3 -c "
import json
c = json.load(open('/Users/ricardobussacro/Documents/Wardome/tools/item-icon-candidates.json'))
p = json.load(open('/Users/ricardobussacro/Documents/Wardome/tools/item-icon-prompts.json'))
assert set(c.keys()) == set(p.keys()), 'key mismatch'
assert all(isinstance(v, str) and len(v) > 0 for v in p.values()), 'empty prompt found'
print('OK', len(p), 'prompts, all keys match')
"
```

Expected: `OK 290 prompts, all keys match`.

- [ ] **Step 5: Commit**

```bash
git add tools/build-item-icon-candidates.js tools/item-icon-candidates.json tools/item-icon-prompts.json
git commit -m "feat: write per-item icon prompts for all 290 equippable items (Fable 5)"
```

---

### Task 6: Generate the 290 real item icons and final verification

**Files:**
- Create (generated by running Task 3's script in `items` mode): `web/assets/items/<vnum>.jpg` (290 files)

**Interfaces:**
- Consumes: `tools/item-icon-prompts.json` from Task 5, `tools/gen-item-icons.js` from Task 3.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Run the generator in items mode**

```bash
cd /Users/ricardobussacro/Documents/Wardome
node tools/gen-item-icons.js items
```

Expected: 290 `[gen-item-icons] wrote ...` lines, ending with `[gen-item-icons] done`. This makes 290 sequential HTTP requests to Pollinations — expect it to take a while; if any single request fails, re-run the command (already-written files are simply overwritten, this is idempotent).

- [ ] **Step 2: Verify count and spot-check**

```bash
ls web/assets/items/*.jpg | wc -l
file web/assets/items/18601.jpg
```

Expected: `290` and a valid image file for the sample vnum (adjust the sample vnum to any real key present in `tools/item-icon-prompts.json` if `18601` isn't one of the 290).

- [ ] **Step 3: Commit the icons**

```bash
git add web/assets/items/
git commit -m "feat: generate 290 unique per-item equipment icons via Pollinations"
```

- [ ] **Step 4: Final live verification**

```bash
cd /Users/ricardobussacro/Documents/Wardome
pkill -f "http.server 80" 2>/dev/null
python3 -m http.server 8060 --directory web &
```

Open `http://localhost:8060/play.html` (fresh port), log in, and:
- Equip several different real items (varying types: weapon, armor piece, worn accessory).
- Open the Equipment overlay and confirm each occupied slot now shows that item's own unique icon (not the generic placeholder), and remains correctly positioned in the D2-style silhouette.
- Confirm rarity border colors are correct: an untagged item shows the neutral `var(--gold-dim)` border, and if a rarity-tagged item (from the existing item-rarity drop system) is equipped, its slot border matches the tier color (blue/gold/red).
- Un-equip an item and confirm its slot reverts to the correct generic type placeholder.
- Confirm the rest of the HUD (room, HP/MP/MV, XP, gold) is completely unaffected throughout.

---

## Explicitly out of scope (do not implement)

- Any change to `roll_item_rarity()` or the item-rarity drop system itself.
- Set-item synergy bonuses or any other new gameplay mechanic.
- Tooltips, hover text, or click-to-inspect detail on equipment slots — icon + rarity border only, per the approved design.
- A second, different overlay layout (e.g. tabs) — the button-triggered fixed-position overlay is the approved mechanism.
- Icon generation for any item type outside WEAPON(5)/ARMOR(9)/WORN(11) — 290 items and 19 placeholders is the full agreed scope.
- Changing the overlay to push the terminal panel instead of floating on top — overlay-on-top was the explicit choice.
