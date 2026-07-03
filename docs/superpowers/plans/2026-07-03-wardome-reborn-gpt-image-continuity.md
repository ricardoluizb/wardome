# GPT-Image Continuity Art Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tools/gen-room-art.js` and `tools/gen-mob-art.js` with a single `tools/gen-world-art.js` that regenerates all 9 room images + 5 mob images as one continuous OpenAI `gpt-image-1` reference-image chain, so adjacent images in the walk (and the room→mob hand-off) show genuine visual continuity instead of independently-generated, seed-matched images.

**Architecture:** One ordered list — the 9 MVP rooms in walk order, then the 5 MVP mobs in vnum order — forms a single chain. The first item (room `3001`) is generated from scratch via `POST /v1/images/generations`. Every later item is generated via `POST /v1/images/edits`, passing the immediately-preceding item's own just-written output file as the reference image (`images/edits` accepts up to 16 reference images per call; this plan uses exactly 1 — the direct predecessor). No mask is sent, so the whole reference image acts as a full-image style/continuity anchor for the new prompt.

**Tech Stack:** Node.js (global `fetch`/`FormData`/`Blob`, available without imports on Node 18+ — confirmed this machine runs Node 25), no new npm dependencies. OpenAI `gpt-image-1` via the `/v1/images/generations` and `/v1/images/edits` REST endpoints.

## Global Constraints

- `OPENAI_API_KEY` must be read from the environment only (the calling shell exports it from `~/Documents/WHCreative/apps/web/.env.local` before running the script — same pattern as `tools/gen-landing-art.js`). Never hardcode the key, never print it, never commit it.
- Do NOT touch `web/assets/rooms/placeholder.jpg` or `web/assets/mobs/placeholder.jpg` — out of scope, leave the existing Pollinations-generated files exactly as they are.
- Do NOT touch `bridge/server.js`, `web/client.js`, or `wdii/src` — `MVP_ROOM_ART`/`MVP_MOB_ART` and the display logic are unchanged; only the image files at the same filenames are regenerated.
- MVP room slate (exact vnums, exact order — this defines the chain order for the room half): `3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603`.
- MVP mob slate (exact vnums, exact order — this defines the chain order for the mob half): `18601, 18602, 18604, 18611, 18615`.
- Delete the old `tools/gen-room-art.js` and `tools/gen-mob-art.js` — this plan's new script replaces both.
- No automated test suite for this project — manual/observational verification (direct visual inspection of the generated JPEGs, an established technique in this project via the Read tool).

---

### Task 1: `tools/gen-world-art.js` — single continuity-chained art generator

**Files:**
- Create: `tools/gen-world-art.js`
- Delete: `tools/gen-room-art.js`, `tools/gen-mob-art.js`
- Regenerate: `web/assets/rooms/{3001,3054,3059,3060,3061,18600,18601,18602,18603}.jpg`
- Regenerate: `web/assets/mobs/{18601,18602,18604,18611,18615}.jpg`

**Interfaces:**
- Consumes: `extract/out/rooms/<id>.json` (`name`, `description`, `sector`, `zone_id`), `extract/out/zones/<id>.json` (`name`), `extract/out/mobs/<id>.json` (`short_desc`, `long_desc`, `source_path`) — all unchanged by this plan.
- Produces: the 14 regenerated JPEGs at their existing filenames — `web/client.js`'s `MVP_ROOM_ART`/`MVP_MOB_ART` Sets and `setRoomArt`/`setMobArt` functions (unchanged) already reference these exact paths, so nothing downstream needs to change.

- [ ] **Step 1: Write `tools/gen-world-art.js`**

