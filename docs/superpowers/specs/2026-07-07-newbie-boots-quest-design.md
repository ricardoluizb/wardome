# Newbie Boots Quest — Design

**Goal:** a small fetch quest in the Newbie Zone (zone 186) that teaches a new
player the talk → carry → deliver loop and rewards them with a pair of
newbie boots.

## Flow

1. Player says a keyword to **the newbie janitor** (existing mob, vnum
   18600). His speech trigger is flavor/dialogue only: he mentions he
   dropped an important letter nearby and asks the player to find it and
   deliver it to the clueless newbie. **A dusty newbie letter** (new
   item, vnum 18631) already sits in his room as an ordinary zone-reset
   object (no script hand-off — see Mechanism below for why).
2. Player picks up the letter (`get letter`) and carries it to **a
   clueless newbie** (existing mob, vnum 18612), then does `give letter
   to newbie`.
3. The moment the letter is given to the clueless newbie specifically,
   the player is thanked, the letter is destroyed, and **a pair of
   newbie boots** (new item, vnum 18630) appears directly in their
   inventory. Delivering the letter to anyone else just gives it to them
   normally (no special behavior). A persistent per-player flag prevents
   farming infinite boots by repeating the give.

## Mechanism

Two real engine constraints shape this design, both discovered while
tracing the actual code (not assumed from DG Scripts documentation in
general):

**1. This codebase's DG mob-script commands (`dg_mobcmd.c`) have no way
to place a loaded object directly into the *player's* inventory.**
`mload obj <vnum>` only supports `obj_to_char(object, ch)` where `ch` is
the executing mob itself (or `obj_to_room` for non-takeable objects) —
there's no "target" argument and no equivalent of a mob "giving" an item
to a player via script.

**2. More fundamentally: `receive_mtrigger()` and `give_otrigger()` are
defined in `dg_triggers.c` but never called from `do_give`/`perform_give`
in `act.item.c` anywhere in this codebase.** The DG trigger machinery for
"mob receives an item" and "object is given" is compiled in but was never
wired up. So giving an item to a mob cannot fire *any* script (DG or
otherwise) in this fork without a C change — this isn't a scripting
limitation to work around, it's a missing hook.

Given that, the delivery/reward step needs one small, targeted C change
in `perform_give()` (`act.item.c`) — the same style of special-case hook
already used this session for the crown's Sanctuary bonus and the
Moria ring's fixed rarity: after the existing `obj_to_char(obj, vict);`
line, check whether `obj` is the letter (vnum 18631) and `vict` is the
clueless newbie (vnum 18612); if so, extract/destroy the letter, load
the boots (vnum 18630) straight into `ch`'s (the player's) inventory,
send a thank-you message, and set a flag on the player (a new
lightweight per-character marker, e.g. reusing the existing `remember`/
"quest done" convention already in this codebase, or a simple new
`bool` field alongside similar existing per-character one-off flags) so
the reward can't be repeated.

The janitor's hint dialogue stays pure DG Script (zero C, zero risk):

- **Speech trigger** on the janitor (18600), attach type `d` (Speech),
  keyword e.g. `help`/`letter`. Pure flavor text pointing the player at
  the letter in the room.

The letter itself is placed via a normal zone-reset `O` command (load
object into room), not scripted — it's an ordinary respawning zone item,
same as anything else in this zone.

Both mobs already exist in zone 186; only new items, one zone-reset
line, one new `.trg` file (the janitor's speech trigger), and one small
C change are needed.

## New items

- **vnum 18631** "a dusty newbie letter" — no stats, plain quest token,
  weight ~1, not equippable, flavored short/long description.
- **vnum 18630** "a pair of newbie boots" — feet slot (`ITEM_WEAR_FEET`),
  affects: `APPLY_MOVE +10`, `APPLY_AC -2`. Fixed Common tier, no rarity
  roll (matches the fixed-rarity precedent already used for the Moria
  ring). Level-1-appropriate, thematically consistent with other newbie
  zone gear.

## Vnum range

Zone 186's shipped `.obj` files only go up to vnum 18614; vnums
18615-18699 are free (some zone-reset commands reference orphaned/missing
objects in that range, but no real `.obj` file claims them). Using 18630
and 18631 avoids any ambiguity with that broken range.

## One-time gate

`structs.h` already has a second player-flags field, `act2`
(`PLR2_FLAGS(ch)`/`PLR2_TOG_CHK` macros in `utils.h`), that has no flags
defined on it yet — it's part of the standard saved player struct, so
anything stored there persists across save/reload for free, no new
persistence code needed. Add `PLR2_NEWBIE_BOOTS_DONE (1 << 0)` and check/
set it in the `perform_give` special-case: if already set, giving the
letter to the clueless newbie just does the normal give (no second
reward); otherwise it triggers the swap and sets the flag.

## Deployment

Two new `.obj` entries in `186.obj`, one new zone-reset `O` line in
`186.zon` (places the letter in the janitor's room), one new `.trg` file
(the janitor's speech trigger) plus a `T` attachment line on his `.mob`
entry, and a small C change in `act.item.c`'s `perform_give()` plus a new
`PLR2_NEWBIE_BOOTS_DONE` flag in `structs.h`. Requires a container
rebuild to load and compile (world files and source are baked in at
build time), which wipes ephemeral pfiles like any other deploy this
session.
