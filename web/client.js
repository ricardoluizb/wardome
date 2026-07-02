// web/client.js
const output = document.getElementById('output');
const roomIdEl = document.getElementById('room-id');
const roomArtEl = document.getElementById('room-art');
const hpBarFillEl = document.getElementById('hp-bar-fill');
const hpTextEl = document.getElementById('hp-text');
const manaBarFillEl = document.getElementById('mana-bar-fill');
const manaTextEl = document.getElementById('mana-text');
const moveBarFillEl = document.getElementById('move-bar-fill');
const moveTextEl = document.getElementById('move-text');
const statLineEl = document.getElementById('stat-line');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const ws = new WebSocket('ws://localhost:8080');

const MVP_ROOM_ART = new Set([3001, 3054, 3059, 3060, 3061, 18600, 18601, 18602, 18603]);

function setRoomArt(id) {
  roomArtEl.src = MVP_ROOM_ART.has(id) ? `assets/rooms/${id}.jpg` : 'assets/rooms/placeholder.jpg';
}

function barColor(pct) {
  if (pct > 0.5) return '#4caf50';
  if (pct > 0.25) return '#d4af37';
  return '#e05252';
}

function setBar(fillEl, textEl, current, max) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  fillEl.style.width = `${pct * 100}%`;
  fillEl.style.backgroundColor = barColor(pct);
  textEl.textContent = `${current}/${max}`;
}

function setStats(stats) {
  setBar(hpBarFillEl, hpTextEl, stats.hp, stats.maxHp);
  setBar(manaBarFillEl, manaTextEl, stats.mana, stats.maxMana);
  setBar(moveBarFillEl, moveTextEl, stats.move, stats.maxMove);
  statLineEl.textContent = `Lvl ${stats.level} · ${stats.gold} gold · ${stats.exp} exp`;
}

function stripAnsi(text) {
  // Strip ANSI escape codes for this milestone; color rendering is a later task.
  // Also strip raw Telnet IAC negotiation sequences (e.g. IAC WILL/WONT/DO/DONT ECHO)
  // that the bridge passes through unmodified; without this they render as garbage
  // characters around prompts like "Password:". Real password masking (switching the
  // input to type="password" based on server echo state) is out of scope here and is
  // deferred alongside the ANSI-color work.
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\xff[\xfb-\xfe]./g, '');
}

ws.addEventListener('open', () => {
  output.textContent += '[connected to Wardome]\n';
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.textContent += stripAnsi(msg.data);
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
    setRoomArt(msg.id);
  } else if (msg.type === 'stats') {
    setStats(msg);
  }
});

ws.addEventListener('close', () => {
  output.textContent += '\n[disconnected]\n';
});

ws.addEventListener('error', () => {
  output.textContent += '\n[connection error]\n';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const command = input.value;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cmd', data: command }));
  }
  input.value = '';
});
