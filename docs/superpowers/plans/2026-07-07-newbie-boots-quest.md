# Newbie Boots Quest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship a small fetch quest in zone 186 (Newbie Zone): talk to the
newbie janitor for a hint, pick up a letter from his room, deliver it to
the clueless newbie, receive a pair of newbie boots.

**Architecture:** Two new world-data items (a quest-token letter and the
boots reward) plus one DG speech trigger for flavor dialogue on the
janitor — all pure world-data, no recompile risk. The actual
letter-for-boots swap on delivery needs one small, targeted C special
case in `perform_give()` (`act.item.c`), because this codebase's DG
give/receive trigger hooks (`give_otrigger`/`receive_mtrigger`) are
defined in `dg_triggers.c` but never called from `do_give`/`perform_give`
anywhere — giving an item to a mob cannot fire any script at all right
now. A new player flag (`PLR2_NEWBIE_BOOTS_DONE`, on the previously-empty
`act2`/`PLR2_FLAGS` field) makes the reward one-time and persists for
free through the existing player-save mechanism.

**Tech Stack:** CircleMUD 3.0 C server (`wdii/src`), CircleMUD world-data
flat files (`.obj`, `.mob`, `.zon`, `.trg`, `index`).

## Global Constraints

- New item vnums: 18630 (boots), 18631 (letter). Zone 186's real `.obj`
  file only goes up to vnum 18614; 18615-18699 are free.
- New trigger vnum: 18650 (zone 186 has no existing `.trg` file).
- Existing mobs used as-is, no changes to their stats: the newbie
  janitor (vnum 18600, room 18601) and the clueless newbie (vnum 18612).
- Boots affects: `APPLY_MOVE +10`, `APPLY_AC -2`, fixed Common tier (no
  rarity roll — same fixed-rarity precedent as the Moria ring).
- The reward swap only fires for `!IS_NPC(ch) && IS_NPC(vict) &&
  GET_MOB_VNUM(vict) == 18612 && GET_OBJ_VNUM(obj) == 18631`, gated by
  `PLR2_NEWBIE_BOOTS_DONE` so it can't be repeated.
- Any deploy of this feature requires `docker compose up -d --build`,
  which wipes ephemeral pfiles (no persistent volume) — get explicit
  user confirmation before running it, per this session's standing rule.
- There is no unit test framework in this C MUD codebase. "Testing" in
  this plan means: `docker compose build` to compile-check, then a
  manual playtest via a live nc/telnet session against the running
  container, matching how every other change this session was verified.

---

### Task 1: World-data items — boots, letter, and the letter's room placement

**Files:**
- Modify: `wdii/lib/world/obj/186.obj` (append two new item entries)
- Modify: `wdii/lib/world/zon/186.zon` (append one `O` command)

