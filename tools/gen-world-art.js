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
