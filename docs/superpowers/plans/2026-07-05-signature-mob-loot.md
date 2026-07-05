# Signature Mob Loot System (Termites King Pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Termites King mob (vnum 20504) a 30%-chance signature item drop ("a chitinous crown"), gate Rare/Legendary rarity behind mob level 100+ globally, and add a `+` marker to rarity tags when an item rolls maximum stats.

**Architecture:** All server-side logic lives in `wdii/src/fight.c` (rarity rolling + the new signature-drop table/hook, both called from `make_corpse()`) and a one-line-shortened string comparison in `wdii/src/comm.c` (so the paperdoll border color still detects tier correctly once tags can have a trailing `+`). One new world data file (`wdii/lib/world/obj/205.obj`) adds the item itself. One icon is generated via the existing free Pollinations pipeline.

**Tech Stack:** C (CircleMUD 3.0), Docker (`docker compose up -d --build` to deploy), Node.js one-off script for the icon fetch (same pattern as `tools/gen-item-icons.js`).

## Global Constraints

- Difficulty threshold for Rare/Legendary eligibility: mob level **100** (from `docs/superpowers/specs/2026-07-05-signature-mob-loot-design.md`) — below 100, rolls collapse into Uncommon/Common only.
- Termites King (vnum 20504) signature item: vnum **20599**, drop chance **30%**.
- New item: slot HEAD, type 9 (worn), `APPLY_CON` (location 5) modifier **+2**, wear flags **17** (`ITEM_WEAR_TAKE` + `ITEM_WEAR_HEAD`).
- Max-roll indicator is a **text-only** tag suffix (`+`), no new WebSocket field, no new client/UI code.
- No unit-test framework exists in this codebase (CircleMUD/C, tested live). Every task's verification step uses `docker compose` rebuilds and raw `nc`/telnet sessions against the running server, matching the verification pattern already used throughout this project.

---

### Task 1: Difficulty-gated rarity + max-roll tag in `roll_item_rarity()`

**Files:**
- Modify: `wdii/src/fight.c:377-425` (the `roll_item_rarity` function body)
- Modify: `wdii/src/fight.c:502` (call site inside the inventory-transfer loop)
- Modify: `wdii/src/fight.c:511` (call site inside the equipment-transfer loop)

**Interfaces:**
- Produces: `void roll_item_rarity(struct obj_data *obj, int mob_level)` — the new two-argument signature every later task (and both existing call sites) must use. Behavior: unchanged for items with no non-zero `affected[]` entry (returns immediately, no tag). For items with at least one non-zero affect, rolls `1-100`; if `mob_level < 100` and the roll is `> 85`, the roll is re-drawn from `61-85` (collapsing any would-be Rare/Legendary result into Uncommon). Tag letters/colors are unchanged (`&B[I]` Uncommon, `&Y[R]` Rare, `&R[L]` Legendary, no tag for Common). If every modified affect in this roll hit the maximum magnitude for its tier's variance, the tag gets a trailing `+` right after the closing bracket (e.g. `&Y[R]+&n `) instead of going straight to `&n `.

The current function (read this exact text from the file before editing — do not guess at whitespace):

