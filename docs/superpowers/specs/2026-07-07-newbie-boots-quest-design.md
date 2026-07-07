# Newbie Boots Quest — Design

**Goal:** a small fetch quest in the Newbie Zone (zone 186) that teaches a new
player the talk → carry → deliver loop and rewards them with a pair of
newbie boots.

## Flow

1. Player says a keyword to **the newbie janitor** (existing mob, vnum
   18600). If the player hasn't done this quest yet, the janitor hands
   over **a dusty newbie letter** (new item, vnum 18631) and asks them to
   carry it to the clueless newbie. If the player already completed the
   quest, he says something else instead (no re-farming the letter).
2. Player carries the letter to **a clueless newbie** (existing mob, vnum
   18612) and does `give letter to newbie`.
3. The newbie's receive trigger checks the given object's vnum. If it's
   the letter: extract/destroy it, `oload` **a pair of newbie boots** (new
   item, vnum 18630) into the player's inventory, thank-you message, and
   set a persistent per-player flag so the reward can't be repeated.

## Mechanism

Pure DG Scripts — no C code changes, no recompile risk:

- **Speech trigger** on the janitor (18600), attach type `d` (Speech),
  keyword e.g. `help`/`letter`. Checks a per-player DG variable
  (`%actor.newbie_quest%`, set via `remote`) to gate the one-time letter
  hand-out.
- **Receive trigger** on the clueless newbie (18612), attach type `j`
  (Receive). Checks `%object.vnum%` == 18631; on match, extracts the
  object, `oload`s the boots, sets `%actor.newbie_quest%` to mark the
  quest done, and gives a thank-you message. On any other object, a
  generic "I don't want this" response (existing CircleMUD default
  behavior for unhandled Receive triggers already refuses the item, so
  this is just flavor text, not required logic).

Both mobs already exist in zone 186; only new items and two new trigger
files are needed.

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

DG script variables set via `remote` on a player character persist across
save/reload in this codebase's existing DG script implementation, so the
`%actor.newbie_quest%` flag survives logout/login and prevents infinite
boots farming from repeatedly giving/receiving the letter.

## Deployment

World-data-only change: two new `.obj` entries in `186.obj` and two new
`.trg` files (the letter is hand-delivered by the janitor's trigger via
`oload`, so no zone-reset line is needed for it). Requires a container
rebuild to load (world files are baked in at build time, same as any
other content change), which wipes ephemeral pfiles like any other
deploy this session.
