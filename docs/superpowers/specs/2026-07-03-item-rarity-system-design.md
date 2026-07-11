# Item rarity + stat-variance drop system — design

## Scope note (read first)

This is a real, deliberate new gameplay mechanic in `wdii/src` — bigger than every prior exception (board-crash fix, deadly-start-room fix, both of which were *corrections* to existing broken config/logic). This is genuinely new behavior. User explicitly approved building it. Treat this as its own one-off, explicitly-approved exception to the "additive tags only" rule — it does not relax that rule for anything else.

## Problem / goal

User wants a Diablo-2-style item chase: killed mobs' loot rolls a rarity tier and a stat variance each time, so farming the same mob for the same known item is worth repeating (never a guaranteed "perfect" roll). Only items that already grant a stat bonus get this treatment — an item with no `affected[]` entries stays plain.

## Architecture

**Trigger point:** `make_corpse()` (`wdii/src/fight.c:365`), which already builds a dying character's corpse from their carried items (`corpse->contains = ch->carrying`, `fight.c:436`) and worn equipment (`for (i = 0; i < NUM_WEARS; i++) ... obj_to_obj(unequip_char(ch, i), corpse)`, `fight.c:442-444`). **Gated to NPCs only** (`IS_NPC(ch)`) — a player's own gear must never get randomly re-rolled just because they died.

**Per-instance mutation, not prototype mutation:** every object here was already instantiated via `read_object()` at some earlier zone reset (`*obj = obj_proto[i]`, a shallow/pointer copy — confirmed via direct code research). Mutating `obj->affected[i].modifier` in place is safe: `affected[MAX_OBJ_AFFECT]` is an embedded array (not a shared pointer) inside `struct obj_data`, so each instance already has its own independent copy — no other instance of the same vnum is affected.

**Rarity roll (new function `roll_item_rarity(struct obj_data *obj)` in `fight.c`):**
1. Skip if the object has no non-zero `affected[]` entry (`APPLY_NONE` or modifier `0` in all `MAX_OBJ_AFFECT` slots) — untouched, no tag.
2. Roll 1-100 (`number(1,100)`, this codebase's existing dice-roll helper) against a weighted table: Common 60 / Uncommon 25 / Rare 12 / Legendary 3.
3. For every existing non-zero `affected[i]`, adjust `modifier` by a random value in `[-variance, +variance]` (`number(-variance, variance)`), where `variance` = 0 (Common) / 1 (Uncommon) / 2 (Rare) / 3 (Legendary) — matches the user's own example (+2 base → +1 to +3 lands in the Uncommon band). Clamp so the modifier never crosses zero or flips sign (a +2 STR item can roll +1..+3, never 0 or negative) — preserves the item's original design intent ("respecting the item's [existing] levels" per the user's own framing: the item's pre-set value anchors the roll, nothing is invented from scratch, nothing scales unboundedly).
4. Prepend a colored bracket tag to `obj->short_description` via `str_dup()` (the established safe pattern for per-instance string mutation in this codebase — confirmed via `create_money`/`MakeScrap`/`oedit.c` prior art; `free_obj()` already pointer-compares before freeing, so this cannot double-free the prototype's shared string): `&n` (Common, no tag, skip), `&B[I]&n ` (Uncommon), `&Y[R]&n ` (Rare), `&R[L]&n ` (Legendary) — using this codebase's existing `&`-letter color-code convention (already used throughout `show_obj_to_char()`), bold-red as the closest available approximation to "legendary orange" since this fork's ANSI palette has no true orange.

**No wear-level gate.** `GET_OBJ_LEVEL`/`obj_level` exists but is purely cosmetic today (a `(+)` warning in `show_obj_to_char()`, never a hard block) — this plan does not add one. Explicitly out of scope per the user's own steer during design (asked, no response on a hard gate, proceeded with the non-invasive reading of "respecting levels" = anchor variance to the item's existing values, not a new wear restriction).

## File structure

- Modify: `wdii/src/fight.c` — new `roll_item_rarity()` function; call it once per object in both existing corpse-building loops (the carried-inventory loop at `fight.c:437-438` and the worn-equipment loop at `fight.c:442-444`), gated on `IS_NPC(ch)`.
- No other files change. Display already works for free — `show_obj_to_char()`/`list_obj_to_char()` (`act.informative.c`) already print `short_description` as-is; the tag is baked into the string at roll time, nothing downstream needs to know about rarity as a concept.

## Testing

Manual/observational, per project convention: kill an NPC known (from `extract/out/mobs`/zone data) to carry or wear an item with a real `affected[]` entry, repeatedly, and confirm: (a) items with no stat bonus never get a tag, (b) tagged items show a plausible rarity distribution across many kills (rough eyeball against the 60/25/12/3 weights, not a statistical test), (c) the displayed modifier for a tagged item's stat is always within its tier's variance band and never flips sign, (d) killing a PLAYER character does not apply any of this to their dropped gear.

## Out of scope (explicitly deferred)

- Set-item synergy bonuses (user's own stated "for later").
- A wear-level gate / GET_OBJ_LEVEL enforcement.
- Any new "loot table" concept (chance to drop an entirely new item not already in the mob's equipment/inventory) — this system only re-rolls existing, already-designed mob loot, it doesn't generate anything from nothing.
- Adjusting the 60/25/12/3 weights or the variance widths — shipped with these first-pass numbers, user said "depois podemos ajustar as % se necessário" (tune later if needed).
- Item illustrations, tag display anywhere other than `short_description` (e.g. not touching `description`/room-ground text).
