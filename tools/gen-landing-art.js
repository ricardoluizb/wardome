// tools/gen-landing-art.js
// One-off: generates the pre-login landing page's hero image via OpenAI's
// image API (gpt-image-1), NOT the project's usual Pollinations.ai pipeline
// (tools/gen-room-art.js / tools/gen-mob-art.js stay on Pollinations).
//
// Requires OPENAI_API_KEY in the environment. Never hardcode the key here.
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'web', 'assets', 'landing-hero.jpg');

const PROMPT =
  "Epic dark fantasy RPG landing page hero art: a colossal ancient stone gate " +
  "of a legendary arena called 'WarDome', carved with runes, torches burning " +
  "on either side, dramatic low-angle wide shot, moody atmospheric lighting, " +
  "digital painting in the style of Baldur's Gate 3 and Disco Elysium, " +
  "cinematic, painterly detail, no text, no UI, no people, no characters";

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
  const b64 = json.data[0].b64_json;
  const buf = Buffer.from(b64, 'base64');
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[gen-landing-art] wrote ${OUT_PATH} (${buf.length} bytes)`);
}

main().catch((err) => {
  console.error('[gen-landing-art] failed:', err.message);
  process.exit(1);
});
