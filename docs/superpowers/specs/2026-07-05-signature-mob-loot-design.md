# Signature Mob Loot System — Design

## Goal

Give notable/boss mobs a curated, thematic item that can drop on death (not
guaranteed every kill), with stat variance and rarity tiers reusing the
existing `roll_item_rarity()` system. Gate the highest rarity tiers
(Rare/Legendary) behind mob difficulty so weak mobs can never roll them.
Pilot the whole system on one concrete area before expanding to others.

## Why this area

Zone 205 ("Wardome - The Termite Hill") currently has zero items assigned to
any of its 5 mobs — a clean slate for the pilot, confirmed by cross-checking
`extract/out/zones/*.json` for zones with mobs but no `G`/`E` reset commands.
Its mob roster has a clear difficulty gradient and an obvious boss:

| vnum  | name             | level |
|-------|------------------|-------|
| 20502 | Nymph            | 40    |
| 20503 | Termine Worker   | 60    |
| 20505 | Termine Soldier  | 80    |
| 20501 | Termine Guardian | 100   |
| 20504 | Termites King    | 100   |

Termites King (20504) is the target for the first signature drop.

## Scope

This is a pilot for **one** mob/item pair. The mechanism (data table +
hook function) is built to be extended by adding more table entries later —
no code changes needed to add the next area's signature drop, just a new
row and a new item.

## 1. New item: "a chitinous crown"

- New vnum: **20599** (zone 205's vnum range is 20500–20599; rooms occupy
  20500–20553, mobs occupy 20501–20505/20501, so 20599 is unused).
- New file: `wdii/lib/world/obj/205.obj` (this file does not exist yet).
- Registered in `wdii/lib/world/obj/index` (inserted before the terminating
  `$` line, same mechanism used when the world-old promotion rebuilt this
  index earlier in the project).
- Slot: HEAD (`ITEM_WEAR_TAKE | ITEM_WEAR_HEAD` = 1 + 16 = 17).
- Type: 9 (worn), matching the convention of other worn items in this world
  (e.g. vnum 18603 "a bright newbie helm").
- Base affect: `APPLY_CON` (location 5), modifier **+2**.
- Raw `.obj` entry:
  ```
  #20599
  crown chitinous termite king royal~
  a chitinous crown~
  A chitinous crown lies here, radiating royal authority.~
  ~
  9 65 17
  0 0 0 0
  2 5000 15000
  A
  5 2
  ```
- Icon: generated via the existing free Pollinations pipeline (same style
  suffix as `tools/gen-item-icons.js`), saved to
  `web/assets/items/20599.jpg`, one-off fetch (not added to the 290-item
  candidates/prompts JSON files, since those are specifically the
  auto-extracted equippable-item set — this is hand-authored content).

## 2. Signature-drop data table + hook (`wdii/src/fight.c`)

A small static table maps a mob vnum to an item vnum and a drop percentage.
Extending to a new area later means adding one row here (and authoring the
item, as above) — no other code changes.

```c
struct signature_drop_entry {
  int mob_vnum;
  int item_vnum;
  int drop_pct;
};

static struct signature_drop_entry SIGNATURE_DROPS[] = {
  { 20504, 20599, 30 },  /* Termites King -> a chitinous crown, 30% */
  { -1, -1, -1 }
};

struct obj_data *roll_signature_drop(int mob_vnum)
{
  int i;
  for (i = 0; SIGNATURE_DROPS[i].mob_vnum != -1; i++) {
    if (SIGNATURE_DROPS[i].mob_vnum == mob_vnum) {
      if (number(1, 100) <= SIGNATURE_DROPS[i].drop_pct)
        return read_object(SIGNATURE_DROPS[i].item_vnum, VIRTUAL);
      return NULL;
    }
  }
  return NULL;
}
```

### Hook point in `make_corpse()`

Inserted right after the existing equipment/inventory-transfer loop and gold
transfer, still inside the `IS_NPC(ch)`-relevant section, before
`obj_to_room(corpse, ch->in_room)`:

```c
if (IS_NPC(ch)) {
  struct obj_data *sig_drop = roll_signature_drop(GET_MOB_VNUM(ch));
  if (sig_drop != NULL) {
    roll_item_rarity(sig_drop, GET_LEVEL(ch));
    obj_to_obj(sig_drop, corpse);
  }
}
```

