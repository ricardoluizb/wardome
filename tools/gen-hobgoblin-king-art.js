// tools/gen-hobgoblin-king-art.js
// One-off: generates a portrait for the Hobgoblin King (mob vnum 17818,
// zone 178 "Gnome Village") via GPT-Image-1, chained from the existing
// gen-world-art.js continuity chain's last mob image (18615.jpg) for
// consistent style/palette, without re-running (and re-paying for) the
// rest of that chain.
//
// Usage: OPENAI_API_KEY=... node tools/gen-hobgoblin-king-art.js
const fs = require('fs');
const path = require('path');

const MOBS_OUT = path.join(__dirname, '..', 'web', 'assets', 'mobs');
const REF_IMAGE = path.join(MOBS_OUT, '18615.jpg');
const OUT_IMAGE = path.join(MOBS_OUT, '17818.jpg');

const IMAGE_SIZE = '1536x1024';
const IMAGE_QUALITY = 'high';

const MOB_STYLE_SUFFIX =
  "dark fantasy RPG creature portrait, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, dramatic lighting, painterly detail, " +
  "single creature centered, no text, no UI, no environment clutter";

const PROMPT = [
  'Gnome Village.',
  'the king of the hobgoblins -- There is a great king here, sitting in his throne. ' +
  'The king is a silly looking hobgoblin whose muscles bulge out of his robes, ' +
  'destroying the sophisticated effect he was trying to create. He wears heavy banded ' +
  'mail armor beneath his robes and wields a massive iron-and-bone-studded greatclub.',
  'Keep a consistent painterly style, palette, and lighting with the attached reference image, while depicting this different creature.',
  MOB_STYLE_SUFFIX,
].join(' ');

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
  console.log(`[gen-hobgoblin-king-art] wrote ${outPath} (${buf.length} bytes, chained from ${path.basename(refImagePath)})`);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }
  if (!fs.existsSync(REF_IMAGE)) {
    throw new Error(`reference image not found: ${REF_IMAGE}`);
  }
  await generateFromReference(REF_IMAGE, PROMPT, OUT_IMAGE, apiKey);
  console.log('[gen-hobgoblin-king-art] done');
}

main().catch((err) => {
  console.error('[gen-hobgoblin-king-art] failed:', err.message);
  process.exit(1);
});
