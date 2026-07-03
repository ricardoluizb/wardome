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
const MVP_MOB_ART = new Set([18601, 18602, 18604, 18611, 18615]);

function setRoomArt(id) {
  roomArtEl.src = MVP_ROOM_ART.has(id) ? `assets/rooms/${id}.jpg` : 'assets/rooms/placeholder.jpg';
}

function setMobArt(id) {
  roomArtEl.src = MVP_MOB_ART.has(id) ? `assets/mobs/${id}.jpg` : 'assets/mobs/placeholder.jpg';
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

// Maps the 8 base ANSI foreground color codes used by wdii/src/screen.h
// (KRED=31, KGRN=32, ... KWHT=37, both normal "0;NN" and bold "1;NN" forms)
// to colors that stay readable on this terminal's dark background.
const ANSI_COLORS = {
  30: '#6b6b6b',
  31: '#e05252',
  32: '#4caf50',
  33: '#d4af37',
  34: '#4a90d9',
  35: '#b366cc',
  36: '#4dd0c4',
  37: '#e0e0e0',
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripTelnetIac(text) {
  // Raw Telnet IAC negotiation sequences (e.g. IAC WILL/WONT/DO/DONT ECHO) that the
  // bridge passes through unmodified; without this they render as garbage characters
  // around prompts like "Password:". Real password masking (switching the input to
  // type="password" based on server echo state) is a separate, still-deferred task.
  return text.replace(/\xff[\xfb-\xfe]./g, '');
}

function ansiToHtml(rawText) {
  const text = stripTelnetIac(rawText);
  const parts = text.split(/(\x1b\[[0-9;]*[A-Za-z])/);
  let html = '';
  let openSpan = false;
  let bold = false;
  let dim = false;
  let underline = false;
  let color = null;

  for (const part of parts) {
    if (/^\x1b\[[0-9;]*[A-Za-z]$/.test(part)) {
      if (!part.endsWith('m')) {
        continue; // non-SGR CSI sequence (e.g. clear-screen "\x1b[2J"), drop it
      }
      const codes = part.slice(2, -1).split(';').filter(Boolean).map(Number);
      const effectiveCodes = codes.length ? codes : [0];
      for (const code of effectiveCodes) {
        if (code === 0) {
          bold = false;
          dim = false;
          underline = false;
          color = null;
        } else if (code === 1) {
          bold = true;
        } else if (code === 2) {
          dim = true;
        } else if (code === 4) {
          underline = true;
        } else if (ANSI_COLORS[code]) {
          color = ANSI_COLORS[code];
        }
      }
      if (openSpan) {
        html += '</span>';
        openSpan = false;
      }
      const styles = [];
      if (color) styles.push(`color:${color}`);
      if (bold) styles.push('font-weight:bold');
      if (dim) styles.push('opacity:0.6');
      if (underline) styles.push('text-decoration:underline');
      if (styles.length > 0) {
        html += `<span style="${styles.join(';')}">`;
        openSpan = true;
      }
    } else if (part) {
      html += escapeHtml(part);
    }
  }
  if (openSpan) {
    html += '</span>';
  }
  return html;
}

ws.addEventListener('open', () => {
  output.textContent += '[connected to Wardome]\n';
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.insertAdjacentHTML('beforeend', ansiToHtml(msg.data));
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
    setRoomArt(msg.id);
  } else if (msg.type === 'mob') {
    setMobArt(msg.id);
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
