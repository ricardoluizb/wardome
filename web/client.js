// web/client.js
const output = document.getElementById('output');

// Long sessions otherwise grow the output <pre> unbounded, which makes
// every scrollTop-triggered reflow slower over time (the "typing lag that
// a relog fixes" symptom). Trim in batches so this stays O(1) amortized.
const MAX_OUTPUT_NODES = 4000;
const TRIM_TO_NODES = 2000;
function trimOutput() {
  if (output.childNodes.length > MAX_OUTPUT_NODES) {
    const removeCount = output.childNodes.length - TRIM_TO_NODES;
    for (let i = 0; i < removeCount; i++) {
      output.removeChild(output.firstChild);
    }
  }
}
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
const affectsListEl = document.getElementById('affects-list');
const targetPanelEl = document.getElementById('target-panel');
const targetNameEl = document.getElementById('target-name');
const targetLevelEl = document.getElementById('target-level');
const targetPortraitEl = document.getElementById('target-portrait');
const targetAffectsListEl = document.getElementById('target-affects-list');
const targetBarFillEl = document.getElementById('target-bar-fill');
const targetTextEl = document.getElementById('target-text');
const sidePanelEl = document.getElementById('side-panel');
const levelUpFlashEl = document.getElementById('level-up-flash');
const equipmentToggleEl = document.getElementById('equipment-toggle');
const equipmentOverlayEl = document.getElementById('equipment-overlay');
const equipmentCloseEl = document.getElementById('equipment-close');
const automationToggleEl = document.getElementById('automation-toggle');
const automationOverlayEl = document.getElementById('automation-overlay');
const automationCloseEl = document.getElementById('automation-close');
const automationListEl = document.getElementById('automation-list');
const automationMasterToggleEl = document.getElementById('automation-master-toggle');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = location.host ? `${WS_PROTOCOL}//${location.host}` : 'ws://localhost:8080';
const ws = new WebSocket(WS_URL);

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
// Clan-only artifacts get the extra rotating-glow highlight regardless of
// their rarity tier -- vnum 2404 is the Army of Immortals Scepter.
const CLAN_ARTIFACT_VNUMS = new Set([2404]);

const equipIconEls = EQUIP_SLOTS.map((def) => document.getElementById(`equip-icon-${def.area}`));
const lastEquipVnums = new Array(EQUIP_SLOTS.length).fill(undefined);
const lastEquipSlotData = new Array(EQUIP_SLOTS.length).fill(null);

const itemTooltipEl = document.getElementById('item-tooltip');
const TIER_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary'];
// Matches wdii/src/structs.h's ITEM_* type constants.
const ITEM_WEAPON = 5;
// Index matches wdii/src/structs.h's APPLY_* constants exactly (0=APPLY_NONE).
const APPLY_NAMES = [
  null, 'STR', 'DEX', 'INT', 'WIS', 'CON', 'CHA', 'CLASS', 'LEVEL', 'AGE',
  'WEIGHT', 'HEIGHT', 'MANA', 'HP', 'MOVE', 'GOLD', 'EXP', 'AC', 'HITROLL',
  'DAMROLL', 'SAVE-PARA', 'SAVE-ROD', 'SAVE-PETRI', 'SAVE-BREATH', 'SAVE-SPELL',
];

let itemsMeta = {};
fetch('assets/items-meta.json')
  .then((r) => r.json())
  .then((data) => { itemsMeta = data; })
  .catch(() => {});