```c
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

- [ ] **Step 1: Replace the function body**

Replace the entire function (from the `void roll_item_rarity(struct obj_data * obj)` line at `fight.c:377` through its closing `}` at `fight.c:425`) with:

```c
void roll_item_rarity(struct obj_data * obj, int mob_level)
{
  int i, roll, variance, has_affect = FALSE, all_maxed = FALSE;
  const char *color, *letter;
  char newbuf[MAX_STRING_LENGTH];

  for (i = 0; i < MAX_OBJ_AFFECT; i++)
    if (obj->affected[i].location != APPLY_NONE && obj->affected[i].modifier != 0)
      has_affect = TRUE;

  if (!has_affect)
    return;

  roll = number(1, 100);
  if (mob_level < 100 && roll > 85)
    roll = number(61, 85);

  if (roll <= 60) {
    variance = 0;
    color = NULL;
    letter = NULL;
  } else if (roll <= 85) {
    variance = 1;
    color = "&B";
    letter = "I";
  } else if (roll <= 97) {
    variance = 2;
    color = "&Y";
    letter = "R";
  } else {
    variance = 3;
    color = "&R";
    letter = "L";
  }

  all_maxed = (variance > 0);
  if (variance > 0) {
    for (i = 0; i < MAX_OBJ_AFFECT; i++) {
      int shift;
      if (obj->affected[i].location == APPLY_NONE || obj->affected[i].modifier == 0)
        continue;
      shift = number(-variance, variance);
      if (shift != variance)
        all_maxed = FALSE;
      if (obj->affected[i].modifier > 0) {
        obj->affected[i].modifier += shift;
        if (obj->affected[i].modifier < 1)
          obj->affected[i].modifier = 1;
      } else {
        obj->affected[i].modifier -= shift;
        if (obj->affected[i].modifier > -1)
          obj->affected[i].modifier = -1;
      }
    }
  }

  if (letter != NULL) {
    sprintf(newbuf, "%s[%s]%s&n %s", color, letter, (all_maxed ? "+" : ""), obj->short_description);
    obj->short_description = str_dup(newbuf);
  }
}
```

- [ ] **Step 2: Update both existing call sites to pass `GET_LEVEL(ch)`**

At `fight.c:502` (inside the inventory-transfer loop), change:
```c
               roll_item_rarity(o);
```
to:
```c
               roll_item_rarity(o, GET_LEVEL(ch));
```

At `fight.c:511` (inside the equipment-transfer loop), change:
```c
                 roll_item_rarity(unequipped);
```
to:
```c
                 roll_item_rarity(unequipped, GET_LEVEL(ch));
```

- [ ] **Step 3: Rebuild and verify compile**

```bash
cd /Users/ricardobussacro/Documents/Wardome/docker
docker compose build 2>&1 | tail -30
```
Expected: build succeeds with no errors mentioning `fight.c` (in particular no "too few arguments to function `roll_item_rarity`" — that would mean a call site was missed).

- [ ] **Step 4: Commit**

```bash
cd /Users/ricardobussacro/Documents/Wardome
git add wdii/src/fight.c
git commit -m "feat: gate Rare/Legendary rarity behind mob level 100+, add perfect-roll + tag"
```

---

### Task 2: Fix rarity-tier detection in `comm.c` for the `+` suffix

**Files:**
- Modify: `wdii/src/comm.c:1237-1242`

**Interfaces:**
- Consumes: the tag format produced by Task 1's `roll_item_rarity()` — `&B[I]`, `&Y[R]`, `&R[L]` optionally followed by `+`, always followed by `&n `.
- Produces: no new interface: this is a correctness fix so the existing `$$EQUIP$$` tag (already consumed by `bridge/server.js` and `web/client.js`, unchanged) keeps reporting the right tier for the equipment paperdoll border color even when the tag has a trailing `+`.

The current code (read the exact surrounding lines from the file first — this is inside `make_prompt()`'s `$$EQUIP$$` tag builder, matching each equipped item's `short_description` prefix against the three possible rarity tags):

```c
          if (!strncmp(eq_obj->short_description, "&B[I]&n ", 8))
            tier = 1;
          else if (!strncmp(eq_obj->short_description, "&Y[R]&n ", 8))
            tier = 2;
          else if (!strncmp(eq_obj->short_description, "&R[L]&n ", 8))
            tier = 3;
```

- [ ] **Step 1: Shorten each comparison to the 5-byte tier prefix**

Replace those four lines with:

```c
          if (!strncmp(eq_obj->short_description, "&B[I]", 5))
            tier = 1;
          else if (!strncmp(eq_obj->short_description, "&Y[R]", 5))
            tier = 2;
          else if (!strncmp(eq_obj->short_description, "&R[L]", 5))
            tier = 3;
