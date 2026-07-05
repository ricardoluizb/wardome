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
const levelLabelEl = document.getElementById('level-label');
const xpBarFillEl = document.getElementById('xp-bar-fill');
const xpTextEl = document.getElementById('xp-text');
const xpPercentEl = document.getElementById('xp-percent');
const goldTextEl = document.getElementById('gold-text');
const equipmentToggleEl = document.getElementById('equipment-toggle');
const equipmentOverlayEl = document.getElementById('equipment-overlay');
const equipmentCloseEl = document.getElementById('equipment-close');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = location.host ? `${WS_PROTOCOL}//${location.host}` : 'ws://localhost:8080';
const ws = new WebSocket(WS_URL);

const MVP_MOB_ART = new Set([18601, 18602, 18604, 18611, 18615]);

// Order matches WEAR_LIGHT=0..WEAR_FLOAT=22 (wdii/src/structs.h:421-443) --
// this is the exact same order the $$EQUIP$$ tag and bridge array use.
const EQUIP_SLOTS = [
  { area: 'light', type: 'light' },
  { area: 'ring-r', type: 'ring' },
  { area: 'ring-l', type: 'ring' },
  { area: 'neck-1', type: 'neck' },
  { area: 'neck-2', type: 'neck' },
  { area: 'body', type: 'body' },
  { area: 'head', type: 'head' },
  { area: 'legs', type: 'legs' },
  { area: 'feet', type: 'feet' },
  { area: 'hands', type: 'hands' },
  { area: 'arms', type: 'arms' },
  { area: 'shield', type: 'shield' },
  { area: 'about', type: 'about' },
  { area: 'waist', type: 'waist' },
  { area: 'wrist-r', type: 'wrist' },
  { area: 'wrist-l', type: 'wrist' },
  { area: 'wield', type: 'wield' },
  { area: 'hold', type: 'hold' },
  { area: 'dwield', type: 'dwield' },
  { area: 'ear-r', type: 'ear' },
  { area: 'ear-l', type: 'ear' },
  { area: 'face', type: 'face' },
  { area: 'float', type: 'float' },
];

const TIER_BORDER_COLORS = ['var(--gold-dim)', '#4a90d9', '#d4af37', '#e05252'];

const equipIconEls = EQUIP_SLOTS.map((def) => document.getElementById(`equip-icon-${def.area}`));
const lastEquipVnums = new Array(EQUIP_SLOTS.length).fill(undefined);

function slotPlaceholderPath(type) {
  return `assets/items/slots/${type}.jpg`;
}

function initEquipSlots() {
  EQUIP_SLOTS.forEach((def, i) => {
    const img = equipIconEls[i];
    img.src = slotPlaceholderPath(def.type);
    img.classList.add('is-placeholder');
    img.onerror = () => {
      img.onerror = null;
      img.src = slotPlaceholderPath(def.type);
      img.classList.add('is-placeholder');
    };
    img.parentElement.style.borderColor = TIER_BORDER_COLORS[0];
  });
}

function setEquip(msg) {
  msg.slots.forEach((slot, i) => {
    if (lastEquipVnums[i] === slot.vnum) return;
    lastEquipVnums[i] = slot.vnum;
    const def = EQUIP_SLOTS[i];
    const img = equipIconEls[i];
    if (slot.vnum === -1) {
      img.onerror = null;
      img.src = slotPlaceholderPath(def.type);
      img.classList.add('is-placeholder');
      img.parentElement.style.borderColor = TIER_BORDER_COLORS[0];
    } else {
      img.onerror = () => {
        img.onerror = null;
        img.src = slotPlaceholderPath(def.type);
        img.classList.add('is-placeholder');
      };
      img.classList.remove('is-placeholder');
      img.src = `assets/items/${slot.vnum}.jpg`;
      img.parentElement.style.borderColor = TIER_BORDER_COLORS[slot.tier] || TIER_BORDER_COLORS[0];
    }
  });
}

initEquipSlots();

function setRoomArt(id) {
  roomArtEl.onerror = () => {
    roomArtEl.onerror = null;
    roomArtEl.src = 'assets/rooms/placeholder.jpg';
  };
  roomArtEl.src = `assets/rooms/${id}.jpg`;
}

function setMobArt(id) {
  roomArtEl.src = MVP_MOB_ART.has(id) ? `assets/mobs/${id}.jpg` : 'assets/mobs/placeholder.jpg';
}

function setBar(fillEl, textEl, current, max, color) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  fillEl.style.width = `${pct * 100}%`;
  fillEl.style.backgroundColor = color;
  textEl.textContent = `${current}/${max}`;
}

function setStats(stats) {
  setBar(hpBarFillEl, hpTextEl, stats.hp, stats.maxHp, '#e05252');
  setBar(manaBarFillEl, manaTextEl, stats.mana, stats.maxMana, '#4a90d9');
  setBar(moveBarFillEl, moveTextEl, stats.move, stats.maxMove, '#d4af37');
  levelLabelEl.textContent = `Lvl ${stats.level}`;
  if (stats.expToLevel > 0) {
    setBar(xpBarFillEl, xpTextEl, stats.exp, stats.expToLevel, '#999999');
    xpPercentEl.textContent = `${Math.max(0, Math.min(100, Math.round((stats.exp / stats.expToLevel) * 100)))}%`;
  } else {
    xpBarFillEl.style.width = '100%';
    xpBarFillEl.style.backgroundColor = '#999999';
    xpTextEl.textContent = `${stats.exp} (max)`;
    xpPercentEl.textContent = '100%';
  }
  goldTextEl.textContent = stats.gold;
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

function ansiToHtml(rawText) {
  const text = rawText;
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
    roomIdEl.textContent = msg.name;
    setRoomArt(msg.id);
  } else if (msg.type === 'mob') {
    setMobArt(msg.id);
  } else if (msg.type === 'stats') {
    setStats(msg);
  } else if (msg.type === 'equip') {
    setEquip(msg);
  } else if (msg.type === 'echo') {
    input.type = msg.on ? 'text' : 'password';
  }
});

ws.addEventListener('close', () => {
  output.textContent += '\n[disconnected]\n';
});

ws.addEventListener('error', () => {
  output.textContent += '\n[connection error]\n';
});

const commandHistory = [];
let historyIndex = -1;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const command = input.value;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cmd', data: command }));
  }
  if (command.length > 0) {
    commandHistory.push(command);
  }
  historyIndex = commandHistory.length;
  input.value = '';
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex -= 1;
      input.value = commandHistory[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex += 1;
      input.value = commandHistory[historyIndex];
    } else {
      historyIndex = commandHistory.length;
      input.value = '';
    }
  }
});

equipmentToggleEl.addEventListener('click', () => {
  equipmentOverlayEl.classList.toggle('open');
});

equipmentCloseEl.addEventListener('click', () => {
  equipmentOverlayEl.classList.remove('open');
});
