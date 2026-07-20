// tools/gen-room-art-filtered.js
// Same pipeline as gen-room-art.js, but restricted to an explicit list of
// room vnums (temple zones + The WarDome City, per user request), so we
// don't burn API calls regenerating the other ~7500 rooms in the world.
//
// Usage: node tools/gen-room-art-filtered.js
const fs = require('fs');
const path = require('path');

const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'rooms');
const WLD_DIR = path.join(__dirname, '..', 'wdii', 'lib', 'world', 'wld');

const WIDTH = 480;
const HEIGHT = 288;
const STYLE_SUFFIX =
  'dark fantasy MUD game environment illustration, atmospheric digital painting, ' +
  'moody lighting, no text, no UI, no characters, no people, wide establishing shot';

const TEMPLE_ZONES = [32, 98, 131, 201, 312, 313, 314, 315, 316];
const CITY_ZONES = [5];

function roomVnumsForZone(zoneVnum) {
  const wldPath = path.join(WLD_DIR, `${zoneVnum}.wld`);
  if (!fs.existsSync(wldPath)) return [];
  const content = fs.readFileSync(wldPath, 'latin1');
  const vnums = [];
  const re = /^#(\d+)$/gm;
  let m;
  while ((m = re.exec(content)) !== null) vnums.push(parseInt(m[1], 10));
  return vnums;
}

function seedFromId(id) {
  return id % 1000000;
}

function cleanDescription(desc) {
  return desc.replace(/\s+/g, ' ').trim().slice(0, 260);
}

function pollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true`;
}

async function fetchAndSave(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-room-art-filtered] wrote ${outPath} (${buf.length} bytes)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const ids = new Set();
  for (const z of [...TEMPLE_ZONES, ...CITY_ZONES]) {
    for (const v of roomVnumsForZone(z)) ids.add(v);
  }
  const idList = [...ids].sort((a, b) => a - b);
  console.log(`[gen-room-art-filtered] target rooms: ${idList.length} (${TEMPLE_ZONES.length} temple zones + ${CITY_ZONES.length} city zone)`);

  let done = 0, skipped = 0, failed = 0;

  for (const id of idList) {
    const outPath = path.join(OUT_DIR, `${id}.jpg`);
    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }
    const jsonPath = path.join(ROOMS_DIR, `${id}.json`);
    if (!fs.existsSync(jsonPath)) {
      failed++;
      continue;
    }
    let room;
    try {
      room = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.log(`[gen-room-art-filtered] skipping ${id}.json: bad JSON (${e.message})`);
      failed++;
      continue;
    }
    const name = (room.name || '').trim();
    const desc = cleanDescription(room.description || '');
    if (!name && !desc) {
      failed++;
      continue;
    }
    const prompt = `${name}. ${desc}, ${STYLE_SUFFIX}`;
    try {
      await fetchAndSave(pollinationsUrl(prompt, seedFromId(id)), outPath);
      done++;
    } catch (e) {
      console.log(`[gen-room-art-filtered] FAILED room ${id}: ${e.message}`);
      failed++;
    }
    await sleep(250);
  }

  console.log(`[gen-room-art-filtered] done. generated=${done} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error('[gen-room-art-filtered] fatal:', err.message);
  process.exit(1);
});
