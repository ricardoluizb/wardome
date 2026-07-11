# Mob illustrations — design

## Problem

The browser client shows AI-generated art for the 9 MVP rooms, but nothing for the 5 MVP mobs a player actually fights along that path (Pit Beast 18601, Newbie Monster 18602, Newbie Guard 18604, Annoying Newbie 18611, Smart Newbie 18615). Separately, the existing room art was generated from a bare `name + description` prompt with no environmental grounding, and — since it's an independently-generated image per room — has no visual continuity with its neighbors (a tunnel room can look nothing like the tunnel room next to it).

Item illustrations are explicitly out of scope for this spec — different subsystem (different hook point, different UX question of *where* item art would even display). Left for a future spec, per the earlier scope split.

## Part 1: Mob illustration pipeline

### C tag (`wdii/src/act.informative.c`)

New additive tag, `$$MOB:<vnum>$$\r\n`, added to `look_at_char(struct char_data * i, struct char_data * ch)` (defined at `act.informative.c:807`, called from `do_look` at `act.informative.c:1448`). Emitted only when the looked-at target is an NPC:

```c
if (IS_NPC(i)) {
  char mob_tag_buf[32];
  snprintf(mob_tag_buf, sizeof(mob_tag_buf), "$$MOB:%d$$\r\n", GET_MOB_VNUM(i));
  send_to_char(mob_tag_buf, ch);
}
```

Placed at the top of the function, before the existing description output — same additive style, same `send_to_char` mechanism, same buffer-then-send pattern as the room tag (`look_at_room`, `act.informative.c:1258-1283`). This is the third and last permitted change to `wdii/src` for this project (after the room tag and the stats tag). Trigger is "look at mob" (`look <mob-keyword>`), not combat — chosen to match the room tag's own trigger style (look-based, fires once per look, not once per combat round).

### Bridge (`bridge/server.js`)

Add a `MOB_TAG_RE` alongside the existing `ROOM_TAG_RE`/`STATS_TAG_RE`, reusing the existing `extractTag(text, re, onMatch)` helper (added in the HUD plan). Emits `{"type":"mob","id":<int>}` to the browser, same shape as the existing `{"type":"room","id":<int>}` message.

### Client (`web/client.js`)

```js
const MVP_MOB_ART = new Set([18601, 18602, 18604, 18611, 18615]);
```

On receiving a `mob` message, set `roomArtEl.src` to `assets/mobs/<id>.jpg` (or `assets/mobs/placeholder.jpg` for any mob outside the MVP set) — same element the room art already uses, not a new panel slot. No revert logic needed: the existing `room` message handler already unconditionally overwrites `roomArtEl.src` on every room view, so the next `look` (or movement, which re-triggers `look_at_room`) naturally swaps back to room art.

### Art generation (`tools/gen-mob-art.js`)

New script, sibling to `tools/gen-room-art.js`, same Pollinations.ai API and JPEG output flow. For each MVP mob vnum, reads `extract/out/mobs/<vnum>.json` and `extract/out/zones/<zone_id>.json` (for the zone name), builds:

```
`${zone.name}. ${mob.short_desc} — ${mob.long_desc} ${MOB_STYLE_SUFFIX}`
```

`MOB_STYLE_SUFFIX` is a creature-portrait-oriented variant of the room style suffix (same dark-fantasy Baldur's Gate 3 / Disco Elysium reference, but framed as a monster/character portrait rather than an environment wide-shot): `"dark fantasy RPG creature portrait, digital painting in the style of Baldur's Gate 3 and Disco Elysium, dramatic lighting, painterly detail, single creature centered, no text, no UI, no environment clutter"`.

`mob.flags_raw`/`stats1_raw`/`stats2_raw`/`stats3_raw` are deliberately NOT used in the prompt — these fields hold the mob's full in-game "look" paragraph split across an inconsistent number of raw lines per mob (some end in a numeric stats line, some end directly in `~`), and parsing that reliably isn't worth the complexity for a one-line prompt. `short_desc + long_desc` is already real, sufficient description (same standard the room-art prompt already meets with `name + description`).

Seed = mob vnum (deterministic, same convention as room art). Output: `web/assets/mobs/{18601,18602,18604,18611,18615,placeholder}.jpg`.

## Part 2: Room-art prompt enrichment + cross-room continuity

### Enriched prompt

`tools/gen-room-art.js`'s prompt gains two real fields that exist in `extract/out/rooms/*.json` but aren't currently used: the room's zone name and its `sector` (numeric, mapped via `wdii/src/constants.c:176` `sector_types[]` — `["Inside","City","Field","Forest","Hills","Mountains","Water (Swim)","Water (No Swim)","Underwater","In Flight"]`):

```
`${zone.name} — ${room.name}. Sector: ${SECTOR_NAMES[room.sector]}. ${desc} ${STYLE_SUFFIX}`
```

### Continuity mechanism

Walking the fixed MVP room order (`3001→3054→3059→3060→3061→18600→18601→18602→18603`), group rooms into contiguous runs by `sector` value (break the run whenever consecutive rooms' `sector` differs). For this slate that yields 3 segments:

| Segment | Rooms | Sector |
|---|---|---|
| 1 | 3001, 3054 | Inside |
| 2 | 3059, 3060, 3061, 18600 | City |
| 3 | 18601, 18602, 18603 | Inside |

(Segments 1 and 3 share the sector value but are not adjacent in the walk — they do NOT share a seed or continuity text with each other, only within their own contiguous run.)

Two levers applied per room based on its segment:

1. **Shared seed:** every room in a segment uses the *first* room's vnum as the Pollinations seed (not its own vnum) — anchors the image generation's underlying noise pattern across the whole segment.
2. **Continuity/transition clause,** appended to the prompt after the sector line:
   - If this room is NOT the first in its segment: `"Continuing the same environment as before, consistent architecture, materials, and lighting."`
   - If this room IS the first in its segment and it's not the very first room overall: `"Transitioning from ${prevSectorName} to ${thisSectorName}."`
   - The very first room overall (3001) gets neither clause.

This reuses only real, already-extracted data (room order, `sector` field) — no invented lore or hand-authored per-room continuity text.

### Regeneration

Re-running `tools/gen-room-art.js` with the enriched prompt overwrites all 9 existing `web/assets/rooms/*.jpg` (plus placeholder) in place — same filenames, same script, no client-side changes needed since `MVP_ROOM_ART` and the file-swap logic in `web/client.js` are untouched.

## Testing

Manual/observational only, per this project's established testing rigor:
- Run `node tools/gen-mob-art.js`, confirm 6 new JPEGs written (5 mobs + placeholder), spot-check that generated images look like the described creatures.
- Re-run `node tools/gen-room-art.js`, confirm the 9 room JPEGs (+ placeholder) are overwritten, spot-check the 3 segments for rough visual continuity (adjacent same-segment rooms sharing color palette/architecture; segment boundaries showing an actual scene change).
- Build/run the game in Docker, connect via the browser client, walk the MVP path, and `look` at each of the 5 MVP mobs — confirm the side panel swaps to mob art on look and back to room art on the next room view. Confirm an unlisted mob (any NPC outside the MVP set) falls back to `assets/mobs/placeholder.jpg`.
- Confirm zero `wdii/src` changes beyond the one additive block in `look_at_char()`.

## Out of scope

- Item illustrations (separate future spec — different hook point, different UX for where the art displays).
- Any change to combat/gameplay logic beyond the single additive tag.
- Video/animation, multiple images per mob, or per-instance (vs. per-vnum) art variation.
