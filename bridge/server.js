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
const ECHO_OFF_RE = /\xFF\xFB\x01/g;
const ECHO_ON_RE = /\xFF\xFC\x01\r?\n?/g;

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

  tcp.on('data', (chunk) => {
    const text = chunk.toString('binary');

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
        const slots = match[1].split('|').map((pair) => {
          const [vnum, tier] = pair.split(':').map((n) => parseInt(n, 10));
          return { vnum, tier };
        });
        ws.send(JSON.stringify({ type: 'equip', slots }));
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
