// tools/gen-affect-icons.js
// Generates one small icon per active-effect flag (wdii/src/constants.c's
// affected_bits[] array, AFF_* flags) via Pollinations.ai (free, no key) --
// same pipeline as items/rooms/mobs. Used by the side-panel "Affects" list.
//
// Usage: node tools/gen-affect-icons.js
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'affects');
const ICON_SIZE = 64;
const STYLE_SUFFIX =
  'dark fantasy RPG status-effect icon, single symbol centered, dark neutral ' +
  'background, no text, no UI, no scene, no hands, no character, isometric ' +
  'game icon style';

// Keys match wdii/src/constants.c's affected_bits[] exactly (31 entries).
// Filenames strip anything non-filename-safe (matches web/client.js's
// affectFileName()) -- only "!TRACK" needs this (leading "!").
const PROMPTS = {
  'BLIND': 'a blindfolded eye dripping shadow',
  'INVIS': 'a faint translucent ghostly silhouette',
  'DET-ALIGN': 'a glowing compass rose with light and dark halves',
  'DET-INVIS': 'a wide-open magical eye piercing through fog',
  'DET-MAGIC': 'a glowing rune-covered magnifying glass',
  'SENSE-LIFE': 'a pulsing red heartbeat aura',
  'WATWALK': 'sandaled feet standing on rippling water',
  'SANCT': 'a radiant golden halo of holy light',
  'GROUP': 'three linked golden rings',
  'CURSE': 'a black skull wrapped in thorned chains',
  'INFRA': 'a pair of glowing red heat-vision eyes',
  'POISON': 'a dripping green skull vial',
  'PROT-EVIL': 'a silver shield etched with a holy sigil',
  'PROT-GOOD': 'a black iron shield etched with a dark sigil',
  'SLEEP': 'a drowsy crescent moon with closed eyes and zzz',
  '!TRACK': 'a crossed-out footprint trail fading to mist',
  'MANA-SHIELD': 'a translucent blue hexagonal energy barrier',
  'DAMNED-CURSE': 'a shattered black halo dripping tar',
  'SNEAK': 'a cloaked figure blending into shadow',
  'HIDE': 'a leaf-covered silhouette merging into a wall',
  'HASTE': 'a swirling wind clock with motion streaks',
  'CHARM': 'a pink heart with spiral hypnotic eyes',
  'MENTAL': 'a glowing brain wrapped in psychic energy',
  'SATAN_PACT': 'a burning inverted pentagram sigil',
  'GOD_PACT': 'a radiant divine sigil surrounded by light rays',
  'REGEN': 'a green spiral of regenerating leaves and light',
  'FLY': 'a pair of feathered wings with wind trails',
  'WGAS': 'a swirling toxic green gas cloud',
  'TANGLED': 'thorned vines wrapped around a struggling limb',
  'FIRESHIELD': 'a swirling ring of protective flame',
  'BERZERK': 'a roaring red rage aura around clenched fists',
};

function seedFromString(s) {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed += s.charCodeAt(i);
  return seed;
}

function sanitizeFileName(name) {
  return name.replace(/[^A-Za-z0-9_-]/g, '');
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
  console.log(`[gen-affect-icons] wrote ${outPath} (${buf.length} bytes)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const names = Object.keys(PROMPTS);
  console.log(`[gen-affect-icons] generating ${names.length} affect icons + 1 placeholder`);

  const placeholderPath = path.join(OUT_DIR, 'placeholder.jpg');
  if (!fs.existsSync(placeholderPath)) {
    const placeholderPrompt = `a faint grayscale question mark in a hexagonal frame, unknown status effect icon, ${STYLE_SUFFIX}`;
    try {
      await fetchAndSave(pollinationsUrl(placeholderPrompt, 1), placeholderPath);
    } catch (e) {
      console.log(`[gen-affect-icons] FAILED placeholder: ${e.message}`);
    }
    await sleep(250);
  }

  for (const name of names) {
    const outPath = path.join(OUT_DIR, `${sanitizeFileName(name)}.jpg`);
    if (fs.existsSync(outPath)) {
      console.log(`[gen-affect-icons] skipping ${outPath} (already exists)`);
      continue;
    }
    const prompt = `${PROMPTS[name]}, ${STYLE_SUFFIX}`;
    try {
      await fetchAndSave(pollinationsUrl(prompt, seedFromString(name)), outPath);
    } catch (e) {
      console.log(`[gen-affect-icons] FAILED ${name}: ${e.message}`);
    }
    await sleep(250);
  }

  console.log('[gen-affect-icons] done');
}

main().catch((err) => {
  console.error('[gen-affect-icons] fatal:', err.message);
  process.exit(1);
});
