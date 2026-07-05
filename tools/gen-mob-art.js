// tools/gen-mob-art.js
// Generates mob illustration art for mobs in the current world via
// Pollinations.ai (free, no key) -- same free pipeline as room art and
// equipment icons. Reads extract/out/mobs/*.json (short_desc + long_desc)
// built by extract/run.py from wdii/lib/world.
//
// Priority order: zone 30 (the central Fountain/"Undead Square" hub) first,
// then zone 186 (the newbie zone), then every other mob in the world.
//
// Usage: node tools/gen-mob-art.js
const fs = require('fs');
const path = require('path');

const MOBS_DIR = path.join(__dirname, '..', 'extract', 'out', 'mobs');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'mobs');

const WIDTH = 480;
const HEIGHT = 288;
const STYLE_SUFFIX =
  'dark fantasy MUD game character portrait, atmospheric digital painting, ' +
  'moody lighting, no text, no UI, single creature centered, detailed';

const PRIORITY_ZONES = [30, 186];

function seedFromId(id) {
  return id % 1000000;
}

function cleanText(text) {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
}

function pollinationsUrl(prompt, seed) {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true`;
}

async function fetchAndSave(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-mob-art] wrote ${outPath} (${buf.length} bytes)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mobVnumsInZone(zoneId) {
  const zonePath = path.join(ZONES_DIR, `${zoneId}.json`);
  if (!fs.existsSync(zonePath)) return [];
  const zone = JSON.parse(fs.readFileSync(zonePath, 'utf8'));
  const vnums = new Set();
  for (const cmd of zone.commands || []) {
    if (cmd.cmd === 'M') vnums.add(cmd.args[1]);
  }
  return [...vnums];
}

function buildOrderedIds() {
  const allFiles = fs.readdirSync(MOBS_DIR).filter((f) => f.endsWith('.json'));
  const allIds = allFiles.map((f) => parseInt(f.replace('.json', ''), 10));
  const allIdSet = new Set(allIds);

  const ordered = [];
  const seen = new Set();

  for (const zoneId of PRIORITY_ZONES) {
    for (const vnum of mobVnumsInZone(zoneId)) {
      if (allIdSet.has(vnum) && !seen.has(vnum)) {
        ordered.push(vnum);
        seen.add(vnum);
      }
    }
  }

  for (const id of allIds.sort((a, b) => a - b)) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  return ordered;
}

async function main() {
  const ids = buildOrderedIds();
  console.log(`[gen-mob-art] found ${ids.length} mobs (priority zones: ${PRIORITY_ZONES.join(', ')})`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    const outPath = path.join(OUT_DIR, `${id}.jpg`);

    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    let mob;
    try {
      mob = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, `${id}.json`), 'utf8'));
    } catch (e) {
      console.log(`[gen-mob-art] skipping ${id}.json: bad JSON (${e.message})`);
      failed++;
      continue;
    }

    const shortDesc = (mob.short_desc || '').trim();
    const longDesc = cleanText(mob.long_desc || '');
    if (!shortDesc && !longDesc) {
      failed++;
      continue;
    }
    const prompt = `${shortDesc}. ${longDesc}, ${STYLE_SUFFIX}`;

    try {
      await fetchAndSave(pollinationsUrl(prompt, seedFromId(id)), outPath);
      done++;
    } catch (e) {
      console.log(`[gen-mob-art] FAILED mob ${id}: ${e.message}`);
      failed++;
    }

    await sleep(250);
  }

  console.log(`[gen-mob-art] done. generated=${done} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error('[gen-mob-art] fatal:', err.message);
  process.exit(1);
});
