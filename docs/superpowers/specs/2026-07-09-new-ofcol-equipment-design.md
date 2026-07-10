# New Ofcol (Zone 176) Full Equipment + Dragon's Barrel — Design

**Note:** per explicit user instruction ("pode criar tudo sem me perguntar
dessa area"), this spec was authored and approved autonomously without an
approval gate — still documented here for the same traceability every
other zone fix this session received.

**Goal:** zone 176 "New Ofcol" has a complete equipment design already
authored into its zone-reset file (guard/captain/marshal armor tiers,
a named legendary weapon, a full dragon-scale set, and boss-unique
items for the Ancient Gold Dragon) but zero backing object file — every
single item is a dead reference, same class of rot fixed in other zones
this session. This recreates all ~60 referenced items (equipment +
consumables/keys/trinkets), fixes a level-tier authoring bug on Captain
Derrick, and adds one new requested item ("Dragon's Barrel", sold in
the city, functionally infinite via this codebase's existing shop
restock mechanism).

## Discovery: wear positions (confirmed against `structs.h`)

| # | slot | # | slot |
|---|---|---|---|
| 1 | Finger | 10 | Arms |
| 3 | Neck | 11 | Shield |
| 5 | Body | 12 | About (cloak) |
| 6 | Head | 13 | Waist |
| 7 | Legs | 14 | Wrist |
| 8 | Feet | 16 | Wield |
| 9 | Hands | 17 | Hold |

## Level tiers (confirmed against `mob/176.mob`)

- Cityguard (17600/17623/17634, 3 spawns each varying rooms): level 20.
- Captain Derrick (17602): **level 20 today — a copy-paste bug**, byte-
  identical stat block to the plain cityguard despite his "Captain"
  title. Fixed in this pass to match Captain Jacklyn's real stats
  (level 30), per explicit user confirmation.
- Captain Jacklyn (17603): level 30 (already correct).
- Marshall Diana (17601): level 32.
- Dragonlord (17630): level 57 — the zone's actual highest raw level,
  a knight who has taken on draconic power; the Ancient Gold Dragon
  himself is level 55. Both are boss-tier.
- Ancient Gold Dragon (17631, the mob — not to be confused with item
  vnum 17631 "silver plate", separate vnum spaces): level 55, the
  zone's thematic apex predator (per flavor text, everyone in the
  citadel — attendants, Dragonknights, even the Dragonlord — orbits
  around him).
- Dragonknight (17633, 3 spawns): elite mook tier, below Dragonlord/
  Dragon, above Marshall.

## Item design, by tier

**Universal — Ofcol signet ring (17620, finger, worn by every guard/
captain/marshal/dragon-set NPC):** fixed, no rarity roll. `APPLY_HIT
+10` (a modest, flat "town guard's blessing," matches its universal
distribution — not meant to be a chase item).

**Brass tier (cityguard, level 20) — fixed, no rarity roll:**
| vnum | name | slot | affect |
|---|---|---|---|
| 17621 | Brass plate | body | AC -4 |
| 17622 | a brass helm | head | AC -2 |
| 17623 | Brass leggings | legs | AC -3 |
| 17624 | brass boots | feet | AC -2 |
| 17625 | brass gauntlets | hands | AC -2 |
| 17626 | Brass sleeves | arms | AC -2 |
| 17627 | a brass shield | shield | AC -3 |
| 17628 | a brass girth | waist | AC -1 |
| 17629 | a brass bracer | wrist | AC -1 |
| 17630 | a claymore | wield | weapon, 2d8 |

Full brass set AC: -20 (calibration baseline for a level-20 starter
guard kit — well under the whole-game "-15 single-slot top-end"
ceiling found earlier this session, appropriately spread across 9
slots).

**Silver tier (Captain Derrick + Captain Jacklyn, level 30) — fixed:**
| vnum | name | slot | affect |
|---|---|---|---|
| 17631 | silver plate | body | AC -6 |
| 17632 | a silver helm | head | AC -3 |
| 17633 | silver leggings | legs | AC -4 |
| 17634 | silver boots | feet | AC -3 |
| 17635 | silver gauntlets | hands | AC -3 |
| 17636 | silver sleeves | arms | AC -3 |
| 17637 | the silver shield | shield | AC -4, `APPLY_CON +1` |
| 17638 | the silver girth | waist | AC -2 |
| 17653 | a ranseur | wield | weapon, 3d6, `APPLY_HITROLL +1` |

Full silver set AC: -28.