function buildTooltipHtml(slot) {
  if (!slot || slot.vnum === -1) return null;
  const name = itemsMeta[String(slot.vnum)] || `item #${slot.vnum}`;
  const parts = [];
  parts.push(`<div class="tooltip-name">${escapeHtml(name)}</div>`);
  parts.push(`<div class="tooltip-tier">${TIER_NAMES[slot.tier] || 'Common'}</div>`);
  if (slot.itemType === ITEM_WEAPON && slot.val1 > 0 && slot.val2 > 0) {
    const avg = ((slot.val2 + 1) / 2) * slot.val1;
    parts.push(`<div class="tooltip-damage">Damage: ${slot.val1}d${slot.val2} (avg ${avg.toFixed(1)})</div>`);
  }
  (slot.affects || []).forEach((aff) => {
    const label = APPLY_NAMES[aff.location] || `#${aff.location}`;
    const sign = aff.modifier > 0 ? '+' : '';
    parts.push(`<div class="tooltip-affect">${sign}${aff.modifier} ${label}</div>`);
  });
  return parts.join('');
}

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

    const box = img.parentElement;
    box.addEventListener('mouseenter', () => {
      const html = buildTooltipHtml(lastEquipSlotData[i]);
      if (!html) return;
      itemTooltipEl.innerHTML = html;
      itemTooltipEl.classList.add('show');
    });
    box.addEventListener('mousemove', (e) => {
      itemTooltipEl.style.left = `${e.clientX + 14}px`;
      itemTooltipEl.style.top = `${e.clientY + 14}px`;
    });
    box.addEventListener('mouseleave', () => {
      itemTooltipEl.classList.remove('show');
    });
  });
}

