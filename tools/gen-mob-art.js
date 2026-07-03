// tools/gen-mob-art.js
const fs = require('fs');
const path = require('path');

const MOB_IDS = [18601, 18602, 18604, 18611, 18615];
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'mobs');
const MOBS_DIR = path.join(__dirname, '..', 'extract', 'out', 'mobs');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');

const STYLE_SUFFIX =
  "dark fantasy RPG creature portrait, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, dramatic lighting, painterly detail, " +
  "single creature centered, no text, no UI, no environment clutter";

function loadMob(id) {
  const mob = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, `${id}.json`), 'utf8'));
  const zoneMatch = mob.source_path.match(/\/(\d+)\.mob$/);
  const zoneId = zoneMatch ? zoneMatch[1] : null;
  const zone = zoneId
    ? JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${zoneId}.json`), 'utf8'))
    : null;
  return { id, shortDesc: mob.short_desc, longDesc: mob.long_desc,
           zoneName: zone ? zone.name : 'Unknown Zone' };
}

async function fetchImage(prompt, seed, outPath) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&seed=${seed}&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching seed ${seed}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`[gen-mob-art] wrote ${outPath} (${buf.length} bytes)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const id of MOB_IDS) {
    const mob = loadMob(id);
    const prompt = `${mob.zoneName}. ${mob.shortDesc} — ${mob.longDesc} ${STYLE_SUFFIX}`;
    await fetchImage(prompt, id, path.join(OUT_DIR, `${id}.jpg`));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const placeholderPrompt = `A shadowy, indistinct creature silhouette, details obscured by darkness. ${STYLE_SUFFIX}`;
  await fetchImage(placeholderPrompt, 0, path.join(OUT_DIR, 'placeholder.jpg'));

  console.log('[gen-mob-art] done');
}

main().catch((err) => {
  console.error('[gen-mob-art] failed:', err.message);
  process.exit(1);
});