This only fires for NPCs (mobs), never player corpses, matching the existing
guard pattern already used for the two current `roll_item_rarity()` call
sites in this function.

## 3. Difficulty-gated rarity (modifies existing `roll_item_rarity()`)

This changes the **global** rarity system (`wdii/src/fight.c`), affecting
every item any mob in the game can roll rarity on — not just the new
signature-drop path.

- `roll_item_rarity()` gains a second parameter: `int mob_level`.
- Both existing call sites in `make_corpse()` (for carried inventory and
  worn equipment) pass `GET_LEVEL(ch)`.
- The new signature-drop call site (above) passes `GET_LEVEL(ch)` too.
- Threshold: **mob level 100**. Chosen from the world's mob level
  distribution (median 95, ~80th percentile at 163) — roughly the midpoint,
  and it exactly matches Termites King's own level, so the pilot boss is
  itself eligible for the full rarity range.
- Rule: if `mob_level < 100`, the roll is clamped so it can never land in
  the Rare (86–97) or Legendary (98–100) bands — those results collapse
  into the Uncommon band instead. Mobs at level 100+ roll the existing
  unmodified 60/25/12/3% distribution.
- Implementation: clamp the roll value right after it's generated, before
  the tier if/else chain:
  ```c
  int roll = number(1, 100);
  if (mob_level < 100 && roll > 85)
    roll = number(61, 85);
  ```

## 4. Max-roll "+" indicator

When an item's rarity roll is applied, every one of its non-zero
`affected[]` entries gets nudged by `number(-variance, variance)`. If
**every** modified affect happens to hit the extreme value for that roll
(i.e. the maximum possible boost for its tier), the item is a "perfect
roll" and its rarity tag gets a trailing `+`: `&Y[R]&n ` becomes
`&Y[R]+&n ` (color and letter unchanged, `+` inserted between the closing
bracket and the ANSI reset). This requires an item to have Uncommon/Rare/
Legendary variance (`variance > 0`); Common items (no tag) never show `+`.

This is a text-only change — no new WebSocket field, no new client/UI code.
The tag is visible wherever the game already prints the item's name
(`identify`, `equipment`, `inventory`, corpse-loot messages, etc.).

### Required fix in `wdii/src/comm.c`

The existing `$$EQUIP$$` tag-builder in `make_prompt()` detects rarity tier
by comparing the first 8 bytes of `short_description` against the exact
tag strings (`"&B[I]&n "`, `"&Y[R]&n "`, `"&R[L]&n "`). Appending `+` shifts
every byte after the bracket, breaking that 8-byte comparison for maxed
items — the paperdoll border color would silently fall back to tier 0
(no color) for a perfect-roll item. Fix: shorten the comparison to just the
5-byte prefix (`"&B[I]"`, `"&Y[R]"`, `"&R[L]"`), which matches regardless of
whether `+` follows:

```c
if (!strncmp(eq_obj->short_description, "&B[I]", 5))
  tier = 1;
else if (!strncmp(eq_obj->short_description, "&Y[R]", 5))
  tier = 2;
else if (!strncmp(eq_obj->short_description, "&R[L]", 5))
  tier = 3;
```

## Testing

1. Build succeeds after the `fight.c`/`comm.c` changes.
2. Rebuild the world data (`world/obj/index` + new `205.obj`), confirm the
   server boots cleanly (no `index_boot()` crash, same class of bug fixed
   earlier when `world-old` was promoted).
3. As an Implementor: `load mob 20504`, kill it repeatedly (enough trials to
   observe roughly 30% drop rate), confirm:
   - The corpse contains "a chitinous crown" roughly 3 times in 10 kills.
   - `identify`/`look`/`equipment` show the correct rarity tag, including
     `[R]+` or `[L]+` on a perfect roll (verify by repeating until one
     appears, or temporarily forcing `variance` values to test both paths).
   - Equipping the item shows the icon (once generated) with the correct
     rarity border color in the browser paperdoll, for both plain and `+`
     tagged rolls (confirms the `comm.c` 5-byte-prefix fix works).
4. Spawn a low-level mob (e.g. Nymph, level 40) with a stat-carrying item
   and confirm repeated kills never produce a Rare/Legendary tag on it —
   only Common/Uncommon.
