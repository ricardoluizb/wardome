// tools/gen-ui-texture.js
// One-off: generates the Baldur's Gate-style UI reskin's panel background
// texture via OpenAI's image API (gpt-image-1), following the same pattern
// as tools/gen-landing-art.js and tools/gen-world-art.js.
//
// Requires OPENAI_API_KEY in the environment. Never hardcode the key here.
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'web', 'assets', 'ui', 'panel-texture.jpg');

const PROMPT =
  "Seamless background texture: ancient dark carved stone wall with an inset " +
  "panel of aged dark leather, subtle worn brass rivets, very low contrast and " +
  "even lighting so text stays readable when overlaid, dark fantasy palette, " +
  "digital painting in the style of Baldur's Gate 3, no text, no UI, no people, " +
  "no characters, no strong focal point, tileable-looking flat texture";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: PROMPT,
      size: '1536x1024',
      quality: 'high',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const buf = Buffer.from(json.data[0].b64_json, 'base64');
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[gen-ui-texture] wrote ${OUT_PATH} (${buf.length} bytes)`);
}

main().catch((err) => {
  console.error('[gen-ui-texture] failed:', err.message);
  process.exit(1);
});
