// tools/gen-dragons-barrel-art.js
// One-off: generates the paperdoll/inventory icon for "Dragon's Barrel"
// (item vnum 17690, zone 176 "New Ofcol") via GPT-Image-1, then downscales
// to 128x128 to match every other icon in web/assets/items/.
//
// Usage: OPENAI_API_KEY=... node tools/gen-dragons-barrel-art.js
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'web', 'assets', 'items', '17690.jpg');
const GEN_SIZE = '1024x1024';
const IMAGE_QUALITY = 'high';

const PROMPT =
  "A small wooden barrel canteen, dark stained oak, compact and lightweight " +
  "enough for an adventurer to carry on their back or hip, resting directly " +
  "on the ground with no stand, no rack, no legs. Bound with iron hoops. " +
  "Centered on the round front face is a single ornate dragon emblem inlaid " +
  "with gold, coiled to fit within the circular head of the barrel, finely " +
  "detailed gold filigree against the dark wood. dark fantasy RPG inventory " +
  "icon, single object centered, dark neutral background, no text, no UI, " +
  "no hands, no character, no wooden stand, isometric game item icon style, " +
  "sharp focus, high detail.";

async function generateFromScratch(prompt, apiKey) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: GEN_SIZE,
      quality: IMAGE_QUALITY,
    }),
  });
  if (!res.ok) {
    throw new Error(`generations HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, 'base64');
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }
  const buf = await generateFromScratch(PROMPT, apiKey);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[gen-dragons-barrel-art] wrote ${OUT_PATH} (${buf.length} bytes)`);
}

main().catch((err) => {
  console.error('[gen-dragons-barrel-art] failed:', err.message);
  process.exit(1);
});
