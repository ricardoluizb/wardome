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
    const prompt = `${desc}, faint grayscale outline silhouette only, black and white, very low contrast, ` +
      `barely visible ghosted line art, no color, no shading, empty equipment slot icon, ${STYLE_SUFFIX}`;
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
    const outPath = path.join(ITEMS_OUT, `${vnum}.jpg`);
    if (fs.existsSync(outPath)) {
      console.log(`[gen-item-icons] skipping ${outPath} (already exists)`);
      continue;
    }
    const prompt = `${prompts[vnum]}, ${STYLE_SUFFIX}`;
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