**Interfaces:**
- Produces: item vnum 18630 "a pair of newbie boots" (feet slot,
  `APPLY_MOVE +10`, `APPLY_AC -2`), item vnum 18631 "a dusty newbie
  letter" (plain token, no affects), and a zone-reset line that places
  one copy of the letter in room 18601 (the janitor's room) on every
  zone reset.
- Consumed by: Task 2 (the janitor's trigger references the letter by
  name in dialogue only, no vnum coupling) and Task 3 (the C special
  case checks `GET_OBJ_VNUM(obj) == 18631` and loads vnum 18630).

Both `.obj` and `.zon` files are plain text and NOT blocked by
`.gitignore` the way `.obj` *world* files can be confused with compiled
`.o` files — this project's `.gitignore` blocks `*.obj`, so both new
entries in `186.obj` will need `git add -f` at commit time (same as
every other item edit this session).

- [ ] **Step 1: Read the current end of `186.obj` to confirm the exact
  insertion point**

  Run: `tail -20 wdii/lib/world/obj/186.obj`

  Expected: the file ends with vnum `#18614` (a glowing newbie mace)
  followed by a single `$` terminator line. You will insert the two new
  entries between `#18614`'s block and the final `$`.

- [ ] **Step 2: Append the boots item**

  Edit `wdii/lib/world/obj/186.obj`, replacing the trailing `$` with:

  ```
  #18630
  boots newbie~
  a pair of newbie boots~
  A sturdy pair of newbie boots is lying here.~
  ~
  9 0 65
  0 0 0 0
  3 50 0
  A
  14 10
  A
  17 -2
  $
  ```

  Field meanings (matching this file's existing entries): line 6 is
  `type extra_flags wear_flags` — `9` = `ITEM_ARMOR`, `0` = no extra
  flags, `65` = `ITEM_WEAR_TAKE (1) + ITEM_WEAR_FEET (64)`. Line 7 is the
  four value slots (`0 0 0 0` — armor's own built-in AC-apply value slot
  is left at 0 so it doesn't stack with the `A` affect block below,
  matching how this session's other custom items use `affected[]`
  instead of the type's own value-based bonus). Line 8 is
  `weight cost rent_per_day`. The two `A` blocks are affects:
  `14 10` = `APPLY_MOVE` (14) modifier `+10`; `17 -2` = `APPLY_AC` (17)
  modifier `-2`.

- [ ] **Step 3: Append the letter item, right after the boots, before
  the final `$`**

  ```
  #18631
  letter dusty newbie~
  a dusty newbie letter~
  A dusty, sealed letter lies here, addressed to no one in particular.~
  ~
  12 0 1
  0 0 0 0
  1 0 0
  $
  ```

  Line 6: `12 0 1` — `12` = `ITEM_OTHER`, `0` = no extra flags, `1` =
  `ITEM_WEAR_TAKE` only (no wearable slot). No affects block — this is a
  plain delivery token.

- [ ] **Step 4: Stage the `.obj` file (bypassing the `*.obj` gitignore
  rule) and confirm it parses**

  Run: `git add -f wdii/lib/world/obj/186.obj`
  Run: `git diff --cached --stat`

  Expected: shows `186.obj` with insertions only, no deletions (the
  trailing `$` moved down, not removed).

- [ ] **Step 5: Add the letter to the janitor's room via a zone-reset
  `O` command**

  Read `wdii/lib/world/zon/186.zon` lines 1-10 first to see the exact
  existing `O` command style:

  Run: `sed -n '1,10p' wdii/lib/world/zon/186.zon`

  Expected output includes a line like:
  `O 1 2 5 18600 	(&bthe &bw&Ba&br&Bd&bo&Bm&be help guide&n)`

  This confirms the format: `O <flag> <obj_vnum> <max_existing>
  <room_vnum>` followed by a tab and a `(...)` comment (purely cosmetic,
  ignored by the parser, but this file's convention includes one on
  every line).

  Add this new line right after the existing `M 0 18600 1 18601` line
  (the janitor's own mob-load line, so the letter's reset command is
  grouped next to the mob it belongs to):

  ```
  O 1 18631 1 18601 	(a dusty newbie letter)
  ```

- [ ] **Step 6: Compile-check and boot-check (world-data only, but
  world files are baked into the image the same way source is)**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors. This does not
  yet start a new container, so no pfiles are affected. World-data
  correctness (does the game actually parse the new `.obj`/`.zon`
  entries without a boot-time SYSERR) will be verified in Task 3's
  playtest, once the container is actually rebuilt and started — a
  clean `docker compose build` here only confirms the source tree still
  compiles; catching a malformed `.obj`/`.zon` line requires booting.

- [ ] **Step 7: Commit**

  ```bash
  git add -f wdii/lib/world/obj/186.obj
  git add wdii/lib/world/zon/186.zon
  git commit -m "feat: add newbie boots quest items (letter + boots reward)"
  ```

---

### Task 2: Janitor's speech trigger (flavor dialogue, pure DG script)

**Files:**
- Create: `wdii/lib/world/trg/18650.trg`
- Modify: `wdii/lib/world/trg/index` (register the new file)
- Modify: `wdii/lib/world/mob/186.mob` (attach the trigger to the
  janitor's mob entry, vnum 18600)

**Interfaces:**
- Consumes: nothing from Task 1 (this trigger is dialogue-only; it does
  not create or check for the letter object).
- Produces: a working Speech trigger vnum 18650 attached to mob 18600,
  so saying `letter` to the janitor gets a flavor response. Nothing
  from this task is consumed by Task 3 (the C special case does not
  reference the trigger at all).

- [ ] **Step 1: Confirm the trigger file format against an existing
  Speech trigger**

  Run: `grep -B1 -A5 '^0 d 100' wdii/lib/world/trg/0.trg | head -20`

  Expected output includes a block like:
  ```
  #5
  car/cdr test~
  0 d 100
  test~
  say speech: %speech%
  ...
  ~
  ```

  This confirms: line 1 `#<vnum>`, line 2 name (author-facing, not
  shown to players)`~`, line 3 `<attach_class> <letter> <percent>` (`0`
  = mob trigger, `d` = Speech, `100` = always fires), line 4 the
  keyword(s) the player must say, then the script body, ending `~`. The
  whole file ends with a final `$` after the last trigger.

- [ ] **Step 2: Create `wdii/lib/world/trg/18650.trg`**

  ```
  #18650
  newbie janitor hint~
  0 d 100
  letter~
  wait 1s
  say Ah, a new face! I dropped an important letter somewhere around here. Could you find it and deliver it to the clueless newbie for me?
  ~
  $
  ```

- [ ] **Step 3: Register the new file in the trigger index**

  Run: `tail -5 wdii/lib/world/trg/index`

  Expected: the file ends with the last registered `.trg` filename,
  then a blank line, then `$`.

  Edit `wdii/lib/world/trg/index`: insert a new line `18650.trg` right
  after the last filename entry and before the trailing blank line +
  `$`, so the end of the file reads:

  ```
  ...
  326.trg
  18650.trg

  $
  ```

- [ ] **Step 4: Attach the trigger to the janitor's mob entry**

  Run: `grep -n -A11 '^#18600$' wdii/lib/world/mob/186.mob | head -12`

  Expected output (the janitor's full block):
  ```
  #18600
  newbie janitor~
  newbie janitor~
  The newbie janitor is here cleaning area stuff.
  ~

  ~
  12 263176 0 E
  1 20 10 1d1+18 5d1+0
  15 196 0
  8 8 0 -1 -1
  E
  ```

  Edit `wdii/lib/world/mob/186.mob`: insert a new line `T 18650`
  immediately after that block's final `E` line (the one right before
  `#18601`), so it reads:

  ```
  8 8 0 -1 -1
  E
  T 18650
  #18601
  ```

- [ ] **Step 5: Compile-check**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors (this task is
  world-data only, so a clean build mainly confirms nothing else broke;
  the trigger's own correctness is confirmed by the Task 3 playtest,
  where you'll say `letter` to the janitor as part of the end-to-end
  test).

- [ ] **Step 6: Commit**

  ```bash
  git add wdii/lib/world/trg/18650.trg wdii/lib/world/trg/index
  git add -f wdii/lib/world/mob/186.mob
  git commit -m "feat: add janitor speech trigger for the newbie boots quest hint"
  ```

---

### Task 3: Letter-to-boots swap in `perform_give()` + one-time flag

**Files:**
- Modify: `wdii/src/structs.h` (add `PLR2_NEWBIE_BOOTS_DONE`)
- Modify: `wdii/src/act.item.c:613-633` (`perform_give()`)

**Interfaces:**
- Consumes: item vnums 18630/18631 from Task 1 (`GET_OBJ_VNUM(obj) ==
  18631` check, `read_object(18630, VIRTUAL)` to create the reward),
  mob vnum 18612 from the existing world data (`GET_MOB_VNUM(vict) ==
  18612`).
- Produces: nothing further consumed by other tasks — this is the last
  task, and its correctness is verified by an end-to-end playtest.

- [ ] **Step 1: Add the new player flag**

  Read the existing `PLR_*` flag list first:

  Run: `grep -n '#define PLR_' wdii/src/structs.h`

  Expected: a list ending around `#define PLR_SECPLAYER (1 << 22)`.

  Edit `wdii/src/structs.h`, adding a new block right after that list
  (this project's `act2`/`PLR2_FLAGS(ch)` field, declared as `long act2`
  in the same struct as `act`, has no flags defined on it yet, so this
  is a fresh, unused bit space — no collision risk with anything):

  ```c
  #define PLR2_NEWBIE_BOOTS_DONE  (1 << 0)  /* Already got the newbie boots reward */
  ```

- [ ] **Step 2: Read the current `perform_give()` to confirm the exact
  insertion point**

  Run: `sed -n '613,633p' wdii/src/act.item.c`

  Expected: the function as documented in this plan's Architecture
  section, ending with:
  ```c
    act("$n gives $p to $N.", TRUE, ch, obj, vict, TO_NOTVICT);
  }
  ```

- [ ] **Step 3: Add the special-case swap right before the closing
  brace**

  Edit `wdii/src/act.item.c`, changing:

  ```c
    act("$n gives $p to $N.", TRUE, ch, obj, vict, TO_NOTVICT);
  }
  ```

  to:

  ```c
    act("$n gives $p to $N.", TRUE, ch, obj, vict, TO_NOTVICT);

    /* Newbie boots fetch quest: giving the dusty newbie letter (18631)
       to the clueless newbie (18612) swaps it for a pair of newbie
       boots (18630), once per player. This codebase's DG script
       give/receive hooks (give_otrigger/receive_mtrigger in
       dg_triggers.c) are compiled in but never called from do_give
       anywhere, so this one-off swap is a small hardcoded special case
       instead, matching the pattern already used for the Moria ring
       and the chitinous crown. */
    if (!IS_NPC(ch) && IS_NPC(vict) && GET_MOB_VNUM(vict) == 18612 &&
        GET_OBJ_VNUM(obj) == 18631 &&
        !IS_SET(PLR2_FLAGS(ch), PLR2_NEWBIE_BOOTS_DONE)) {
      struct obj_data *boots;
      extract_obj(obj);
      boots = read_object(18630, VIRTUAL);
      obj_to_char(boots, ch);
      SET_BIT(PLR2_FLAGS(ch), PLR2_NEWBIE_BOOTS_DONE);
      act("$N thanks you and hands you a pair of newbie boots!", FALSE, ch, 0, vict, TO_CHAR);
      act("$n thanks $N and hands over a pair of boots.", TRUE, ch, 0, vict, TO_NOTVICT);
    }
  }
  ```

  Note `obj` is extracted (destroyed) here — this happens after the
  three `act()` calls above it that already reference `obj` for the
  normal give message, so the object is still valid when those run.

- [ ] **Step 4: Compile-check**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors. If you see an
  undeclared-identifier error for `PLR2_FLAGS`, `GET_MOB_VNUM`, or
  `GET_OBJ_VNUM`, re-check Step 1 landed in `structs.h` before
  `act.item.c` is compiled — all three macros already exist in
  `utils.h` (confirmed during planning), so a clean build is expected
  on the first try.

- [ ] **Step 5: Commit**

  ```bash
  git add wdii/src/structs.h wdii/src/act.item.c
  git commit -m "feat: swap the newbie letter for boots on delivery to the clueless newbie"
  ```

- [ ] **Step 6: Get explicit user confirmation, then deploy and
  playtest end-to-end**

  This is the point where world-data + C changes actually need to run
  in the live game. Ask the user to confirm a rebuild (it wipes
  ephemeral pfiles, per this session's standing rule) before running:

  ```bash
  docker compose up -d --build
  ```

  Expected: `Container wardome-server Recreated` / `Started`, then a
  clean boot log (no `SYSERR` lines) via:

  ```bash
  docker compose logs --tail=15 game
  ```

  Then playtest end-to-end via a live session (create a fresh test
  character, or use an existing one): go to room 18601, say `letter` to
  the newbie janitor and confirm the hint dialogue appears; `get
  letter`; travel to the clueless newbie (mob 18612) and `give letter to
  newbie`; confirm the thank-you message appears and `equipment`/
  `inventory` shows the new boots; repeat `give letter to newbie` a
  second time (after getting a fresh letter, since the zone reset will
  reload one, or by waiting for a zone reset) and confirm the second
  attempt does NOT grant a second pair of boots (the `PLR2_FLAGGED`
  gate holds).