```js
// tools/gen-world-art.js
const fs = require('fs');
const path = require('path');

const ROOM_IDS = [3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603];
const MOB_IDS = [18601, 18602, 18604, 18611, 18615];

const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');
const MOBS_DIR = path.join(__dirname, '..', 'extract', 'out', 'mobs');
const ROOMS_OUT = path.join(__dirname, '..', 'web', 'assets', 'rooms');
const MOBS_OUT = path.join(__dirname, '..', 'web', 'assets', 'mobs');

const IMAGE_SIZE = '1536x1024';
const IMAGE_QUALITY = 'high';

// Matches wdii/src/constants.c:176 sector_types[] exactly.
const SECTOR_NAMES = [
  'Inside', 'City', 'Field', 'Forest', 'Hills', 'Mountains',
  'Water (Swim)', 'Water (No Swim)', 'Underwater', 'In Flight',
];

const ROOM_STYLE_SUFFIX =
  "dark fantasy RPG environment concept art, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, moody atmospheric lighting, painterly detail, " +
  "wide shot, no text, no UI, no people, no characters";

const MOB_STYLE_SUFFIX =
  "dark fantasy RPG creature portrait, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, dramatic lighting, painterly detail, " +
  "single creature centered, no text, no UI, no environment clutter";

function loadRoom(id) {
  const room = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, `${id}.json`), 'utf8'));
  const zone = JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${room.zone_id}.json`), 'utf8'));
  return {
    id, sector: room.sector, name: room.name, zoneName: zone.name,
    desc: room.description.replace(/\s+/g, ' ').trim(),
    outPath: path.join(ROOMS_OUT, `${id}.jpg`),
  };
}

function loadMob(id) {
  const mob = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, `${id}.json`), 'utf8'));
  const zoneMatch = mob.source_path.match(/\/(\d+)\.mob$/);
  const zoneId = zoneMatch ? zoneMatch[1] : null;
  const zone = zoneId
    ? JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${zoneId}.json`), 'utf8'))
    : null;
  return {
    id, shortDesc: mob.short_desc, longDesc: mob.long_desc,
    zoneName: zone ? zone.name : 'Unknown Zone',
    outPath: path.join(MOBS_OUT, `${id}.jpg`),
  };
}

function buildChain() {
  const rooms = ROOM_IDS.map(loadRoom);
  const mobs = MOB_IDS.map(loadMob);
  return rooms.map((r) => ({ kind: 'room', data: r }))
    .concat(mobs.map((m) => ({ kind: 'mob', data: m })));
}

function buildPrompt(chain, i) {
  const item = chain[i];
  const prev = i > 0 ? chain[i - 1] : null;

  if (item.kind === 'room') {
    const r = item.data;
    const sectorLine = `Sector: ${SECTOR_NAMES[r.sector]}.`;
    let continuityClause = '';
    if (prev && prev.kind === 'room') {
      continuityClause = prev.data.sector === r.sector
        ? 'Continuing directly from the attached reference image -- keep the same architecture, materials, palette, and lighting.'
        : `Transitioning from the attached reference image's ${SECTOR_NAMES[prev.data.sector]} environment to a ${SECTOR_NAMES[r.sector]} environment.`;
    }
    return [`${r.zoneName} -- ${r.name}.`, sectorLine, r.desc, continuityClause, ROOM_STYLE_SUFFIX]
      .filter(Boolean).join(' ');
  }

  const m = item.data;
  let handoff = '';
  if (prev && prev.kind === 'room') {
    handoff = 'Style continuation from a dark fantasy dungeon environment (attached reference) into a creature portrait.';
  } else if (prev && prev.kind === 'mob') {
    handoff = 'Keep a consistent painterly style, palette, and lighting with the attached reference image, while depicting this different creature.';
  }
  return [`${m.zoneName}.`, `${m.shortDesc} -- ${m.longDesc}`, handoff, MOB_STYLE_SUFFIX]
    .filter(Boolean).join(' ');
}

async function generateFromScratch(prompt, outPath, apiKey) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    }),
  });
  if (!res.ok) {
    throw new Error(`generations HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const buf = Buffer.from(json.data[0].b64_json, 'base64');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-world-art] wrote ${outPath} (${buf.length} bytes, from scratch)`);
}

async function generateFromReference(refImagePath, prompt, outPath, apiKey) {
  const refBuf = fs.readFileSync(refImagePath);
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new Blob([refBuf], { type: 'image/jpeg' }), 'reference.jpg');
  form.append('prompt', prompt);
  form.append('size', IMAGE_SIZE);
  form.append('quality', IMAGE_QUALITY);

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`edits HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const buf = Buffer.from(json.data[0].b64_json, 'base64');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-world-art] wrote ${outPath} (${buf.length} bytes, chained from ${path.basename(refImagePath)})`);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }
  fs.mkdirSync(ROOMS_OUT, { recursive: true });
  fs.mkdirSync(MOBS_OUT, { recursive: true });

  const chain = buildChain();

  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    const prompt = buildPrompt(chain, i);
    if (i === 0) {
      await generateFromScratch(prompt, item.data.outPath, apiKey);
    } else {
      await generateFromReference(chain[i - 1].data.outPath, prompt, item.data.outPath, apiKey);
    }
  }

  console.log('[gen-world-art] done');
}

