// tools/gen-items-meta.js
// Regenerates web/assets/items-meta.json (vnum -> plain short_description,
// ANSI color codes stripped) by scanning every wdii/lib/world/obj/*.obj file
// directly. This is the client-side (web/client.js's `itemsMeta`) name
// lookup for the equipment paperdoll tooltip -- it was hand-maintained and
// silently went stale every time a new item got created, falling back to
// "item #<vnum>" in the UI. Safe to re-run any time; always regenerates the
// full file from the current world data, so it can never drift again.

const fs = require('fs');
const path = require('path');

const OBJ_DIR = path.join(__dirname, '..', 'wdii', 'lib', 'world', 'obj');
const OUT_FILE = path.join(__dirname, '..', 'web', 'assets', 'items-meta.json');

function stripColor(s) {
  return s.replace(/&[A-Za-z]/g, '');
}

function parseObjFile(text) {
  const entries = {};
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() !== '$') {
    const line = lines[i];
    if (line.startsWith('#')) {
      const vnum = line.slice(1).trim();
      i++;
      // keywords~ (may span multiple lines, ends at a line ending with ~)
      while (i < lines.length && !lines[i].trimEnd().endsWith('~')) i++;
      i++;
      // short_description~ -- this is the one we want
      let short = '';
      while (i < lines.length) {
        const l = lines[i];
        i++;
        if (l.trimEnd().endsWith('~')) {
          short += l.trimEnd().slice(0, -1);
          break;
        }
        short += l;
      }
      entries[vnum] = stripColor(short).trim();
      // skip the rest of this object's block until next # or $
      while (i < lines.length && !lines[i].startsWith('#') && lines[i].trim() !== '$') i++;
    } else {
      i++;
    }
  }
  return entries;
}

function main() {
  const files = fs.readdirSync(OBJ_DIR).filter((f) => f.endsWith('.obj'));
  const meta = {};
  for (const f of files) {
    const text = fs.readFileSync(path.join(OBJ_DIR, f), 'latin1');
    Object.assign(meta, parseObjFile(text));
  }
  const sorted = {};
  Object.keys(meta).map(Number).sort((a, b) => a - b).forEach((v) => {
    sorted[String(v)] = meta[String(v)];
  });
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`[gen-items-meta] wrote ${Object.keys(sorted).length} entries to ${OUT_FILE}`);
}

main();