```

- [ ] **Step 2: Rebuild and verify compile**

```bash
cd /Users/ricardobussacro/Documents/Wardome/docker
docker compose build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/ricardobussacro/Documents/Wardome
git add wdii/src/comm.c
git commit -m "fix: match rarity tag by 5-byte prefix so a trailing + doesn't break tier detection"
```

---

### Task 3: Author "a chitinous crown" (vnum 20599) and register it in the world

**Files:**
- Create: `wdii/lib/world/obj/205.obj`
- Modify: `wdii/lib/world/obj/index`

**Interfaces:**
- Produces: a loadable object at vnum **20599**, type 9 (worn), wear flags 17 (`ITEM_WEAR_TAKE` + `ITEM_WEAR_HEAD`), one affect (`APPLY_CON` = location 5, modifier +2). Task 4's `roll_signature_drop()` calls `read_object(20599, VIRTUAL)` and depends on this vnum existing and being indexed.

- [ ] **Step 1: Create the new object file**

Write `wdii/lib/world/obj/205.obj` with exactly this content:

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
$~
```

(The trailing `$~` line is the file terminator, matching every other `.obj` file in `wdii/lib/world/obj/`.)

- [ ] **Step 2: Register the file in the object index**

Read `wdii/lib/world/obj/index` first. It is a flat list of `.obj` filenames, one per line, terminated by a line containing only `$`. Add `205.obj` as a new line anywhere before the terminating `$` line (e.g. append it as the last filename before `$`).

- [ ] **Step 3: Rebuild and boot-check**

```bash
cd /Users/ricardobussacro/Documents/Wardome
docker compose up -d --build 2>&1 | tail -20
sleep 3
docker compose logs --tail=15 game 2>&1
```
Expected: logs end with `Entering game loop.` and `No connections.  Going to sleep.` — no `SYSERR: Fatal error changing to data directory` or `Error reading object #20599` style errors. If the boot fails, check the object file's field count against a known-good entry (e.g. `grep -A8 "^#18603" wdii/lib/world/obj/186.obj`) — a missing or extra line in the six-line body (keywords/short-desc/long-desc/extra-desc-terminator/header/values/weight-cost-rent) is the most common cause.

- [ ] **Step 4: Verify the item loads in-game**

Connect and load it as an Implementor (the first player created on this pfile database is auto-bootstrapped to level 210 — see `wdii/src/db.c:3572`; if no player exists yet, create one first, answering the name/password/sex/class prompts, then log back in):

```bash
( printf "DarTh\r\n1234\r\n\r\n1\r\n"; sleep 2; printf "load obj 20599\r\nlook\r\n"; sleep 2 ) | nc -w 10 localhost 4000 | grep -a -i "chitinous"
```
Expected output includes `a chitinous crown` (the item now sitting in your inventory/room).

- [ ] **Step 5: Commit**

```bash
cd /Users/ricardobussacro/Documents/Wardome
git add wdii/lib/world/obj/205.obj wdii/lib/world/obj/index
git commit -m "feat: add 'a chitinous crown' (vnum 20599), the Termites King signature item"
```

---

### Task 4: Signature-drop table + hook into `make_corpse()`

**Files:**
- Modify: `wdii/src/fight.c` (new function above `make_corpse`, new call site inside `make_corpse`)

**Interfaces:**
- Consumes: `roll_item_rarity(struct obj_data *obj, int mob_level)` from Task 1; vnum 20599 existing in the world from Task 3; `GET_OBJ_PERM(obj)` and `AFF_SANCTUARY` (both already defined in `wdii/src/utils.h`/`structs.h`, no new definitions needed).
- Produces: `struct obj_data *roll_signature_drop(int mob_vnum)` — returns a freshly-loaded `struct obj_data *` if `mob_vnum` has a table entry and the drop-chance roll succeeds, else `NULL`. This is the extension point for adding more signature drops later (one more row per new area, no other code changes needed).

- [ ] **Step 1: Add the data table and lookup function**

