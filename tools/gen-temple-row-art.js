// tools/gen-temple-row-art.js
//
// One-off generator for the 20 rooms of zone 305's "Estrada dos Templos"
// (Temple Street): a race temple for every playable race, connected by
// road rooms. Pollinations.ai, not the GPT-Image continuity chain used by
// gen-world-art.js -- explicit user choice for this batch (no API cost).
//
// Continuity strategy: the 7 road/hub rooms share one seed so the street
// itself reads as one continuous place; each of the 13 temples gets its
// own seed (derived from its vnum) so every race's temple looks visually
// distinct, matching that race's own description instead of blending
// into its neighbors.

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROAD_IDS = [30505, 30506, 30507, 30508, 30509, 30510, 30511];
const TEMPLE_IDS = [
  30512, 30513, 30514, 30515, 30516, 30517,
  30518, 30519, 30520, 30521, 30522, 30523, 30524,
];
const ALL_IDS = [...ROAD_IDS, ...TEMPLE_IDS];

const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'rooms');

const WIDTH = 1024;
const HEIGHT = 768;
const ROAD_SEED = 30500;

const STYLE_SUFFIX =
  "dark fantasy RPG environment concept art, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, moody atmospheric lighting, painterly detail, " +
  "wide shot, no text, no UI, no people, no characters";

function stripColor(s) {
  return s.replace(/&[A-Za-z]/g, '');
}

function loadRoom(id) {
  const room = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, `${id}.json`), 'utf8'));
  const zone = JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${room.zone_id}.json`), 'utf8'));
  return {
    id,
    name: stripColor(room.name),
    zoneName: zone.name,
    desc: stripColor(room.description).replace(/\s+/g, ' ').trim(),
  };
}

function buildPrompt(room, isRoad) {
  const context = isRoad
    ? 'A cobblestone street lined with temples, each built by a different fantasy race.'
    : `A temple built by and for a specific fantasy race, reflecting that race's own culture and aesthetic.`;
  return [`${room.zoneName} -- ${room.name}.`, context, room.desc, STYLE_SUFFIX]
    .filter(Boolean).join(' ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchOnce(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        fs.writeFileSync(destPath, Buffer.concat(chunks));
        resolve();
      });
    }).on('error', reject);
  });
}

async function fetchImage(url, destPath) {
  const MAX_ATTEMPTS = 6;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await fetchOnce(url, destPath);
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      const backoff = 8000 * attempt;
      process.stdout.write(`(${err.message}, retry ${attempt}/${MAX_ATTEMPTS} in ${backoff / 1000}s) `);
      await sleep(backoff);
    }
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const id of ALL_IDS) {
    const isRoad = ROAD_IDS.includes(id);
    const room = loadRoom(id);
    const prompt = buildPrompt(room, isRoad);
    const seed = isRoad ? ROAD_SEED : id;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true`;
    const destPath = path.join(OUT_DIR, `${id}.jpg`);
    process.stdout.write(`[${id}] ${room.name} ... `);
    try {
      await fetchImage(url, destPath);
      console.log('done');
    } catch (err) {
      console.log('FAILED:', err.message);
    }
    await sleep(4000);
  }
}

main();
