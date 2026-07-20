// bridge/server.js
const WebSocket = require('ws');
const net = require('net');
const fs = require('fs');
const path = require('path');

const GAME_HOST = process.env.GAME_HOST || 'localhost';
const GAME_PORT = parseInt(process.env.GAME_PORT || '4000', 10);
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8080', 10);
const AUTOMATION_DIR = process.env.AUTOMATION_DIR || '/data/automation';
const AUTOMATION_MAX_BYTES = 64 * 1024; // 64KB per character is generous for aliases/triggers/timers

fs.mkdirSync(AUTOMATION_DIR, { recursive: true });

const ROOM_TAG_RE = /\$\$ROOM:(\d+)\|(.+?)\$\$\r?\n?/g;
const STATS_TAG_RE = /\$\$STATS:(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(\d+)\/(-?\d+)\/(-?\d+)\/(\d+)\/(\d+)\$\$\r?\n?/g;
const MOB_TAG_RE = /\$\$MOB:(-?\d+)\$\$\r?\n?/g;
const EQUIP_TAG_RE = /\$\$EQUIP:([^$]+)\$\$\r?\n?/g;
const INV_TAG_RE = /\$\$INV:([^$]*)\$\$\r?\n?/g;
const AFFECTS_TAG_RE = /\$\$AFFECTS:([^$]*)\$\$\r?\n?/g;
const USER_TAG_RE = /\$\$USER:([^$]+)\$\$\r?\n?/g;
const FIGHT_TAG_RE = /\$\$FIGHT:([^$]+)\$\$\r?\n?/g;
const ECHO_OFF_RE = /\xFF\xFB\x01/g;
const ECHO_ON_RE = /\xFF\xFC\x01\r?\n?/g;

// Character names are alnum in this codebase (no spaces/specials allowed at
// creation) -- reject anything else so it can't be used as a path component.
const SAFE_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

function automationPath(name) {
  if (!SAFE_NAME_RE.test(name)) return null;
  return path.join(AUTOMATION_DIR, `${name.toLowerCase()}.json`);
}

// Each $$TAG:...$$ is written to the socket in its own write_to_descriptor()
// call (comm.c), separate from the game's normal buffered output -- so a tag
// can legitimately land split across two TCP reads. If a chunk ends with an
// unterminated "$$TAGNAME:..." (no closing "$$" yet), hold that suffix back
// and prepend it to the next chunk instead of emitting it as literal text.
const PENDING_TAG_RE = /\$\$(?:ROOM|STATS|MOB|EQUIP|AFFECTS|USER|FIGHT):[^$]*$/;

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
  let characterName = null;

  tcp.on('data', (chunk) => {
    const text = pending + chunk.toString('binary');
    pending = '';

    let cleaned = extractTag(text, USER_TAG_RE, (match) => {
      // Bind identity from the FIRST $$USER$$ tag only, then ignore all
      // later matches for this connection. The tag is emitted by
      // make_prompt() on every prompt, but this regex has no way to tell
      // that apart from the same literal bytes showing up because a player
      // echoed it back to themselves (e.g. `say $$USER:Darth$$`, which
      // act() relays straight back to the speaker's own screen unescaped).
      // Locking after the first legitimate tag -- which always arrives
      // right at the CON_PLAYING transition, before the player has typed
      // any command that could echo attacker text -- closes that spoof
      // window without needing engine-side output sanitization.
      if (characterName === null) {
        characterName = match[1];
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'user', name: characterName }));
        }
      }
    });

    cleaned = extractTag(cleaned, ROOM_TAG_RE, (match) => {
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

    cleaned = extractTag(cleaned, INV_TAG_RE, (match) => {
      if (ws.readyState === WebSocket.OPEN) {
        const items = match[1].length === 0 ? [] : match[1].split('|').map((piece) => {
          const [vnumStr, tierStr, typeStr] = piece.split(':');
          return { vnum: parseInt(vnumStr, 10), tier: parseInt(tierStr, 10), itemType: parseInt(typeStr, 10) };
        });
        ws.send(JSON.stringify({ type: 'inventory', items }));
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

    cleaned = extractTag(cleaned, FIGHT_TAG_RE, (match) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (match[1] === '-1') {
        ws.send(JSON.stringify({ type: 'fight', active: false }));
        return;
      }
      const parts = match[1].split('|');
      const [name, pctStr, levelStr, vnumStr, isNpcStr, affBody] = parts;
      const affects = (affBody || '').split(',').filter(Boolean).map((piece) => {
        const idx = piece.lastIndexOf(':');
        return { name: piece.slice(0, idx), duration: parseInt(piece.slice(idx + 1), 10) };
      });
      ws.send(JSON.stringify({
        type: 'fight',
        active: true,
        name,
        pct: parseInt(pctStr, 10),
        level: parseInt(levelStr, 10),
        vnum: parseInt(vnumStr, 10),
        isNpc: isNpcStr === '1',
        affects,
      }));
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
    } else if (parsed.type === 'automation_save') {
      if (!characterName) {
        ws.send(JSON.stringify({ type: 'automation_error', error: 'not logged in yet' }));
        return;
      }
      const filePath = automationPath(characterName);
      if (!filePath) return;
      const body = JSON.stringify(parsed.data ?? {});
      if (Buffer.byteLength(body, 'utf8') > AUTOMATION_MAX_BYTES) {
        ws.send(JSON.stringify({ type: 'automation_error', error: 'automation config too large' }));
        return;
      }
      fs.writeFile(filePath, body, 'utf8', (err) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'automation_error', error: 'save failed' }));
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'automation_saved' }));
        }
      });
    } else if (parsed.type === 'automation_load') {
      if (!characterName) {
        ws.send(JSON.stringify({ type: 'automation_error', error: 'not logged in yet' }));
        return;
      }
      const filePath = automationPath(characterName);
      if (!filePath) return;
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (err) {
          ws.send(JSON.stringify({ type: 'automation_loaded', data: null }));
          return;
        }
        try {
          ws.send(JSON.stringify({ type: 'automation_loaded', data: JSON.parse(data) }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'automation_loaded', data: null }));
        }
      });
    }
  });

  ws.on('close', () => {
    tcp.destroy();
  });
});

console.log(`Wardome bridge listening on ws://localhost:${BRIDGE_PORT}, relaying to ${GAME_HOST}:${GAME_PORT}`);