function setEquip(msg) {
  msg.slots.forEach((slot, i) => {
    lastEquipSlotData[i] = slot;
    if (lastEquipVnums[i] === slot.vnum) return;
    lastEquipVnums[i] = slot.vnum;
    const def = EQUIP_SLOTS[i];
    const img = equipIconEls[i];
    if (slot.vnum === -1) {
      img.onerror = null;
      img.src = slotPlaceholderPath(def.type);
      img.classList.add('is-placeholder');
      img.parentElement.style.borderColor = TIER_BORDER_COLORS[0];
      img.parentElement.classList.remove('is-clan-artifact');
    } else {
      img.onerror = () => {
        img.onerror = null;
        img.src = slotPlaceholderPath(def.type);
        img.classList.add('is-placeholder');
      };
      img.classList.remove('is-placeholder');
      img.src = `assets/items/${slot.vnum}.jpg`;
      img.parentElement.style.borderColor = TIER_BORDER_COLORS[slot.tier] || TIER_BORDER_COLORS[0];
      img.parentElement.classList.toggle('is-clan-artifact', CLAN_ARTIFACT_VNUMS.has(slot.vnum));
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
  roomArtEl.onerror = () => {
    roomArtEl.onerror = null;
    roomArtEl.src = 'assets/mobs/placeholder.jpg';
  };
  roomArtEl.src = `assets/mobs/${id}.jpg`;
}

function setBar(fillEl, textEl, current, max, color) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  fillEl.style.width = `${pct * 100}%`;
  fillEl.style.backgroundColor = color;
  textEl.textContent = `${current}/${max}`;
}

let lastTargetKey = null;
let lastTargetPct = null;

function setTargetFight(msg) {
  if (!msg.active) {
    targetPanelEl.style.display = 'none';
    lastTargetKey = null;
    lastTargetPct = null;
    return;
  }
  targetPanelEl.style.display = '';
  targetNameEl.textContent = msg.name;
  targetNameEl.title = msg.name;
  targetLevelEl.textContent = Number.isFinite(msg.level) ? `Lv ${msg.level}` : '';

  const pct = Math.max(0, Math.min(100, msg.pct));
  targetBarFillEl.style.width = `${pct}%`;
  targetTextEl.textContent = `${pct}%`;

  targetPortraitEl.onerror = () => {
    targetPortraitEl.onerror = null;
    targetPortraitEl.src = 'assets/mobs/placeholder.jpg';
  };
  targetPortraitEl.src = msg.isNpc && msg.vnum >= 0 ? `assets/mobs/${msg.vnum}.jpg` : 'assets/mobs/placeholder.jpg';

  targetPanelEl.classList.remove('danger-easy', 'danger-even', 'danger-hard');
  if (Number.isFinite(msg.level) && lastLevel !== null) {
    const diff = msg.level - lastLevel;
    if (diff <= -5) targetPanelEl.classList.add('danger-easy');
    else if (diff >= 5) targetPanelEl.classList.add('danger-hard');
    else targetPanelEl.classList.add('danger-even');
  }

  const targetKey = `${msg.name}:${msg.vnum}`;
  if (targetKey === lastTargetKey && lastTargetPct !== null && pct < lastTargetPct) {
    targetPanelEl.classList.remove('hit-flash');
    void targetPanelEl.offsetWidth;
    targetPanelEl.classList.add('hit-flash');
  }
  lastTargetKey = targetKey;
  lastTargetPct = pct;

  targetAffectsListEl.innerHTML = '';
  (msg.affects || []).forEach((a) => {
    targetAffectsListEl.appendChild(renderAffectRow(a.name, a.duration));
  });
}

let lastLevel = null;

function triggerLevelUp() {
  sidePanelEl.classList.remove('level-up-glow');
  levelUpFlashEl.classList.remove('show');
  void sidePanelEl.offsetWidth;
  sidePanelEl.classList.add('level-up-glow');
  levelUpFlashEl.classList.add('show');
}

function setStats(stats) {
  setBar(hpBarFillEl, hpTextEl, stats.hp, stats.maxHp, '#e05252');
  setBar(manaBarFillEl, manaTextEl, stats.mana, stats.maxMana, '#4a90d9');
  setBar(moveBarFillEl, moveTextEl, stats.move, stats.maxMove, '#d4af37');
  levelLabelEl.textContent = `Lvl ${stats.level}`;
  if (lastLevel !== null && stats.level > lastLevel) {
    triggerLevelUp();
  }
  lastLevel = stats.level;
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

// Matches the sanitization gen-affect-icons.js applies when naming files --
// strips anything that isn't filename-safe (e.g. wdii/src/constants.c's
// "!TRACK" entry has a leading "!").
function affectFileName(name) {
  return name.replace(/[^A-Za-z0-9_-]/g, '');
}

function affectIconPath(name) {
  return `assets/affects/${affectFileName(name)}.jpg`;
}

function renderAffectRow(name, duration) {
  const row = document.createElement('div');
  row.className = 'affect-row';

  const img = document.createElement('img');
  img.className = 'affect-icon';
  img.src = affectIconPath(name);
  img.onerror = () => {
    img.onerror = null;
    img.src = 'assets/affects/placeholder.jpg';
  };

  const label = document.createElement('span');
  label.className = 'affect-name';
  label.textContent = name;

  const dur = document.createElement('span');
  dur.className = 'affect-duration';
  dur.textContent = duration < 0 ? '∞' : `${duration}t`;

  row.appendChild(img);
  row.appendChild(label);
  row.appendChild(dur);
  return row;
}

function setAffects(msg) {
  affectsListEl.innerHTML = '';
  msg.affects.forEach((a) => {
    affectsListEl.appendChild(renderAffectRow(a.name, a.duration));
  });
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
    trimOutput();
    output.scrollTop = output.scrollHeight;
    processTriggersForText(msg.data);
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.name;
    setRoomArt(msg.id);
  } else if (msg.type === 'mob') {
    setMobArt(msg.id);
  } else if (msg.type === 'stats') {
    setStats(msg);
  } else if (msg.type === 'equip') {
    setEquip(msg);
  } else if (msg.type === 'affects') {
    setAffects(msg);
  } else if (msg.type === 'echo') {
    input.type = msg.on ? 'text' : 'password';
  } else if (msg.type === 'user') {
    onCharacterIdentified(msg.name);
  } else if (msg.type === 'automation_loaded') {
    applyServerAutomationState(msg.data);
  } else if (msg.type === 'fight') {
    setTargetFight(msg);
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

// --- Automation: aliases, triggers, timers -------------------------------
// Everything here is client-side only (localStorage), driven by "#"-prefixed
// commands typed into the same input field. CircleMUD has no player command
// starting with "#", so anything beginning with "#" is safely intercepted
// and never sent to the server.

const AUTOMATION_KEY = 'wardome_automation_v1';
const MAX_ALIASES = 50;
const MAX_TRIGGERS = 50;
const MAX_TIMERS = 10;
const MIN_TIMER_SECONDS = 5;
const TRIGGER_MIN_PATTERN_LEN = 3;
const TRIGGER_COOLDOWN_MS = 1000;
const TRIGGER_STORM_WINDOW_MS = 10000;
const TRIGGER_STORM_LIMIT = 20;

function loadAutomationState() {
  try {
    const raw = localStorage.getItem(AUTOMATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        aliases: parsed.aliases || {},
        triggers: parsed.triggers || {},
        timers: parsed.timers || {},
        masterOn: parsed.masterOn !== false,
      };
    }
  } catch (e) {
    // corrupt/old data, start fresh
  }
  return { aliases: {}, triggers: {}, timers: {}, masterOn: true };
}

const automationState = loadAutomationState();
const timerHandles = {}; // name -> setInterval/setTimeout handle (not persisted)
let triggerFireLog = []; // timestamps of recent trigger fires, for the storm breaker
let triggerLineBuffer = '';

function buildAutomationPersistPayload() {
  const persist = {
    aliases: automationState.aliases,
    triggers: automationState.triggers,
    timers: {},
    masterOn: automationState.masterOn,
  };
  for (const [name, t] of Object.entries(automationState.timers)) {
    if (!t.oneShot) persist.timers[name] = { seconds: t.seconds, body: t.body, enabled: t.enabled, oneShot: false };
  }
  return persist;
}

function saveAutomationState() {
  const persist = buildAutomationPersistPayload();
  localStorage.setItem(AUTOMATION_KEY, JSON.stringify(persist));
  if (loggedInCharacterName && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'automation_save', data: persist }));
  }
}