**Platinum tier (Marshall Diana, level 32) + Holy Avenger — fixed:**
| vnum | name | slot | affect |
|---|---|---|---|
| 17639 | Platinum plate | body | AC -8, `APPLY_CON +1` |
| 17640 | the platinum helmet | head | AC -4 |
| 17641 | Platinum leggings | legs | AC -5 |
| 17642 | Platinum boots | feet | AC -4 |
| 17643 | Platinum gauntlets | hands | AC -4 |
| 17644 | Platinum sleeves | arms | AC -4 |
| 17645 | The platinum spiked shield | shield | AC -5, `APPLY_HITROLL +1` |
| 17646 | the platinum girth | waist | AC -3 |
| 17647 | Holy Avenger | wield | weapon, 4d6, `APPLY_HITROLL +2`, `APPLY_DAMROLL +2` |

Full platinum set AC: -37. Holy Avenger is a fixed legendary named
weapon (no existing precedent elsewhere in the game) — always identical
stats, matching this session's established "unique NPC signature gear"
convention (Moria ring, newbie boots) rather than a rolled drop, since
Marshall Diana is a notable named leader, not the zone's final boss.

**Dragon-scale set (shared by Dragonlord + Dragonknight, elite tier) —
fixed:**
| vnum | name | slot | affect |
|---|---|---|---|
| 17654 | golden dragonscale torso | body | AC -10 |
| 17656 | Golden dragonscale leggings | legs | AC -6 |
| 17657 | Golden dragonscale boots | feet | AC -5 |
| 17658 | Golden dragonscale gauntlets | hands | AC -5 |
| 17659 | Golden dragonscale sleeves | arms | AC -5 |
| 17660 | a golden dragonscale shield | shield | AC -6 |
| 17661 | a golden dragonscale girth | waist | AC -4 |

