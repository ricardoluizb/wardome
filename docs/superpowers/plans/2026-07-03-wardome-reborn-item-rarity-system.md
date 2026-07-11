# Item Rarity System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an NPC (mob) dies, every item that ends up in its corpse and already grants a stat bonus gets a rolled rarity tier (Common/Uncommon/Rare/Legendary) that nudges its existing stat modifier(s) within a tier-specific range, with a colored bracket tag baked into its displayed name.

**Architecture:** A new `roll_item_rarity()` function in `wdii/src/fight.c`, called once per object from both of `make_corpse()`'s existing loops that move a dying character's items into their corpse — gated on `IS_NPC(ch)` so player deaths are never affected. The function mutates the object INSTANCE's `affected[]` array (embedded, not shared — safe) and replaces `short_description` with a freshly `str_dup()`'d string carrying the rarity tag (the established safe per-instance string-mutation pattern in this codebase).

**Tech Stack:** C (CircleMUD 3.0 fork), Docker (build/run), no new dependencies.

## Global Constraints

- This is a genuinely new, deliberate, real gameplay mechanic in `wdii/src` — the biggest of the session's user-approved exceptions to "additive tags only." Does not relax that rule for anything else.
- Only touch `wdii/src/fight.c`. No other files change (display already works via the existing `short_description` printing in `act.informative.c`, untouched).
- Gate everything on `IS_NPC(ch)` — a player's own gear must never be re-rolled on their death.
- Rarity weights (roll 1-100): Common 1-60, Uncommon 61-85, Rare 86-97, Legendary 98-100.
- Variance per tier, applied to each existing non-zero `affected[i].modifier`: Common ±0, Uncommon ±1, Rare ±2, Legendary ±3. Clamp so the modifier never crosses zero or flips sign.
- Tag text prepended to `short_description` (existing `&`-letter color convention already used in this codebase, e.g. `show_obj_to_char()`): Common = no tag; Uncommon = `&B[I]&n `; Rare = `&Y[R]&n `; Legendary = `&R[L]&n `.
- No wear-level gate — `GET_OBJ_LEVEL`/`obj_level` stays exactly as cosmetic as it is today. Not touched.
- No new "loot table" — only items the mob already carries/wears (from existing zone-reset data) can get a rarity roll. Nothing is created from nothing.
- No automated test suite for this project — manual/observational verification (kill mobs repeatedly in Docker, read the output).

---

### Task 1: `roll_item_rarity()` and its two call sites in `make_corpse()`

**Files:**
- Modify: `wdii/src/fight.c:365-461` (`make_corpse()`), plus one new function added just above it.