// Set once the server confirms who's logged in (see the 'user' WS message).
// Triggers a one-time pull of that character's saved automation config from
// the bridge, which takes priority over whatever's cached in localStorage
// (localStorage is just an instant-paint fallback for before the server
// round-trip completes, and for the small window before login).
let loggedInCharacterName = null;
let hasLoadedServerAutomation = false;

function onCharacterIdentified(name) {
  loggedInCharacterName = name;
  if (hasLoadedServerAutomation) return;
  hasLoadedServerAutomation = true;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'automation_load' }));
  }
}

function applyServerAutomationState(data) {
  if (!data) return; // character has no saved config on the server yet
  automationState.aliases = data.aliases || {};
  automationState.triggers = data.triggers || {};
  automationState.masterOn = data.masterOn !== false;
  for (const [name, t] of Object.entries(automationState.timers)) {
    if (t.oneShot) continue; // leave in-flight one-shot timers alone
    clearTimerHandle(name);
  }
  automationState.timers = {};
  for (const [name, t] of Object.entries(data.timers || {})) {
    automationState.timers[name] = { ...t, oneShot: false };
    if (t.enabled !== false) startTimer(name);
  }
  localStorage.setItem(AUTOMATION_KEY, JSON.stringify(buildAutomationPersistPayload()));
  renderAutomationPanel();
}

function echoLocal(text, cls) {
  const span = cls ? `<span class="automation-echo ${cls}">${escapeHtml(text)}</span>` : `<span class="automation-echo">${escapeHtml(text)}</span>`;
  output.insertAdjacentHTML('beforeend', span + '\n');
  trimOutput();
  output.scrollTop = output.scrollHeight;
}

function findEntryKind(name) {
  const key = name.toLowerCase();
  if (automationState.aliases[key]) return 'aliases';
  if (automationState.triggers[key]) return 'triggers';
  if (automationState.timers[key]) return 'timers';
  return null;
}