Immediately above the `void make_corpse(struct char_data * ch)` line (currently `fight.c:427`, right after `roll_item_rarity`'s closing `}`), insert:

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

- [ ] **Step 2: Hook it into `make_corpse()`**

Find this block inside `make_corpse()` (currently around `fight.c:515-522`):

```c
        if (GET_GOLD(ch) > 0) // transfer gold
      {
        if (IS_NPC(ch) || (!IS_NPC(ch) && ch->desc)) // following 'if' clause added to fix gold duplication loophole
       {
            money = create_money(GET_GOLD(ch));
            obj_to_obj(money, corpse);
       }
       GET_GOLD(ch) = 0;
     }
```

Immediately after that block's closing `}` (and before `ch->carrying = NULL;`), insert:

```c
        if (IS_NPC(ch)) {
          struct obj_data *sig_drop = roll_signature_drop(GET_MOB_VNUM(ch));
          if (sig_drop != NULL) {
            roll_item_rarity(sig_drop, GET_LEVEL(ch));
            if (GET_OBJ_VNUM(sig_drop) == 20599 && !strncmp(sig_drop->short_description, "&Y[R]", 5))
              GET_OBJ_PERM(sig_drop) |= AFF_SANCTUARY;
            obj_to_obj(sig_drop, corpse);
          }
        }
```

The `GET_OBJ_PERM(sig_drop) |= AFF_SANCTUARY` line grants the crown a
permanent Sanctuary effect while worn, but only when this specific item
(vnum 20599) rolled exactly Rare — not Uncommon, not Legendary. This works
through CircleMUD's existing "item grants an affect bit while equipped"
mechanism (`equip_char()` at `wdii/src/handler.c:669` already does
`SET_BIT(AFF_FLAGS(ch), obj->obj_flags.bitvector)` for every worn item, and
`handler.c:719` removes it on unequip) — no changes needed to
`equip_char()`/`unequip_char()`, and no changes to `205.obj` (this bitvector
is a runtime field on the loaded instance, not a static file field). The
`GET_OBJ_VNUM(sig_drop) == 20599` guard keeps this scoped to the crown only
— it will not automatically apply to future signature-drop table entries.

- [ ] **Step 3: Rebuild**

```bash
cd /Users/ricardobussacro/Documents/Wardome
docker compose up -d --build 2>&1 | tail -20
sleep 3
docker compose logs --tail=10 game 2>&1
```
Expected: clean boot (`Entering game loop.`), no compile errors.

- [ ] **Step 4: Live-verify the drop actually happens**

As Implementor, spawn and kill Termites King a handful of times (enough to plausibly see at least one drop at a 30% rate — 10 kills gives roughly 97% odds of at least one drop). `purge` clears the room between kills so corpses don't pile up:

```bash
( printf "DarTh\r\n1234\r\n\r\n1\r\n"; sleep 2
  for i in 1 2 3 4 5 6 7 8 9 10; do
    printf "load mob 20504\r\nkill king\r\n"; sleep 3
    printf "purge\r\n"; sleep 1
  done
) | nc -w 60 localhost 4000 > /tmp/sigdrop-test.log 2>&1
grep -a -c "chitinous crown" /tmp/sigdrop-test.log
```
Expected: a count greater than 0 (the exact number varies by RNG — this is a smoke test for "the mechanism fires at all," not a statistical rate check). If it's always 0 across a couple of runs of 10, re-check that `GET_MOB_VNUM(ch)` really returns `20504` for the spawned mob (log the value with a temporary `send_to_char` or check via `stat` in-game) before assuming the roll itself is broken.

- [ ] **Step 5: Verify the Sanctuary-on-Rare rule**

Keep re-running the loop from Step 4 (or `load obj 20599` directly and check its rarity repeatedly, since that also goes through `roll_item_rarity` — though only drops via `roll_signature_drop` get the Sanctuary check applied) until a dropped crown's name in the corpse shows the Rare tag (`&Y[R]` renders as a yellow `[R]` in a real client, or check the raw log for the `&Y[R]` escape sequence). Once you have a Rare-tagged crown, `get crown`, `wear crown`, then `affects` (or `score`) and confirm Sanctuary is listed as an active effect. Take off the crown (`remove crown`) and confirm Sanctuary disappears. Separately, get a crown that rolled Uncommon or Legendary (not Rare) and confirm wearing it does *not* grant Sanctuary.

- [ ] **Step 6: Commit**

```bash
cd /Users/ricardobussacro/Documents/Wardome
git add wdii/src/fight.c
git commit -m "feat: add signature mob-loot table, Termites King drops a chitinous crown at 30%"
```

---

### Task 5: Generate the item's icon

**Files:**
- Create: `web/assets/items/20599.jpg`

**Interfaces:**
- Consumes: nothing from earlier tasks (can run any time after Task 3 creates the item, purely for visual completeness in the equipment paperdoll — the game logic in Tasks 1/2/4 works without it, falling back to the slot placeholder via the existing `onerror` handler in `web/client.js`'s `setEquip()`).
- Produces: the icon file itself; no new function or interface.

- [ ] **Step 1: Fetch the icon via Pollinations**

```bash
cd /Users/ricardobussacro/Documents/Wardome
node -e "
const fs = require('fs');
const prompt = 'a chitinous crown made of hardened insect exoskeleton plates, royal termite king headwear, dark fantasy RPG inventory icon, single object centered, dark neutral background, no text, no UI, no scene, no hands, no character, isometric game item icon style';
const url = \`https://image.pollinations.ai/prompt/\${encodeURIComponent(prompt)}?width=128&height=128&seed=20599&nologo=true\`;
fetch(url).then(async (res) => {
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync('web/assets/items/20599.jpg', buf);
  console.log('wrote', buf.length, 'bytes');
}).catch((e) => console.error('FAILED', e.message));
"
```
Expected: `wrote <N> bytes` with no `FAILED` line. If it prints `FAILED HTTP 429`, another Pollinations request is in flight (e.g. the room/mob-art background generators from earlier work) — wait ~30 seconds and retry; the free tier allows only one request in flight per IP.

- [ ] **Step 2: Verify the file**

```bash
file web/assets/items/20599.jpg
```
Expected: `JPEG image data ... 128x128`.

- [ ] **Step 3: Commit**

```bash
cd /Users/ricardobussacro/Documents/Wardome
git add web/assets/items/20599.jpg
git commit -m "feat: generate icon for the chitinous crown (vnum 20599)"
```

---

### Task 6: End-to-end live verification

**Files:** none (verification only)

**Interfaces:** consumes everything from Tasks 1–5; produces no new code.

- [ ] **Step 1: Confirm low-level mobs never roll Rare/Legendary**

Find a low-level mob with a stat-carrying item it's already scripted to carry/wear (e.g. zone 186's newbie items on a level-under-100 newbie mob — check with `vstat mob <vnum>` in-game or `extract/out/mobs/*.json`'s `stats1_raw` first field for level). Kill it repeatedly (~15-20 times, purging the corpse between kills) and grep the session log for `[R]` or `[L]` tags:

```bash
grep -a -oE '&Y\[R\]|&R\[L\]' /tmp/<your-log-file>.log | sort | uniq -c
```
Expected: zero matches. Only `&B[I]` (Uncommon) or no tag (Common) should ever appear on that mob's drops.

- [ ] **Step 2: Confirm the paperdoll shows the crown with the right rarity border**

Open the game in the browser (`http://<tunnel-or-localhost>/play.html`), log in, `load obj 20599`, `wear crown`, open the Equipment overlay, and confirm the head slot shows the generated icon (Task 5) with a border color matching whatever rarity tier this particular instance rolled (check the exact tier via `identify crown` or `equipment` in the terminal — Common has no colored border beyond the default `--gold-dim`, Uncommon is blue, Rare is gold/yellow, Legendary is red, per `TIER_BORDER_COLORS` in `web/client.js`).

- [ ] **Step 3: Confirm a `+` tag doesn't break the border color**

This may take several `load obj 20599` + `identify`/`equipment` attempts to observe a `+` (an item only gets `+` if every one of its affects rolled the tier's maximum shift — with only one affect on this item, that just means the roll happened to land on the max value for its tier, which isn't rare enough to require dozens of attempts). Once you see `[R]+` or `[I]+` or `[L]+` in the item's name, re-check the Equipment overlay: the border color must still match the tier (not silently fall back to the default). This is the direct regression check for Task 2's fix.

- [ ] **Step 4: Report**

No commit needed for this task — it's pure verification. If any step fails, return to the relevant task above, fix, and re-run that task's own verification step before re-attempting this one.