Full set AC: -41 (the zone's strongest non-boss-exclusive kit). All 7
item names preserve the zone author's original alternating-color
"shimmer" markup exactly as already written in the zone-reset file
(e.g. `&Ya golden &gd&Gr&ga&Gg&go&Gn&gs&Gc&ga&Gl&ge &Ytorso&n`) — not
re-authored, just backed with a real object.

**Elite/boss weapons ("golden claw" family, wield):**
- 17662 "the golden claw" (Dragonknight, 3 spawns): fixed, 4d6,
  `APPLY_HITROLL +1`.
- 17669 "the golden claw" (Dragonlord, 2 spawns): fixed, 5d6,
  `APPLY_HITROLL +2`, `APPLY_DAMROLL +1` — stronger than the
  Dragonknight's copy, matching Dragonlord's higher raw level.
- **17668 "the Golden Claw" (capitalized — Ancient Gold Dragon's own
  unique copy, 1 spawn): the zone's signature drop.** Base weapon 5d8,
  `APPLY_HITROLL +2`, `APPLY_DAMROLL +2` (the two affects
  `roll_item_rarity()` will vary per rolled tier), reusing the
  already-generic `SIGNATURE_DROPS[]` table in `fight.c` (one new data
  row, zero other C changes — same mechanism as the Termites King
  crown and the Hobgoblin King's Greatclub). Its `short_description`
  gets ANSI color markup per this session's established convention:
  `&Rthe&n &YGolden&n &RClaw&n` (red/gold alternation, fitting a
  gold dragon's prized weapon), on top of which the rarity-tier
  bracket tag (`[I]`/`[R]`/`[L]`, `+` on a maxed roll) gets prepended
  automatically at drop time, exactly like every other signature item
  this session.

**Gold Dragon Orb (17663, hold, Ancient Gold Dragon only) — fixed
companion piece, not signature (the Golden Claw above is the zone's
one signature/rolled item, matching the "one boss item" pattern used
for the Hobgoblin King):** `APPLY_MANA +20`, `APPLY_WIS +1`.

**Support pieces (fixed, low-key):**
- 17652 "The Holy Symbol of Bahamut" (neck, Priestess of Ofcol):
  `APPLY_SAVING_SPELL -2` (a minor protective ward, thematically
  tying Bahamut — the platinum dragon god — to Marshall Diana's
  platinum gear and the zone's overall dragon theme).
- 17664 "a golden robe" (about, worn by Chaplain Jerrold, the
  Priestess, and the two dragon attendants): AC -2, plain, no frills
  — low-level NPC-tier clergy garment.

## Civilian/consumable items (in scope per explicit user confirmation)

- 17600 "a hand axe" / 17601 "a meat cleaver" / 17615 "a pitchfork":
  plain starter weapons (farmhands/shop stock), 1d6 each, no affects.
- 17616-17619 "a leather vest/some leather sleeves/some leather
  leggings/some leather boots": basic starter armor (Sam's shop
  stock), AC -1 each.
- 17602-17605, 17609-17613 (9 food items: side of beef/side of pork/
  side of horse/defeathered chicken/head of cabbage/head of lettuce/
  bottle of milk/an apple/an ear of corn): `ITEM_FOOD`, no stats,
  flavor only.
- 17648-17650 (whiskey/ale/port brew): `ITEM_DRINKCON`, small capacity,
  Nyles's existing shop stock.
- 17606 "an emerald ring" / 17608 "a golden necklace": simple wearable
  jewelry (finger/neck), tiny flavor stat (`APPLY_CHA +1` each),
  Madam Tracy's shop stock.
- 17607 "a glass trinket": `ITEM_TREASURE`, no wear, pure sell-value
  curio.
- 17651 "the citadel key" / 17665 "a house key": `ITEM_KEY`, no stats,
  functional keys (citadel key likely unlocks a door somewhere in the
  zone — out of scope to newly wire a lock that doesn't already
  reference it; the object just needs to exist).
- 17666 "a broom": weak improvised weapon (the maid's, 1d2, no
  affects) matching how "a pitchfork"/"a meat cleaver" reuse mundane
  tools as weapons elsewhere in this same zone.
- 17667 "a chest": `ITEM_CONTAINER`, modest capacity, Jim's shop stock.

## Derrick fix

`wdii/lib/world/mob/176.mob`'s vnum 17602 stats line changes from the
cityguard-identical `20 10 7 1d1+414 5d3+8` / `300 37388 0` to match
Captain Jacklyn's real captain-tier stats (`30 5 5 1d1+630 5d4+12` /
`450 105901 0`), correcting the copy-paste bug per explicit user
confirmation.

## Dragon's Barrel (new item, not part of the zone's original design)

A new item per explicit user request: **"Dragon's Barrel"**, an
infinite-water drink container, sold in Nyles the Bartender's shop
(shop #17609, already has 2 of 5 producing slots free) for 1,000,000
gold.

- **Name markup** (exact, per user's color spec — "Dragon" green, the
  apostrophe yellow, the following "s" green again, " Barrel" white):
  `&GDragon&n&Y'&n&Gs&n&W Barrel&n`.
- **Mechanism for "infinite"**: no code change needed. This codebase's
  shop system (`shop.c`, confirmed this session) re-instantiates any
  item in a shopkeeper's `producing` vnum list fresh from the
  prototype on every purchase — so every copy sold is always full,
  indefinitely, with zero special "infinite" sentinel value required.
  The item's own `val1` (current liquid) is simply set to a generous
  finite capacity like any other drink container.
- **Fields**: `ITEM_DRINKCON` (type 17), wear `TAKE` only (not
  equippable — matches how the existing "barrel"-named items in this
  world are handled), capacity/current 100/100, liquid type `0`
  ("water", confirmed index in `constants.c`'s `drinks[]`), not
  poisoned. Cost `1,000,000` (the shop's own buy-price multiplier may
  adjust the price actually shown to a buyer — confirmed empirically
  during implementation/playtest, not assumed here).
- **Deployment**: new vnum (needs a free slot in the 17800+ range or
  similar — picked during implementation to avoid the ~60 vnums this
  spec already claims in 17600-17669), one new `.obj` entry, and one
  edit to `wdii/lib/world/shp/176.shp`'s shop #17609 `producing` list
  (append the new vnum; confirmed room for 2 more entries, `MAX_PROD`
  is 5, currently 3 used).

## Deployment (whole spec)

New `wdii/lib/world/obj/176.obj` (~61 items: ~60 recreated + 1 new
Dragon's Barrel), registered in `wdii/lib/world/obj/index`; one mob
stat-line fix in `wdii/lib/world/mob/176.mob` (Derrick); one shop-file
edit in `wdii/lib/world/shp/176.shp`; one new row in `fight.c`'s
`SIGNATURE_DROPS[]` table for the Ancient Gold Dragon's Golden Claw.
`wdii/lib/world/zon/176.zon` itself needs **no changes** — every E/G/M
line already references the correct vnums; they were simply all dead
until now. Requires a container rebuild to load and compile, which
wipes ephemeral pfiles like any other deploy this session.
