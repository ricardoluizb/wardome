# Hobgoblin Faction Equipment — Design

**Goal:** equip the hobgoblin faction in zone 178 ("Gnome Village") —
soldiers, bodyguards, miners, and the king — all of which currently spawn
with either broken or entirely missing equipment.

## Discovery: the whole zone has no real object file

`wdii/lib/world/obj/178.obj` does not exist anywhere in the world data,
and isn't registered in `wdii/lib/world/obj/index`. Every item vnum this
zone's `.zon` file references (17800-17825, 17853, including the
soldiers'/bodyguards' "a large club" at vnum 17821 and the king's "Heavy
banded mail" at vnum 17820) is a dead reference — the zone reset silently
fails to attach any of them (`SYSERR: zone file: Invalid vnum ..., cmd
disabled`, same class of rot found earlier this session in the newbie
zone). Fixing the gnome-side items (necklaces, staves, rings, etc.) is
out of scope — this spec covers only the hobgoblin faction, per explicit
user scope decision.

**Correction from the first pass of this spec:** an earlier read of the
zone file was truncated and missed that bodyguards and the king already
had their own (also broken) equipment lines — only the miners were
genuinely equipment-less from scratch. The full read of every `M`/`E`/`G`/`O`
line in `178.zon` shows:

- **Soldier** (vnum 17816): 12 total zone spawns. 8 of them (rooms
  17870/17869) already have `E 1 17821 40 16` right after their `M` line
  — just needs the object created. The other 4 (rooms 17881/17882) have
  no `E` line at all and need one added.
- **Bodyguard** (vnum 17817): 5 spawns (room 17867), each already has
  `E 1 17821 30 16` — currently pointing at the *same* club vnum as the
  soldiers. This spec upgrades that to a distinct item (see below), which
  means changing the vnum in those 5 existing lines, not adding new ones.
- **King** (vnum 17818): 1 spawn (room 17867), already has
  `E 1 17820 5 5` ("Heavy banded mail", wear position 5 = body) — needs
  the object created (keeping the original name/slot), plus one new `E`
  line added for the signature weapon.
- **Miner** (vnum 17819): 3 spawns (rooms 17861/17863/17888) — genuinely
  no equipment lines at all, needs new ones added.

New vnums for this spec (17830-17833) are chosen outside the range
already claimed by the zone's other (still-broken, out-of-scope)
references, so a future gnome-equipment fix won't collide with anything
created here.

## Mobs and levels (from `mob/178.mob`)

- Soldier hobgoblin (vnum 17816) — level unlisted in this pass, 12 zone
  spawns total (8 already reference vnum 17821, 4 need a new `E` line).
- Bodyguard hobgoblin (vnum 17817) — level 49, 5 zone spawns, all
  currently (wrongly) sharing the soldier's club vnum.
- King hobgoblin (vnum 17818) — level 50, unique boss, 1 zone spawn,
  already has a broken armor reference plus needs a new weapon line.
- Miner hobgoblin (vnum 17819) — level 45, 3 zone spawns, no equipment
  references at all.

## Items

1. **Vnum 17821** "a large club" (fixes the existing dead reference —
   used by soldiers only after this spec; see bodyguard change below).
   Type `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage 3d8. No affects — the
   rank-and-file weapon.
2. **Vnum 17830** "a spiked hobgoblin cudgel" (new, bodyguard). Type
   `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage 4d8, `APPLY_HITROLL +1`.
   Fixed stats, no rarity roll. Replaces vnum 17821 in the 5 existing
   bodyguard `E` lines (changes the vnum in-place, count stays 30 to
   match the existing line's max-existing field).
3. **Vnum 17831** "a rusty hobgoblin pickaxe" (new, miner). Type
   `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage 2d6, no affects — basic
   grunt gear. New `E` line added after each of the 3 miner `M` lines.
4. **Vnum 17832** "the Hobgoblin King's Greatclub" (new, king,
   **signature drop**). Type `ITEM_WEAPON`, wear `TAKE+WIELD`. Damage
   5d8, `APPLY_HITROLL +2` and `APPLY_DAMROLL +2` as the two affects
   that `roll_item_rarity()` will vary per the tier it rolls (matching
   the existing Common/Uncommon/Rare/Legendary variance system already
   built this session). New `E` line added after the king's `M` line,
   alongside the existing (fixed) armor line.
5. **Vnum 17820** "Heavy banded mail" (fixes the existing dead
   reference, keeping the original zone author's name and wear slot —
   king's armor, fixed, no rarity roll). Type `ITEM_ARMOR`, wear
   `TAKE+BODY`. `val0` left at 0 (this session's convention: use the
   `affected[]` block for the AC bonus, not the type's own value-based
   auto-apply, to avoid double-dipping — see the newbie boots item
   earlier this session for the same pattern). `APPLY_AC -6`,
   `APPLY_CON +1`. No `.zon` change needed — already wired.
6. **Vnum 17833** "a hobgoblin bodyguard's leather harness" (new,
   bodyguard, fixed armor, no rarity roll). Type `ITEM_ARMOR`, wear
   `TAKE+BODY`. `val0` left at 0. `APPLY_AC -5`. New `E` line added
   after each of the 5 bodyguard `M` lines, alongside the (now-changed)
   weapon line.

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

Items 1, 2, 3, 5, 6 are ordinary zone-reset equipment (`E`/`M` commands
in `178.zon`), no C changes.

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

New `wdii/lib/world/obj/178.obj` file with 6 items (needs `git add -f`
and a new entry in `wdii/lib/world/obj/index`, inserted between
`150.obj` and `186.obj` to keep the file's numeric ordering), several
`178.zon` edits (4 new soldier `E` lines, 5 bodyguard `E` lines changed
from vnum 17821 to 17830 plus 5 new lines added for the harness, 3 new
miner `E` lines, 1 new king `E` line for the weapon), and a one-line
addition to `fight.c`'s `SIGNATURE_DROPS[]` table. Requires a container
rebuild to load and compile, which wipes ephemeral pfiles like any other
deploy this session.

## Icons

Per user request, generate paperdoll icons for all new/fixed item vnums
(17820, 17821, 17830, 17831, 17832, 17833) via this project's existing
`tools/gen-item-icons.js` pipeline (Pollinations.ai, same as every other
item icon so far): add prompt entries to `tools/item-icon-prompts.json`
keyed by vnum, then run `node tools/gen-item-icons.js items` (it skips
vnums that already have an icon file, so it's safe to re-run). Also add
name entries to `web/assets/items-meta.json` (vnum → display name) so
the equipment tooltip feature shows real names instead of "item #vnum".
