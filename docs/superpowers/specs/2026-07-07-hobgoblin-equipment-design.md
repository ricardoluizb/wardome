# Hobgoblin Faction Equipment — Design

**Goal:** equip the hobgoblin faction in zone 178 ("Gnome Village") —
soldiers, bodyguards, miners, and the king — all of which currently spawn
with either broken or entirely missing equipment.

## Discovery: the whole zone has no real object file

`wdii/lib/world/obj/178.obj` does not exist anywhere in the world data,
and isn't registered in `wdii/lib/world/obj/index`. Every item vnum this
zone's `.zon` file references (17800-17825, 17853, including the
soldiers' "a large club" at vnum 17821) is a dead reference — the zone
reset silently fails to attach any of them (`SYSERR: zone file: Invalid
vnum ..., cmd disabled`, same class of rot found earlier this session in
the newbie zone). Fixing the gnome-side items (necklaces, staves, rings,
etc.) is out of scope — this spec covers only the hobgoblin faction
(soldier/bodyguard/miner/king), per explicit user scope decision. New
vnums for this spec (17830-17834) are chosen outside the range already
claimed by the zone's other (still-broken, out-of-scope) references, so
a future gnome-equipment fix won't collide with anything created here.

## Mobs and levels (from `mob/178.mob`)

- Soldier hobgoblin (vnum 17816) — level unlisted in this pass, ~8 zone
  spawns, currently references vnum 17821 (dead).
- Bodyguard hobgoblin (vnum 17817) — level 49, 5 zone spawns, no
  equipment at all.
- King hobgoblin (vnum 17818) — level 50, unique boss, 1 zone spawn, no
  equipment at all.
- Miner hobgoblin (vnum 17819) — level 45, several zone spawns, no
  equipment at all.

## Items

1. **Vnum 17821** "a large club" (fixes the existing dead reference,
   already wired into the zone reset for the soldier — no `.zon` change
   needed for this one, only creating the object itself). Type
   `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage 3d8. No affects — this is
   the rank-and-file weapon.
2. **Vnum 17830** "a spiked hobgoblin cudgel" (new, bodyguard). Type
   `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage 4d8, `APPLY_HITROLL +1`.
   Fixed stats, no rarity roll. Zone-reset `E` line capped at 5 (matches
   bodyguard spawn count).
3. **Vnum 17831** "a rusty hobgoblin pickaxe" (new, miner). Type
   `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage 2d6, no affects — basic
   grunt gear.
4. **Vnum 17832** "the Hobgoblin King's Greatclub" (new, king,
   **signature drop**). Type `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage
   5d8, `APPLY_HITROLL +2` and `APPLY_DAMROLL +2` as the two affects
   that `roll_item_rarity()` will vary per the tier it rolls (matching
   the existing Common/Uncommon/Rare/Legendary variance system already
   built this session).
5. **Vnum 17833** "a hobgoblin bodyguard's leather harness" (new,
   bodyguard, fixed armor, no rarity roll). Type `ITEM_ARMOR`, wear
   `TAKE+BODY`. `val0` left at 0 (this session's convention: use the
   `affected[]` block for the AC bonus, not the type's own
   value-based auto-apply, to avoid double-dipping — see the newbie
   boots item earlier this session for the same pattern).
   `APPLY_AC -5`. Zone-reset `E` line capped at 5 (matches bodyguard
   spawn count).
6. **Vnum 17834** "the Hobgoblin King's robes" (new, king, fixed armor,
   no rarity roll — separate from the signature weapon, which is the
   only rolled item). Type `ITEM_ARMOR`, wear `TAKE+BODY`. `val0` left
   at 0. `APPLY_AC -6`, `APPLY_CON +1` (matches the mob's own flavor
   text: "muscles bulge out of his robes"). Zone-reset `E` line capped
   at 1 (unique boss).

**Balance calibration** (checked against the whole game's existing item
range, not just this batch, per standing project guidance): sampled
every `APPLY_AC` affect magnitude across all `wdii/lib/world/obj/*.obj`
files — `-5` is the single most common value (8 occurrences) for a
"solid armor" item, with values up to `-15` for the game's actual
top-end gear. `-5` (bodyguard) and `-6` (king) sit at the common/
slightly-above-common end of that range — appropriately strong for a
level 45-50 area's elite guard and unique boss, without reaching
end-game-tier numbers.

## Mechanism

Items 1-3 are ordinary zone-reset equipment (`E`/`M` commands in
`178.zon`), no C changes.

Item 4 reuses the **already-generic** signature-drop system built
earlier this session (`fight.c`'s `SIGNATURE_DROPS[]` table +
`roll_signature_drop()` + the existing `roll_item_rarity()` call already
wired into `make_corpse()`). This needs exactly one new line added to
the existing table:

```c
{ 17818, 17832, 30 },  /* King of the Hobgoblins -> the Greatclub, 30% */
```

No other C code changes are needed — `make_corpse()` already calls
`roll_signature_drop(GET_MOB_VNUM(ch))` then `roll_item_rarity(sig_drop,
GET_LEVEL(ch))` unconditionally for any NPC death, and the one existing
special case in that code path (Sanctuary-on-Rare) is hardcoded to check
`GET_OBJ_VNUM(sig_drop) == 20599` specifically, so it won't interact
with vnum 17832 at all.

## Deployment

New `wdii/lib/world/obj/178.obj` file (needs `git add -f` and a new
entry in `wdii/lib/world/obj/index`), one new `E` line per bodyguard
spawn in `178.zon` for the cudgel AND the harness (bodyguards have 5
separate `M` zone-reset lines, each needs its own following `E` lines,
matching the existing per-spawn pattern already used for soldiers), one
new `E` line per miner spawn (3 `M` lines) for the pickaxe, one `E` line
after the king's single `M` line for both the Greatclub and the robes,
and a one-line addition to `fight.c`'s `SIGNATURE_DROPS[]` table. The
soldier's existing `E 1 17821 40 16` lines (already present, 8 of them)
need no `.zon` change at all — only the object itself was missing.
Requires a container rebuild to load and compile, which wipes ephemeral
pfiles like any other deploy this session.
