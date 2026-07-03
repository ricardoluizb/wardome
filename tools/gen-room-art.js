// tools/gen-room-art.js
const fs = require('fs');
const path = require('path');

const ROOM_IDS = [3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603];
const OUT_DIR = path.join(__dirname, '..', 'web', 'assets', 'rooms');
const ROOMS_DIR = path.join(__dirname, '..', 'extract', 'out', 'rooms');
const ZONES_DIR = path.join(__dirname, '..', 'extract', 'out', 'zones');

// Matches wdii/src/constants.c:176 sector_types[] exactly.
const SECTOR_NAMES = [
  'Inside', 'City', 'Field', 'Forest', 'Hills', 'Mountains',
  'Water (Swim)', 'Water (No Swim)', 'Underwater', 'In Flight',
];

const STYLE_SUFFIX =
  "dark fantasy RPG environment concept art, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, moody atmospheric lighting, painterly detail, " +
  "wide shot, no text, no UI, no people, no characters";

function loadRoom(id) {
  const room = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, `${id}.json`), 'utf8'));
  const zone = JSON.parse(fs.readFileSync(path.join(ZONES_DIR, `${room.zone_id}.json`), 'utf8'));
  return { id, sector: room.sector, name: room.name, zoneName: zone.name,
            desc: room.description.replace(/\s+/g, ' ').trim() };
}

// Groups ROOM_IDS into contiguous runs of equal `sector`, in walk order.
// Each segment shares one Pollinations seed (its first room's id) so the
// underlying image noise pattern stays anchored across the whole run.
function computeSegments(rooms) {
  const segments = [];
  for (const room of rooms) {
    const last = segments[segments.length - 1];
    if (last && last.sector === room.sector) {
      last.rooms.push(room);
    } else {
      segments.push({ sector: room.sector, seedId: room.id, rooms: [room] });
    }
  }
  return segments;
}

function continuityClause(segments, segIndex, roomIndexInSegment) {
  if (roomIndexInSegment > 0) {
    return 'Continuing the same environment as before, consistent architecture, materials, and lighting.';
  }
  if (segIndex === 0) {
    return '';
  }
  const prevSector = SECTOR_NAMES[segments[segIndex - 1].sector];
  const thisSector = SECTOR_NAMES[segments[segIndex].sector];
  return `Transitioning from ${prevSector} to ${thisSector}.`;
}

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

  const rooms = ROOM_IDS.map(loadRoom);
  const segments = computeSegments(rooms);

  let segIndex = 0;
  for (const segment of segments) {
    for (let i = 0; i < segment.rooms.length; i++) {
      const room = segment.rooms[i];
      const clause = continuityClause(segments, segIndex, i);
      const sectorLine = `Sector: ${SECTOR_NAMES[room.sector]}.`;
      const prompt = [
        `${room.zoneName} — ${room.name}.`,
        sectorLine,
        room.desc,
        clause,
        STYLE_SUFFIX,
      ].filter(Boolean).join(' ');
      await fetchImage(prompt, segment.seedId, path.join(OUT_DIR, `${room.id}.jpg`));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    segIndex++;
  }

  const placeholderPrompt = `A foggy, dim, unmapped stone corridor fading into darkness. ${STYLE_SUFFIX}`;
  await fetchImage(placeholderPrompt, 0, path.join(OUT_DIR, 'placeholder.jpg'));

  console.log('[gen-room-art] done');
}

main().catch((err) => {
  console.error('[gen-room-art] failed:', err.message);
  process.exit(1);
});
