// bridge/server.js
const WebSocket = require('ws');
const net = require('net');

const GAME_HOST = process.env.GAME_HOST || 'localhost';
const GAME_PORT = parseInt(process.env.GAME_PORT || '4000', 10);
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8080', 10);

const ROOM_TAG_RE = /\$\$ROOM:(\d+)\$\$\r?\n?/g;

const wss = new WebSocket.Server({ port: BRIDGE_PORT });

wss.on('connection', (ws) => {
  const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });

  tcp.on('data', (chunk) => {
    const text = chunk.toString('binary');
    let cleaned = '';
    let lastIndex = 0;
    ROOM_TAG_RE.lastIndex = 0;
    let match;
    while ((match = ROOM_TAG_RE.exec(text)) !== null) {
      cleaned += text.slice(lastIndex, match.index);
      lastIndex = ROOM_TAG_RE.lastIndex;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'room', id: parseInt(match[1], 10) }));
      }
    }
    cleaned += text.slice(lastIndex);
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
