# Equipment Paperdoll — Design

## Goal

Add a Diablo 2-style equipment paperdoll to the browser client: a button on the side panel opens an overlay showing all 23 equipment slots as a humanoid silhouette. Each occupied slot shows a small unique icon for the actual item worn there; empty slots show a generic outline for that slot's type. Every icon is bordered in a color matching the item's current rarity tier (the `[I]`/`[R]`/`[L]`/no-tag system already shipped in `wdii/src/fight.c`'s `roll_item_rarity()`).

## Architecture

Three layers, following the same additive-tag pattern already used for `$$STATS$$` and `$$ROOM$$`:

1. **C (`wdii/src/comm.c`)**: `make_prompt()` gains a new `$$EQUIP:...$$` tag, emitted at the same cadence as `$$STATS$$` (every prompt). It reports, for all 23 `WEAR_*` positions in fixed order, which item vnum (or `-1`/`NOTHING` if empty) occupies that slot, and a rarity tier number derived by inspecting the item's live `short_description` for the existing tag prefixes.
2. **Bridge (`bridge/server.js`)**: parses the tag, forwards a structured `equip` WebSocket message with a 23-entry array.
3. **Client (`web/client.js` / `web/play.html` / `web/style.css`)**: renders the paperdoll overlay, toggled by a new button, using pre-generated icon images keyed by item vnum with a graceful per-slot-type fallback.

No gameplay logic changes; `roll_item_rarity()` in `fight.c` is not touched — the new tag only reads the text it already produces.

## Data: the `$$EQUIP$$` tag

**Format:** `$$EQUIP:<v0>:<t0>|<v1>:<t1>|...|<v22>:<t22>$$\r\n`, one `vnum:tier` pair per `WEAR_*` index in ascending order (`WEAR_LIGHT=0` ... `WEAR_FLOAT=22`, per `structs.h:421-443`). `vnum` is `-1` (matches `NOTHING`, `structs.h:37`) when the slot is empty. `tier` is `0` (Common), `1` (Uncommon), `2` (Rare), or `3` (Legendary).

**Tier derivation (read-only, no new state):** for each occupied slot, check whether `GET_EQ(ch, i)->short_description` starts with one of the three known rarity prefixes baked in by `roll_item_rarity()` (`fight.c`):
- `"&B[I]&n "` → tier 1 (Uncommon)
- `"&Y[R]&n "` → tier 2 (Rare)
- `"&R[L]&n "` → tier 3 (Legendary)
- none of the above → tier 0 (Common)

**Emission point:** inside `make_prompt()` in `comm.c`, in the same `STATE(d) == CON_PLAYING && !IS_NPC(d->character)` block that already emits `$$STATS$$`, right after it.

## Bridge

New regex `EQUIP_TAG_RE`, capturing the full body between `$$EQUIP:` and the closing `$$`. The bridge splits the body on `|` then `:` and forwards:

```json
{ "type": "equip", "slots": [{ "vnum": -1, "tier": 0 }, ...23 entries...] }
```

## Client rendering

**Trigger:** a new button in the side panel header area (near the `WARDOME II - REBORN` title) labeled e.g. "Equipment". Clicking toggles an overlay `<div id="equipment-overlay">` positioned absolutely over the side panel (covering room art/status while open), roughly half the viewport width, full height. A close control (X or click-outside) hides it again. Room/status/HUD elements underneath are unaffected (not destroyed, just visually covered) — the WebSocket keeps updating them in the background exactly as before.

**Layout** (CSS grid, `grid-template-areas`, matching the approved silhouette):

```
        [Ear-L] [Head] [Ear-R]
              [Face]
        [Neck1]   [Neck2]
              [About]
     [Arms] [Body] [Shield]
   [Wrist-L] [Hands] [Wrist-R]
              [Waist]
        [Ring-L]  [Ring-R]
           [Legs] [Feet]
     [Hold/Dwield]   [Wield]
        [Light]  [Float]
```

**Slot definition table** (client-side constant, maps `WEAR_*` index → grid area name → placeholder type; several indices share a placeholder type):

| WEAR index | Name | Grid area | Placeholder type |
|---|---|---|---|
| 0 | LIGHT | light | light |
| 1 | FINGER_R | ring-r | ring |
| 2 | FINGER_L | ring-l | ring |
| 3 | NECK_1 | neck-1 | neck |
| 4 | NECK_2 | neck-2 | neck |
| 5 | BODY | body | body |
| 6 | HEAD | head | head |
| 7 | LEGS | legs | legs |
| 8 | FEET | feet | feet |
| 9 | HANDS | hands | hands |
| 10 | ARMS | arms | arms |
| 11 | SHIELD | shield | shield |
| 12 | ABOUT | about | about |
| 13 | WAIST | waist | waist |
| 14 | WRIST_R | wrist-r | wrist |
| 15 | WRIST_L | wrist-l | wrist |
| 16 | WIELD | wield | wield |
| 17 | HOLD | hold | hold |
| 18 | DWIELD | dwield | dwield |
| 19 | EAR_R | ear-r | ear |
| 20 | EAR_L | ear-l | ear |
| 21 | FACE | face | face |
| 22 | FLOAT | float | float |

19 distinct placeholder types (`ring`, `neck`, `wrist`, `ear` are each shared by 2 slots).

**Icon resolution per slot:** `assets/items/<vnum>.jpg` if the occupying vnum has a generated icon; on image load error (`onerror`), fall back to `assets/items/slots/<placeholder-type>.jpg` (the same asset an empty slot shows). This means any equippable item without pre-generated art still degrades gracefully to its generic type outline instead of a broken image.

**Rarity border:** each slot icon gets a `border` colored by its `tier`:
- 0 (Common): `var(--gold-dim)` (neutral, matches existing UI accents)
- 1 (Uncommon): `#4a90d9` (blue)
- 2 (Rare): `#d4af37` (gold — reuses `var(--gold)`)
- 3 (Legendary): `#e05252` (red)

These are the exact hex values already used elsewhere in this client (HP bar red, mana bar blue, `--gold`), and match the ANSI codes the C tags (`&B`/`&Y`/`&R`) actually render as.

## Icon generation

**Scope:** every object in `extract/out/objects/*.json` whose `header_raw` type field is WEAPON (5), ARMOR (9), or WORN (11) — 290 items total (154 + 116 + 20, already confirmed against live extraction data) — plus 19 generic placeholder icons (one per distinct slot type above).

**Pipeline:** Pollinations.ai (`https://image.pollinations.ai/prompt/...`), this project's original free/no-key image pipeline (distinct from the paid `gpt-image-1` pipeline used for room/mob/UI-texture art). Small output size: `width=128&height=128`. Deterministic `seed=<vnum>` (or a fixed constant per placeholder type) for reproducibility. Style: dark-fantasy RPG item icon, single object centered, dark neutral background, no text/UI/scene — consistent with this project's established room/mob art tone.

**Prompt content:** built from each item's real `short_desc`/`long_desc`/type (from `extract/out/objects/<vnum>.json`), not generic placeholders. Writing high-quality, evocative per-item prompts for ~290 items is a bounded creative-writing task — delegated to a Fable 5 subagent focused solely on generating the prompt text (given the item's raw name/description as input, it returns one polished image-generation prompt per item). The subagent does not touch code; it only produces the prompt strings consumed by the generation script.