**Interfaces:**
- Consumes: `struct obj_data` (`structs.h:786+`, specifically `obj->affected[MAX_OBJ_AFFECT]` — `structs.h:815`, `MAX_OBJ_AFFECT=6` — `structs.h:741`, `APPLY_NONE=0` — `structs.h:568`), `number(int from, int to)` (`utils.c:726`, this codebase's existing inclusive-range dice-roll helper — safe with a negative `from`, confirmed by reading its implementation), `str_dup()` (`utils.h:73`, `#define str_dup(s) strdup(s)`).
- Produces: nothing consumed by later tasks — this is the only task in the plan. `free_obj()` (`db.c:3395-3440`, unchanged) already safely frees a replaced `short_description` exactly once (pointer-compares against the prototype before freeing), so no cleanup code is needed here.

- [ ] **Step 1: Add `roll_item_rarity()` just above `make_corpse()`**

Open `wdii/src/fight.c`. Find `void make_corpse(struct char_data * ch)` at line 365. Immediately above it, add:

```c
/* Rolls a rarity tier for an item that already grants at least one
 * stat bonus, nudging each existing affect's modifier within a
 * tier-specific range and baking a colored tag into its short
 * description. Items with no non-zero affected[] entry are left
 * completely untouched (no tag, no roll). Safe to call on any object
 * instance -- affected[] is an embedded (not shared-pointer) array,
 * and short_description is replaced via str_dup(), the same
 * established per-instance string-mutation pattern already used by
 * create_money()/MakeScrap()/oedit.c in this codebase; free_obj()
 * already pointer-compares against the prototype before freeing, so
 * this cannot double-free or leak the prototype's shared string.
 */
void roll_item_rarity(struct obj_data * obj)
{
  int i, roll, variance, has_affect = FALSE;
  const char *tag;
  char newbuf[MAX_STRING_LENGTH];

  for (i = 0; i < MAX_OBJ_AFFECT; i++)
    if (obj->affected[i].location != APPLY_NONE && obj->affected[i].modifier != 0)
      has_affect = TRUE;

  if (!has_affect)
    return;

  roll = number(1, 100);
  if (roll <= 60) {
    variance = 0;
    tag = NULL;
  } else if (roll <= 85) {
    variance = 1;
    tag = "&B[I]&n ";
  } else if (roll <= 97) {
    variance = 2;
    tag = "&Y[R]&n ";
  } else {
    variance = 3;
    tag = "&R[L]&n ";
  }

  if (variance > 0) {
    for (i = 0; i < MAX_OBJ_AFFECT; i++) {
      if (obj->affected[i].location == APPLY_NONE || obj->affected[i].modifier == 0)
        continue;
      if (obj->affected[i].modifier > 0) {
        obj->affected[i].modifier += number(-variance, variance);
        if (obj->affected[i].modifier < 1)
          obj->affected[i].modifier = 1;
      } else {
        obj->affected[i].modifier -= number(-variance, variance);
        if (obj->affected[i].modifier > -1)
          obj->affected[i].modifier = -1;
      }
    }
  }

  if (tag != NULL) {
    sprintf(newbuf, "%s%s", tag, obj->short_description);
    obj->short_description = str_dup(newbuf);
  }
}
```

- [ ] **Step 2: Call it from the carried-inventory transfer loop**

Find this existing loop inside `make_corpse()` (`fight.c:436-439`):

```c
     corpse->contains = ch->carrying;  // transfer character's inventory to the corpse
     	for (o = corpse->contains; o != NULL; o = o->next_content)
             o->in_obj = corpse;
             object_list_new_owner(corpse, NULL);
```

Change to (add the rarity roll inside the loop, gated on `IS_NPC(ch)`):

```c
     corpse->contains = ch->carrying;  // transfer character's inventory to the corpse
     	for (o = corpse->contains; o != NULL; o = o->next_content) {
             o->in_obj = corpse;
             if (IS_NPC(ch))
               roll_item_rarity(o);
        }
             object_list_new_owner(corpse, NULL);
```

- [ ] **Step 3: Call it from the worn-equipment transfer loop**

Find this existing loop (`fight.c:442-444`):

```c
        for (i = 0; i < NUM_WEARS; i++) // transfer character's equipment to the corpse
             if (GET_EQ(ch, i))
             obj_to_obj(unequip_char(ch, i), corpse);
```

Change to (capture the unequipped object so it can be rolled before moving it into the corpse):

```c
        for (i = 0; i < NUM_WEARS; i++) { // transfer character's equipment to the corpse
             if (GET_EQ(ch, i)) {
               struct obj_data *unequipped = unequip_char(ch, i);
               if (IS_NPC(ch))
                 roll_item_rarity(unequipped);
               obj_to_obj(unequipped, corpse);
             }
        }
```

- [ ] **Step 4: Rebuild**

```bash
cd /Users/ricardobussacro/Documents/Wardome
docker compose up -d --build
```
Expected: image builds with no new compiler warnings/errors from this change, container starts and stays `Up`.

- [ ] **Step 5: Verify live — find and kill an NPC known to carry/wear a stat item**

Pick an MVP mob with real gear from `extract/out/mobs/*.json` / the relevant zone's `extract/out/zones/<id>.json` `'E'`/`'G'` reset commands (equipment given to that mob). Connect (telnet or the browser client), create/log in a short alphabetic test character (no digits, no "war" substring), navigate to the mob, and kill it repeatedly (may need combat commands like `kill <mob>` several times, or use an immortal-level test account with instant-kill if one is available — otherwise just fight normally) — `look` at the corpse's contents (`look in corpse`) each time.

Expected across multiple kills: sometimes the item's short_description shows no tag (Common, ~60% of kills), sometimes `&B[I]&n ` (blue), `&Y[R]&n ` (yellow), or rarely `&R[L]&n ` (red) prefixed to the name. Confirm via `examine <item>` or similar that the underlying stat modifier value stayed within the expected band for whatever tag showed (e.g. a base +2 STR item tagged `[I]` should show a value in the roughly +1..+3 range, per the ±1 Uncommon variance, clamped to never go to 0 or negative).

- [ ] **Step 6: Confirm items with no stat bonus are never tagged**

Kill an NPC known to carry a plain item with all-zero `affected[]` (e.g. most basic gear) and confirm its short_description is completely unchanged across multiple kills — no tag ever appears.

- [ ] **Step 7: Confirm player deaths are unaffected**

If safely testable (e.g. two test characters, one kills the other in a PK-enabled context, or simulate via an immortal `slay`/similar admin command if available) confirm a player's own dropped gear is never re-tagged/re-rolled. If this specific scenario is impractical to safely test live, confirm by code inspection instead: both call sites are gated by `if (IS_NPC(ch))` before calling `roll_item_rarity()`, so a player's `ch` (where `IS_NPC(ch)` is false) never triggers a roll — state this as the verification method in the report if live PK testing isn't attempted.

- [ ] **Step 8: Commit**

```bash
git add wdii/src/fight.c
git commit -m "feat: roll item rarity + stat variance when NPCs drop stat-granting loot

When a mob (never a player) dies, every carried/worn item that already
grants a non-zero affected[] stat bonus gets a rolled rarity tier
(Common 60% / Uncommon 25% / Rare 12% / Legendary 3%) applied in
make_corpse(). Each tier nudges the item's EXISTING stat modifier(s)
within a tier-specific range (+/-0/1/2/3), clamped so a modifier never
crosses zero or flips sign -- the item's original designed value
anchors the roll, nothing is invented or scales unboundedly. A colored
bracket tag ([I]/[R]/[L], using this codebase's existing &-letter
color convention) is baked into the instance's short_description via
str_dup(), the established safe per-instance string-mutation pattern
already used by create_money()/MakeScrap()/oedit.c -- free_obj()
already pointer-compares before freeing, so this cannot double-free or
leak the shared prototype string.

Items with no stat bonus are never touched/tagged. No wear-level gate
was added (GET_OBJ_LEVEL/obj_level stays exactly as cosmetic as it
already was). No new loot-table concept -- this only re-rolls items a
mob already carries per existing zone-reset data."
```

---

## Explicitly out of scope (do not implement)

- Set-item synergy bonuses.
- A wear-level gate / GET_OBJ_LEVEL enforcement.
- Any new "loot table" (chance to drop an item not already in the mob's existing equipment/inventory).
- Adjusting the 60/25/12/3 weights or the variance widths — ship with these first, tune later if the user asks.
- Any change outside `wdii/src/fight.c`.