function expandAlias(part) {
  const trimmed = part.trim();
  if (!trimmed) return [];
  const spaceIdx = trimmed.indexOf(' ');
  const firstWord = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
  const alias = automationState.masterOn ? automationState.aliases[firstWord] : null;
  if (!alias || alias.enabled === false) return [trimmed];
  const params = rest.split(/\s+/).filter(Boolean);
  let body = alias.body;
  if (body.includes('$')) {
    body = body.replace(/\$\*/g, rest);
    body = body.replace(/\$(\d+)/g, (m, n) => params[parseInt(n, 10) - 1] || '');
  } else if (rest) {
    body = `${body} ${rest}`;
  }
  return body.split(';').map((s) => s.trim()).filter(Boolean);
}

function sendCommand(part) {
  expandAlias(part).forEach((finalCmd) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cmd', data: finalCmd }));
    }
  });
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)');
  return new RegExp(escaped, 'i');
}

function matchTrigger(trigger, line) {
  if (trigger.isRegex) {
    try {
      const m = line.match(new RegExp(trigger.pattern, 'i'));
      return m ? m.slice(1) : null;
    } catch (e) {
      return null;
    }
  }
  if (trigger.pattern.includes('*')) {
    const m = line.match(wildcardToRegex(trigger.pattern));
    return m ? m.slice(1) : null;
  }
  return line.toLowerCase().includes(trigger.pattern.toLowerCase()) ? [] : null;
}

function checkTriggers(line) {
  if (!automationState.masterOn || !line) return;
  const now = Date.now();
  for (const [name, trigger] of Object.entries(automationState.triggers)) {
    if (trigger.enabled === false) continue;
    if (trigger.lastFired && now - trigger.lastFired < TRIGGER_COOLDOWN_MS) continue;
    const captures = matchTrigger(trigger, line);
    if (captures === null) continue;
    trigger.lastFired = now;
    triggerFireLog.push(now);
    triggerFireLog = triggerFireLog.filter((t) => now - t < TRIGGER_STORM_WINDOW_MS);
    if (triggerFireLog.length > TRIGGER_STORM_LIMIT) {
      automationState.masterOn = false;
      saveAutomationState();
      echoLocal('[automation disabled: trigger storm detected -- check your triggers, then #on all]', 'automation-warn');
      renderAutomationPanel();
      return;
    }
    echoLocal(`[trigger "${name}" fired]`, 'automation-fired');
    // Split on ';' BEFORE substituting captures, using only the trigger's own
    // static definition -- captured text comes from the game server (which
    // relays other players' chat/emotes) and must never be able to inject an
    // extra ';'-separated command segment that the trigger's author didn't
    // define. Any ';' inside a captured value is stripped, not treated as a
    // segment boundary.
    trigger.body.split(';').map((s) => s.trim()).filter(Boolean).forEach((segment) => {
      const cmd = captures.length > 0
        ? segment.replace(/\$(\d+)/g, (m, n) => (captures[parseInt(n, 10) - 1] || '').replace(/;/g, ''))
        : segment;
      sendCommand(cmd);
    });
    renderAutomationPanel();
  }
}

function processTriggersForText(rawText) {
  triggerLineBuffer += stripAnsi(rawText);
  const lines = triggerLineBuffer.split('\n');
  triggerLineBuffer = lines.pop();
  for (const line of lines) checkTriggers(line);
}

function clearTimerHandle(name) {
  if (timerHandles[name] !== undefined) {
    clearInterval(timerHandles[name]);
    clearTimeout(timerHandles[name]);
    delete timerHandles[name];
  }
}