**New tool:** `tools/gen-item-icons.js` — a one-off batch script (same shape as `tools/gen-world-art.js`), run once ahead of time, not at runtime. Writes to `web/assets/items/<vnum>.jpg` and `web/assets/items/slots/<type>.jpg`.

## Files touched

- Modify: `wdii/src/comm.c` (`make_prompt()` — new `$$EQUIP$$` tag block)
- Modify: `bridge/server.js` (new regex + `equip` message type)
- Modify: `web/play.html` (equipment button, overlay markup)
- Modify: `web/style.css` (overlay layout, grid, slot/border styling)
- Modify: `web/client.js` (equip message handling, slot rendering, overlay toggle)
- Create: `tools/gen-item-icons.js` (batch icon generator)
- Create: `web/assets/items/*.jpg` (290 item icons), `web/assets/items/slots/*.jpg` (19 placeholders)

## Testing

Per this project's established testing rigor (manual/observational only): rebuild the game container (C change), restart the bridge (regex change), reload the client, equip/remove several real items of different rarity tiers on a test character, and visually confirm: the button opens/closes the overlay, each occupied slot shows the correct item icon with the correct rarity border color, empty slots show the correct generic outline, and an item with no generated icon (if any slip through scope) falls back to its type placeholder instead of a broken image.
