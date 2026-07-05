// tools/gen-room-art.js
// Generates room illustration art for every room in the current world via
// Pollinations.ai (free, no key) -- same free pipeline used for the
// equipment paperdoll icons. Reads extract/out/rooms/*.json (name +
// description) built by extract/run.py from wdii/lib/world.
//
// Usage: node tools/gen-room-art.js
const fs = require('fs');
const path = require('path');

const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'rooms');

const WIDTH = 480;
const HEIGHT = 288;
const STYLE_SUFFIX =
  'dark fantasy MUD game environment illustration, atmospheric digital painting, ' +
  'moody lighting, no text, no UI, no characters, no people, wide establishing shot';

function seedFromId(id) {
  return id % 1000000;
}

function cleanDescription(desc) {
  return desc
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
  console.log(`[gen-room-art] wrote ${outPath} (${buf.length} bytes)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const files = fs.readdirSync(ROOMS_DIR).filter((f) => f.endsWith('.json'));
  console.log(`[gen-room-art] found ${files.length} room files`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const id = parseInt(file.replace('.json', ''), 10);
    const outPath = path.join(OUT_DIR, `${id}.jpg`);

    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    let room;
    try {
      room = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, file), 'utf8'));
    } catch (e) {
      console.log(`[gen-room-art] skipping ${file}: bad JSON (${e.message})`);
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
      console.log(`[gen-room-art] FAILED room ${id}: ${e.message}`);
      failed++;
    }

    await sleep(250);
  }

  console.log(`[gen-room-art] done. generated=${done} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error('[gen-room-art] fatal:', err.message);
  process.exit(1);
});
