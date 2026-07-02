// tools/gen-room-art.js
const fs = require('fs');
const path = require('path');

const ROOM_IDS = [3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603];
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'rooms');
const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');

const STYLE_SUFFIX =
  "dark fantasy RPG environment concept art, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, moody atmospheric lighting, painterly detail, " +
  "wide shot, no text, no UI, no people, no characters";

async function fetchImage(prompt, seed, outPath) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&seed=${seed}&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching seed ${seed}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-room-art] wrote ${outPath} (${buf.length} bytes)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const id of ROOM_IDS) {
    const room = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, `${id}.json`), 'utf8'));
    const desc = room.description.replace(/\s+/g, ' ').trim();
    const prompt = `${room.name}. ${desc} ${STYLE_SUFFIX}`;
    await fetchImage(prompt, id, path.join(OUT_DIR, `${id}.jpg`));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const placeholderPrompt = `A foggy, dim, unmapped stone corridor fading into darkness. ${STYLE_SUFFIX}`;
  await fetchImage(placeholderPrompt, 0, path.join(OUT_DIR, 'placeholder.jpg'));

  console.log('[gen-room-art] done');
}

main().catch((err) => {
  console.error('[gen-room-art] failed:', err.message);
  process.exit(1);
});
