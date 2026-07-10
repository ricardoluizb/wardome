// bridge/server.js
const WebSocket = require('ws');
const net = require('net');

const GAME_HOST = process.env.GAME_HOST || 'localhost';
const GAME_PORT = parseInt(process.env.GAME_PORT || '4000', 10);
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8080', 10);

const ROOM_TAG_RE = /\$\$ROOM:(\d+)\|(.+?)\$\$\r?\n?/g;
const STATS_TAG_RE = /\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\/(\d+)\$\$\r?\n?/g;
const MOB_TAG_RE = /\$\$MOB:(-?\d+)\$\$\r?\n?/g;
const EQUIP_TAG_RE = /\$\$EQUIP:([^$]+)\$\$\r?\n?/g;
const AFFECTS_TAG_RE = /\$\$AFFECTS:([^$]*)\$\$\r?\n?/g;
const ECHO_OFF_RE = /\xFF\xFB\x01/g;
const ECHO_ON_RE = /\xFF\xFC\x01\r?\n?/g;

// Each $$TAG:...$$ is written to the socket in its own write_to_descriptor()
// call (comm.c), separate from the game's normal buffered output -- so a tag
// can legitimately land split across two TCP reads. If a chunk ends with an
// unterminated "$$TAGNAME:..." (no closing "$$" yet), hold that suffix back
// and prepend it to the next chunk instead of emitting it as literal text.
const PENDING_TAG_RE = /\$\$(?:ROOM|STATS|MOB|EQUIP|AFFECTS):[^$]*$/;

const wss = new WebSocket.Server({ port: BRIDGE_PORT });

function extractTag(text, re, onMatch) {
  let cleaned = '';
  let lastIndex = 0;
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    cleaned += text.slice(lastIndex, match.index);
    lastIndex = re.lastIndex;
    onMatch(match);
  }
  cleaned += text.slice(lastIndex);
  return cleaned;
}

wss.on('connection', (ws) => {
  const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });
  let pending = '';

  tcp.on('data', (chunk) => {
    const text = pending + chunk.toString('binary');
    pending = '';

    let cleaned = extractTag(text, ROOM_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'room', id: parseInt(match[1], 10), name: match[2] }));
      }
    });

    cleaned = extractTag(cleaned, STATS_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stats',
          hp: parseInt(match[1], 10),
          maxHp: parseInt(match[2], 10),
          mana: parseInt(match[3], 10),
          maxMana: parseInt(match[4], 10),
          move: parseInt(match[5], 10),
          maxMove: parseInt(match[6], 10),
          exp: parseInt(match[7], 10),
          gold: parseInt(match[8], 10),
          level: parseInt(match[9], 10),
          expToLevel: parseInt(match[10], 10),
        }));
      }
    });

    cleaned = extractTag(cleaned, EQUIP_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        const slots = match[1].split('|').map((piece) => {
          const parts = piece.split(':');
          const vnum = parseInt(parts[0], 10);
          const tier = parseInt(parts[1], 10);
          const itemType = parseInt(parts[2], 10);
          const valStr = parts[3] || '0,0,0';
          const [val0, val1, val2] = valStr.split(',').map((n) => parseInt(n, 10));
          const affStr = parts[4] || '';
          const nums = affStr.length === 0 ? [] : affStr.split(',').map((n) => parseInt(n, 10));
          const affects = [];
          for (let i = 0; i < nums.length; i += 2) {
            affects.push({ location: nums[i], modifier: nums[i + 1] });
          }
          return { vnum, tier, itemType, val0, val1, val2, affects };
        });
        ws.send(JSON.stringify({ type: 'equip', slots }));
      }
    });

    cleaned = extractTag(cleaned, AFFECTS_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        const affects = match[1].length === 0 ? [] : match[1].split('|').map((pair) => {
          const idx = pair.lastIndexOf(':');
          return { name: pair.slice(0, idx), duration: parseInt(pair.slice(idx + 1), 10) };
        });
        ws.send(JSON.stringify({ type: 'affects', affects }));
      }
    });

    cleaned = extractTag(cleaned, MOB_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'mob', id: parseInt(match[1], 10) }));
      }
    });

    cleaned = extractTag(cleaned, ECHO_OFF_RE, () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'echo', on: false }));
      }
    });

    cleaned = extractTag(cleaned, ECHO_ON_RE, () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'echo', on: true }));
      }
    });

    const partial = cleaned.match(PENDING_TAG_RE);
    if (partial) {
      pending = partial[0];
      cleaned = cleaned.slice(0, partial.index);
    }

    if (cleaned.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'text', data: cleaned }));
    }
  });

  tcp.on('close', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  tcp.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'text', data: `\r\n[bridge] connection error: ${err.message}\r\n` }));
      ws.close();
    }
  });

  ws.on('message', (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg.toString());
    } catch (e) {
      return;
    }
    if (parsed.type === 'cmd' && tcp.writable) {
      tcp.write(parsed.data + '\r\n', 'binary');
    }
  });

  ws.on('close', () => {
    tcp.destroy();
  });
});

console.log(`Wardome bridge listening on ws://localhost:${BRIDGE_PORT}, relaying to ${GAME_HOST}:${GAME_PORT}`);