function fireTimer(name) {
  const t = automationState.timers[name];
  if (!t) return;
  if (!automationState.masterOn || t.enabled === false || input.type === 'password' || ws.readyState !== WebSocket.OPEN) {
    if (t.oneShot) {
      delete automationState.timers[name];
      clearTimerHandle(name);
      saveAutomationState();
      renderAutomationPanel();
    }
    return;
  }
  echoLocal(`[timer "${name}" fired]`, 'automation-fired');
  t.body.split(';').map((s) => s.trim()).filter(Boolean).forEach(sendCommand);
  if (t.oneShot) {
    delete automationState.timers[name];
    clearTimerHandle(name);
    saveAutomationState();
  }
  renderAutomationPanel();
}

function startTimer(name) {
  const t = automationState.timers[name];
  if (!t) return;
  clearTimerHandle(name);
  if (t.oneShot) {
    timerHandles[name] = setTimeout(() => fireTimer(name), t.seconds * 1000);
  } else {
    timerHandles[name] = setInterval(() => fireTimer(name), t.seconds * 1000);
  }
}

function startAllTimers() {
  Object.keys(automationState.timers).forEach(startTimer);
}

function parseQuoted(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('"')) return null;
  const end = trimmed.indexOf('"', 1);
  if (end === -1) return null;
  return { value: trimmed.slice(1, end), rest: trimmed.slice(end + 1).trim() };
}

function handleAutomationCommand(raw) {
  const withoutHash = raw.slice(1);
  const spaceIdx = withoutHash.indexOf(' ');
  const cmd = (spaceIdx === -1 ? withoutHash : withoutHash.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : withoutHash.slice(spaceIdx + 1).trim();

  if (cmd === 'alias') {
    if (!rest) return listKind('aliases');
    const sp = rest.indexOf(' ');
    if (sp === -1) return echoLocal('Usage: #alias <name> <command;command;...>', 'automation-warn');
    const name = rest.slice(0, sp).toLowerCase();
    const body = rest.slice(sp + 1).trim();
    if (!body) return echoLocal('Usage: #alias <name> <command;command;...>', 'automation-warn');
    if (!automationState.aliases[name] && Object.keys(automationState.aliases).length >= MAX_ALIASES) {
      return echoLocal('[alias limit reached]', 'automation-warn');
    }
    automationState.aliases[name] = { body, enabled: true };
    saveAutomationState();
    renderAutomationPanel();
    echoLocal(`[alias "${name}" saved]`);
    return;
  }

  if (cmd === 'trigger') {
    if (!rest) return listKind('triggers');
    const sp = rest.indexOf(' ');
    if (sp === -1) return echoLocal('Usage: #trigger <name> "<pattern>" <command>', 'automation-warn');
    const name = rest.slice(0, sp).toLowerCase();
    const afterName = rest.slice(sp + 1).trim();
    let pattern, isRegex, body;
    if (afterName.startsWith('/')) {
      const end = afterName.indexOf('/', 1);
      if (end === -1) return echoLocal('Usage: #trigger <name> /regex/ <command>', 'automation-warn');
      pattern = afterName.slice(1, end);
      isRegex = true;
      body = afterName.slice(end + 1).trim();
    } else {
      const q = parseQuoted(afterName);
      if (!q) return echoLocal('Usage: #trigger <name> "<pattern>" <command>', 'automation-warn');
      pattern = q.value;
      isRegex = false;
      body = q.rest;
    }
    return saveTrigger(name, pattern, isRegex, body);
  }

  if (cmd === 'timer') {
    if (!rest) return listKind('timers');
    const m = rest.match(/^(\S+)\s+(\S+)\s+([\s\S]+)$/);
    if (!m) return echoLocal('Usage: #timer <name> <seconds> <command;command;...>', 'automation-warn');
    const name = m[1].toLowerCase();
    const seconds = parseInt(m[2], 10);
    const body = m[3].trim();
    if (isNaN(seconds) || seconds < MIN_TIMER_SECONDS) {
      return echoLocal(`[timer interval must be at least ${MIN_TIMER_SECONDS}s]`, 'automation-warn');
    }
    if (!automationState.timers[name] && Object.keys(automationState.timers).length >= MAX_TIMERS) {
      return echoLocal('[timer limit reached]', 'automation-warn');
    }
    automationState.timers[name] = { seconds, body, enabled: true, oneShot: false };
    saveAutomationState();
    startTimer(name);
    renderAutomationPanel();
    echoLocal(`[timer "${name}" saved]`);
    return;
  }

  if (cmd === 'delay') {
    const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) return echoLocal('Usage: #delay <seconds> <command;command;...>', 'automation-warn');
    const seconds = parseInt(m[1], 10);
    const body = m[2].trim();
    if (isNaN(seconds) || seconds <= 0) return echoLocal('[delay seconds must be a positive number]', 'automation-warn');
    const name = `delay${Date.now()}`;
    automationState.timers[name] = { seconds, body, enabled: true, oneShot: true };
    startTimer(name);
    renderAutomationPanel();
    echoLocal(`[delay set for ${seconds}s]`);
    return;
  }

  if (cmd === 'del') {
    const name = rest.toLowerCase();
    const kind = findEntryKind(name);
    if (!kind) return echoLocal(`[no automation entry named "${name}"]`, 'automation-warn');
    if (kind === 'timers') clearTimerHandle(name);
    delete automationState[kind][name];
    saveAutomationState();
    renderAutomationPanel();
    echoLocal(`["${name}" deleted]`);
    return;
  }

  if (cmd === 'on' || cmd === 'off') {
    const enable = cmd === 'on';
    const name = rest.toLowerCase();
    if (name === 'all') {
      automationState.masterOn = enable;
      saveAutomationState();
      renderAutomationPanel();
      echoLocal(`[automation ${enable ? 'enabled' : 'disabled'}]`);
      return;
    }
    const kind = findEntryKind(name);
    if (!kind) return echoLocal(`[no automation entry named "${name}"]`, 'automation-warn');
    automationState[kind][name].enabled = enable;
    saveAutomationState();
    renderAutomationPanel();
    echoLocal(`["${name}" ${enable ? 'enabled' : 'disabled'}]`);
    return;
  }

  if (cmd === 'list') {
    listKind('aliases');
    listKind('triggers');
    listKind('timers');
    return;
  }

  echoLocal(`[unknown automation command "#${cmd}"]`, 'automation-warn');
}

