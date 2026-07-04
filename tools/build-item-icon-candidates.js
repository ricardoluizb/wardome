// tools/build-item-icon-candidates.js
// Filters extract/out/objects/*.json down to the 290 equippable items
// (WEAPON=5, ARMOR=9, WORN=11) and dumps their name/description data for
// the icon-prompt-writing step (see docs/superpowers/plans/
// 2026-07-04-equipment-paperdoll.md Task 5).
const fs = require('fs');
const path = require('path');

const OBJECTS_DIR = path.join(__dirname, '..', 'extract', 'out', 'objects');
const OUT_PATH = path.join(__dirname, 'item-icon-candidates.json');

const TYPE_NAMES = { '5': 'weapon', '9': 'armor', '11': 'worn' };

function main() {
  const files = fs.readdirSync(OBJECTS_DIR).filter((f) => f.endsWith('.json'));
  const candidates = {};
  for (const file of files) {
    const obj = JSON.parse(fs.readFileSync(path.join(OBJECTS_DIR, file), 'utf8'));
    const typeCode = obj.header_raw.split(' ')[0];
    if (!(typeCode in TYPE_NAMES)) continue;
    candidates[obj.id] = {
      shortDesc: obj.short_desc,
      longDesc: obj.long_desc,
      type: TYPE_NAMES[typeCode],
    };
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(candidates, null, 2));
  console.log(`[build-item-icon-candidates] wrote ${OUT_PATH} (${Object.keys(candidates).length} items)`);
}

main();