main().catch((err) => {
  console.error('[gen-world-art] failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Delete the old scripts**

```bash
cd /Users/ricardobussacro/Documents/Wardome
git rm tools/gen-room-art.js tools/gen-mob-art.js
```

- [ ] **Step 3: Confirm sector values for the room chain (sanity check before spending API calls)**

```bash
for v in 3001 3054 3059 3060 3061 18600 18601 18602 18603; do
  python3 -c "import json; d=json.load(open('extract/out/rooms/$v.json')); print($v, d['sector'])"
done
```
Expected: `3001 0`, `3054 0`, `3059 1`, `3060 1`, `3061 1`, `18600 1`, `18601 0`, `18602 0`, `18603 0` — confirms the sector-based continuity/transition wording in `buildPrompt` will fire correctly (continuity for 3001→3054, transition at 3054→3059 and 18600→18601, continuity elsewhere).

- [ ] **Step 4: Run the generator**

```bash
cd /Users/ricardobussacro/Documents/Wardome
export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" ~/Documents/WHCreative/apps/web/.env.local | cut -d= -f2-)
node tools/gen-world-art.js
unset OPENAI_API_KEY
```
Expected: 14 `[gen-world-art] wrote ...` lines (1 "from scratch", 13 "chained from ..."), then `[gen-world-art] done`, exit code 0. This makes 14 real paid API calls — do not re-run casually if it succeeds; only re-run if a specific image needs regenerating.

- [ ] **Step 5: Visually verify the chain's continuity**

View at least these pairs directly (Read tool renders JPEGs):
- `web/assets/rooms/3001.jpg` vs `web/assets/rooms/3054.jpg` (same-sector continuity pair — should read as the same physical space).
- `web/assets/rooms/3061.jpg` vs `web/assets/rooms/18600.jpg` (same sector, City→City continuity, still chained).
- `web/assets/rooms/18600.jpg` vs `web/assets/rooms/18601.jpg` (sector transition, City→Inside — expected to show a believable transition, not a jarring unrelated scene).
- `web/assets/rooms/18603.jpg` vs `web/assets/mobs/18601.jpg` (the room→mob hand-off — the mob portrait should feel like it belongs to the same dark-fantasy world/palette as the preceding room, even though the composition is completely different — a portrait vs. an environment).
- `web/assets/mobs/18601.jpg` vs `web/assets/mobs/18602.jpg` (mob-to-mob continuity — consistent painterly style/palette across two different creatures).

- [ ] **Step 6: Confirm nothing outside scope was touched**

```bash
git status --short
```
Expected: only `tools/gen-world-art.js` (new), `tools/gen-room-art.js`/`tools/gen-mob-art.js` (deleted), and the 14 room/mob JPEGs (modified) — NOT `placeholder.jpg` in either directory, not `bridge/server.js`, not `web/client.js`, not `wdii/src`.

- [ ] **Step 7: Commit**

```bash
git add tools/gen-world-art.js web/assets/rooms/ web/assets/mobs/
git commit -m "feat: regenerate room and mob art as a single GPT-Image continuity chain

Replaces the independent Pollinations.ai generations (matched only by a
shared seed number) with one continuous OpenAI gpt-image-1 chain: room
3001 generates from scratch, then every subsequent room/mob image is
generated via images/edits referencing the immediately-preceding
image's actual pixels, carrying real visual continuity (architecture,
palette, lighting) forward instead of faking it with a seed match.
The last MVP room hands off into the first MVP mob, tying all 14
images into one lineage.

tools/gen-room-art.js and tools/gen-mob-art.js are removed, replaced
by tools/gen-world-art.js. Placeholder images (rooms and mobs) are
untouched, out of scope."
```

---

## Explicitly out of scope (do not implement)

- Any change to `web/assets/rooms/placeholder.jpg` or `web/assets/mobs/placeholder.jpg`.
- Any change to the room/mob C tags, bridge extraction, or client display logic — only the image files change.
- Switching any future (not-yet-built) art generation to GPT-Image by default — this is a one-off regeneration of existing assets, not a pipeline change going forward.