function saveTrigger(name, pattern, isRegex, body) {
  if (!name || !body) return echoLocal('Usage: #trigger <name> "<pattern>" <command>', 'automation-warn');
  if (pattern.length < TRIGGER_MIN_PATTERN_LEN) {
    return echoLocal(`[trigger pattern must be at least ${TRIGGER_MIN_PATTERN_LEN} characters]`, 'automation-warn');
  }
  const key = name.toLowerCase();
  if (!automationState.triggers[key] && Object.keys(automationState.triggers).length >= MAX_TRIGGERS) {
    return echoLocal('[trigger limit reached]', 'automation-warn');
  }
  automationState.triggers[key] = { pattern, isRegex, body, enabled: true, lastFired: 0 };
  saveAutomationState();
  renderAutomationPanel();
  echoLocal(`[trigger "${key}" saved]`);
}

function listKind(kind) {
  const entries = Object.entries(automationState[kind]);
  if (entries.length === 0) return;
  echoLocal(`-- ${kind} --`);
  entries.forEach(([name, e]) => {
    const state = e.enabled === false ? ' (off)' : '';
    if (kind === 'aliases') echoLocal(`  ${name} -> ${e.body}${state}`);
    else if (kind === 'triggers') echoLocal(`  ${name}  "${e.pattern}" -> ${e.body}${state}`);
    else echoLocal(`  ${name}  every ${e.seconds}s -> ${e.body}${state}`);
  });
}

