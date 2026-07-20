// tools/gen-paths.js
// Computes the shortest walking path from Market Square (room 5406) to the
// closest entrance room of every zone listed in web/assets/data/areas.json,
// by parsing real room exits out of wdii/lib/world/wld/*.wld (same door
// format used by the game server itself). Zone membership for a room is
// vnum-range based (zone N owns rooms N*100..N*100+99), verified against
// the live world files -- confirmed to hold across every zone spot-checked.
//
// Usage: node tools/gen-paths.js
const fs = require('fs');
const path = require('path');

const WLD_DIR = path.join(__dirname, '..', 'wdii', 'lib', 'world', 'wld');
const AREAS_PATH = path.join(__dirname, '..', 'web', 'assets', 'data', 'areas.json');
const OUT_PATH = path.join(__dirname, '..', 'web', 'assets', 'data', 'paths.json');

const START_ROOM = 5406; // "The Center Of Market Square"
const DIR_NAMES = ['n', 'e', 's', 'w', 'u', 'd'];

function parseRooms() {
  const rooms = new Map(); // vnum -> { dir: toRoom }
  const files = fs.readdirSync(WLD_DIR).filter((f) => f.endsWith('.wld'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(WLD_DIR, file), 'latin1');
    const blocks = content.split(/\n(?=#\d+\n)/);
    for (const block of blocks) {
      const m = block.match(/^#(\d+)\n/);
      if (!m) continue;
      const vnum = parseInt(m[1], 10);
      const exits = {};
      const doorRe = /\nD(\d)\n(?:.*?~\n)(?:.*?~\n)(-?\d+) (-?\d+) (-?\d+)/gs;
      let dm;
      while ((dm = doorRe.exec(block)) !== null) {
        const dirNum = parseInt(dm[1], 10);
        const toRoom = parseInt(dm[4], 10);
        if (toRoom >= 0 && dirNum < 6) exits[DIR_NAMES[dirNum]] = toRoom;
      }
      rooms.set(vnum, exits);
    }
  }
  return rooms;
}

function bfsFrom(rooms, start) {
  const visited = new Map([[start, null]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const exits = rooms.get(cur) || {};
    for (const [dir, to] of Object.entries(exits)) {
      if (!visited.has(to)) {
        visited.set(to, [cur, dir]);
        queue.push(to);
      }
    }
  }
  return visited;
}

function tracePath(visited, goal) {
  const dirs = [];
  let node = goal;
  while (visited.get(node) !== null) {
    const [prev, dir] = visited.get(node);
    dirs.push(dir);
    node = prev;
  }
  dirs.reverse();
  const compact = [];
  let i = 0;
  while (i < dirs.length) {
    let j = i;
    while (j < dirs.length && dirs[j] === dirs[i]) j++;
    compact.push(`${j - i}${dirs[i]}`);
    i = j;
  }
  return { steps: dirs.length, compact: compact.join('') };
}

function main() {
  const areas = JSON.parse(fs.readFileSync(AREAS_PATH, 'utf8'));
  const rooms = parseRooms();
  console.log(`[gen-paths] parsed ${rooms.size} rooms`);

  const visited = bfsFrom(rooms, START_ROOM);
  console.log(`[gen-paths] ${visited.size} rooms reachable from room ${START_ROOM}`);

  const result = {};
  let found = 0;
  let missing = 0;

  for (const area of areas) {
    const lo = area.vnum * 100;
    const hi = lo + 99;
    let best = null;
    for (const vnum of visited.keys()) {
      if (vnum >= lo && vnum <= hi) {
        const dist = tracePath(visited, vnum).steps;
        if (!best || dist < best.dist) best = { vnum, dist };
      }
    }
    if (best) {
      const { compact, steps } = tracePath(visited, best.vnum);
      result[area.vnum] = { name: area.name, room: best.vnum, steps, path: compact };
      found++;
    } else {
      missing++;
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`[gen-paths] wrote ${OUT_PATH}: ${found} paths found, ${missing} zones unreachable`);
}

main();
