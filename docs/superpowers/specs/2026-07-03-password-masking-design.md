# Real password masking — design

## Problem

The browser client's `<input>` is always `type="text"`, so a player's password (and any other server-masked prompt: new-character password creation, password confirmation, the in-game "change your password" menu option) is always visible in plaintext as they type it. The original telnet game already signals when this should be masked — it sends real Telnet `IAC WILL ECHO` (bytes `0xFF 0xFB 0x01`) right before a masked prompt and `IAC WONT ECHO` (bytes `0xFF 0xFC 0x01`, followed by two incidental `\r\n` bytes from an unrelated constant reuse in the original code) right after — but the client currently just discards these bytes (`stripTelnetIac` in `web/client.js`) instead of acting on them.

No `wdii/src` change is needed: `wdii/src/comm.c`'s `echo_off()`/`echo_on()` (called from `interpreter.c` at every masked-prompt state: login password, new-character password + confirmation, and the in-game password-change menu option) already emit standard, unmodified Telnet protocol bytes. This is purely a bridge + client feature.

## Architecture

**Bridge (`bridge/server.js`):** add an `ECHO_OFF_RE`/`ECHO_ON_RE` byte-pattern match (not a `$$TAG$$`-style game tag — matching the two real Telnet sequences) alongside the existing `ROOM_TAG_RE`/`STATS_TAG_RE`/`MOB_TAG_RE`, reusing the `extractTag` helper. On `IAC WILL ECHO`, emit `{"type":"echo","on":false}`; on `IAC WONT ECHO`, emit `{"type":"echo","on":true}`. Both sequences (and, for the "on" case, the two incidental trailing bytes) are stripped from the `cleaned` text before it's sent as `{"type":"text",...}` — same responsibility the bridge already has for every other protocol/game signal.

**Client (`web/client.js`):** on an `echo` message, set `input.type = msg.on ? 'text' : 'password'`. Remove the now-redundant `stripTelnetIac` function and its call site — once the bridge strips these bytes at the source, the client never sees them, so the client-side workaround is dead code once this ships.

## Data flow

1. Server hits a masked-input state (e.g. login) → calls `echo_off()` → sends `IAC WILL ECHO` (3 raw bytes) over the telnet socket.
2. Bridge's TCP-data handler matches those 3 bytes, strips them from the outgoing text, sends `{"type":"echo","on":false}` over the WebSocket.
3. Client sets the command input to `type="password"` — the browser now renders whatever the player types as masked dots, exactly like a real telnet client's local-echo suppression.
4. Player submits (Enter) — same as today, the typed value goes out as a normal `{"type":"cmd",...}` message regardless of the input's `type`; masking is purely display, not a different data path.
5. Server finishes the masked prompt → calls `echo_on()` → sends `IAC WONT ECHO` (+ 2 incidental bytes) → bridge emits `{"type":"echo","on":true}` → client sets input back to `type="text"`.

This applies uniformly to every masked prompt in the game (login password, new-character password + confirm, in-game password-change) since the bridge/client react generically to the real signal — no per-menu special-casing needed.

## Out of scope

- Any change to `wdii/src` (none needed).
- Browser autofill/password-manager save prompts that `type="password"` may trigger — this is a local dev tool with throwaway test-character credentials, not a concern here.
- The mid-typing edge case where an echo-state change could theoretically arrive while the player has partially typed something — matches real telnet client behavior already (not a bug to engineer around), YAGNI.

## Testing

Manual/observational only, per this project's established testing rigor: connect via the browser client, verify the input visibly becomes masked (dots) at the login password prompt, stays masked through re-entry/confirmation during character creation, becomes plain text again once past it, and re-masks correctly if `change password` is used in-game. Confirm no raw `$$`-style noise or stray Telnet bytes appear in the output pane at any of these transitions.