function renderAutomationPanel() {
  if (!automationListEl || !automationMasterToggleEl) return;
  automationMasterToggleEl.checked = automationState.masterOn;
  automationListEl.innerHTML = '';

  const buildSection = (title, kind, formatBody) => {
    const entries = Object.entries(automationState[kind]);
    const section = document.createElement('div');
    section.className = 'automation-section';
    section.innerHTML = `<h3>${title}</h3>`;
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'automation-empty';
      empty.textContent = 'none defined';
      section.appendChild(empty);
    }
    entries.forEach(([name, e]) => {
      const row = document.createElement('div');
      row.className = 'automation-row';
      const label = document.createElement('span');
      label.className = 'automation-row-label';
      label.textContent = `${name}  ${formatBody(e)}`;
      label.title = 'Click to edit in the command line';
      label.addEventListener('click', () => {
        input.value = editLineFor(kind, name, e);
        input.focus();
      });
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = e.enabled !== false;
      toggle.addEventListener('change', () => {
        e.enabled = toggle.checked;
        if (kind === 'timers') {
          if (toggle.checked) startTimer(name);
          else clearTimerHandle(name);
        }
        saveAutomationState();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'automation-del';
      del.textContent = '×';
      del.addEventListener('click', () => {
        if (kind === 'timers') clearTimerHandle(name);
        delete automationState[kind][name];
        saveAutomationState();
        renderAutomationPanel();
      });
      row.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(del);
      section.appendChild(row);
    });
    automationListEl.appendChild(section);
  };

  buildSection('Aliases', 'aliases', (e) => `→ ${e.body}`);
  buildSection('Triggers', 'triggers', (e) => `"${e.pattern}" → ${e.body}`);
  buildSection('Timers', 'timers', (e) => `every ${e.seconds}s → ${e.body}`);
}

function editLineFor(kind, name, e) {
  if (kind === 'aliases') return `#alias ${name} ${e.body}`;
  if (kind === 'triggers') return e.isRegex ? `#trigger ${name} /${e.pattern}/ ${e.body}` : `#trigger ${name} "${e.pattern}" ${e.body}`;
  return `#timer ${name} ${e.seconds} ${e.body}`;
}

startAllTimers();

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const command = input.value;
  const isPasswordMode = input.type === 'password';

  if (!isPasswordMode && command.trim().startsWith('#')) {
    handleAutomationCommand(command.trim());
    if (command.length > 0) commandHistory.push(command);
    historyIndex = commandHistory.length;
    input.value = '';
    return;
  }

  if (ws.readyState === WebSocket.OPEN) {
    if (isPasswordMode) {
      ws.send(JSON.stringify({ type: 'cmd', data: command }));
    } else if (command.trim().length === 0) {
      // An empty Enter should still submit a blank line (e.g. to page
      // through a "-- MORE --" prompt), not be silently swallowed.
      // Sent directly, bypassing sendCommand()/expandAlias() -- the
      // latter explicitly returns [] for blank input since aliases
      // don't apply to an empty line, which meant this branch never
      // actually reached the WebSocket before this fix.
      ws.send(JSON.stringify({ type: 'cmd', data: '' }));
    } else {
      command.split(';').map((part) => part.trim()).filter((part) => part.length > 0).forEach(sendCommand);
    }
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

automationToggleEl.addEventListener('click', () => {
  automationOverlayEl.classList.toggle('open');
});

automationCloseEl.addEventListener('click', () => {
  automationOverlayEl.classList.remove('open');
});

automationMasterToggleEl.addEventListener('change', () => {
  automationState.masterOn = automationMasterToggleEl.checked;
  saveAutomationState();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    equipmentOverlayEl.classList.remove('open');
    automationOverlayEl.classList.remove('open');
  }
});

// Clicking anywhere in the terminal panel (not just the tiny input box)
// focuses the command input, so the player doesn't have to aim precisely.
document.getElementById('terminal-panel').addEventListener('click', () => {
  input.focus();
});

renderAutomationPanel();
