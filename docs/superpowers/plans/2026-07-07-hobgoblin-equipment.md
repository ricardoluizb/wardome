# Hobgoblin Faction Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship equipment for the hobgoblin faction in zone 178 (Gnome
Village) — soldier, bodyguard, miner, king — fixing several dead item
references and adding a signature-drop weapon for the king.

**Architecture:** One new world-data file (`178.obj`, 6 items) plus a
set of `178.zon` zone-reset edits (some new lines, some vnum swaps in
existing lines), all pure world-data with no recompile risk. Then one
data-only addition to the already-generic `SIGNATURE_DROPS[]` table in
`fight.c` to make the king's Greatclub a rolled-rarity drop — this table
and the code path around it (`roll_signature_drop()`/
`roll_item_rarity()`, already wired into `make_corpse()`) require zero
other C changes since they were built generically during an earlier
plan this session. Finally, icon generation via the existing
Pollinations pipeline and a metadata update for the equipment tooltip
feature.

**Tech Stack:** CircleMUD 3.0 C server (`wdii/src`), CircleMUD world-data
flat files (`.obj`, `.zon`, `index`), Node.js icon-generation tooling
(`tools/gen-item-icons.js`).

## Global Constraints

- New/fixed item vnums: 17820 (fix, king armor "Heavy banded mail"),
  17821 (fix, soldier weapon "a large club"), 17830 (new, bodyguard
  weapon "a spiked hobgoblin cudgel"), 17831 (new, miner weapon "a
  rusty hobgoblin pickaxe"), 17832 (new, king signature weapon "the
  Hobgoblin King's Greatclub"), 17833 (new, bodyguard armor "a hobgoblin
  bodyguard's leather harness").
- Wear-position numbers in `E` zone-reset lines: `16` = `WEAR_WIELD`,
  `5` = `WEAR_BODY` (confirmed against `wdii/src/structs.h`).
- Weapon item type is `ITEM_WEAPON` (`5`); armor item type is
  `ITEM_ARMOR` (`9`).
- Wear-flags bitmasks: weapons use `TAKE(1) + WIELD(8192) = 8193`;
  armor uses `TAKE(1) + BODY(8) = 9`.
- Armor items' `val0` stays `0` (this session's established convention
  — the AC bonus lives in the `affected[]` block only, never the
  item-type's own auto-apply value, to avoid double-dipping).
- Boots/armor stat values are fixed exactly as the spec states: no item
  in this plan except the king's Greatclub gets a rarity roll.
- `docker compose build` must succeed after every task; there is no
  unit test framework in this C MUD codebase, so this is the only
  automated verification available until the final live playtest.
- Any deploy of this feature requires `docker compose up -d --build`,
  which wipes ephemeral pfiles (no persistent volume) — get explicit
  user confirmation before running it, per this session's standing
  rule.

---

### Task 1: Create `178.obj` (all 6 items) and register it

**Files:**
- Create: `wdii/lib/world/obj/178.obj`
- Modify: `wdii/lib/world/obj/index`

**Interfaces:**
- Produces: item vnums 17820, 17821, 17830, 17831, 17832, 17833, all
  loadable via `read_object(<vnum>, VIRTUAL)`.
- Consumed by: Task 2 (zone-reset lines reference these exact vnums),
  Task 3 (the `SIGNATURE_DROPS[]` entry references vnum 17832), Task 4
  (icon generation keys off these exact vnums).

This file is blocked by `.gitignore`'s blanket `*.obj` rule (meant for
compiled C objects, also matches CircleMUD's `.obj` world-data
extension) — commit it with `git add -f`, same as every other item
file edited this session.

- [ ] **Step 1: Confirm the exact `.obj` field format against an
  existing weapon and an existing armor item in this same file family**

  Run: `sed -n '35,45p' wdii/lib/world/obj/35.obj`

  Expected output (the goblin leader's spear, edited earlier this
  session — confirms the weapon field layout):
  ```
  #3504
  spear small goblin chieftain~
  the Goblin Chieftain's Spear~
  A crude but sturdy spear lies here, its shaft notched with tally marks from countless ambushes along the lane.~
  ~
  5 m 8193
  0 5 1 11
  15 500 120
  A
  1 1
  ```
  Line 6 is `type extra_flags wear_flags` (`5` = `ITEM_WEAPON`, `8193` =
  `TAKE+WIELD`). Line 7 is `val0 val1 val2 val3` — `val1`/`val2` are the
  damage dice (`5d1` here), `val3` is the attack-message-type index
  (`11`, reused as-is for every new weapon in this task — it only
  affects flavor text, not gameplay). Line 8 is
  `weight cost rent_per_day`.

- [ ] **Step 2: Write `wdii/lib/world/obj/178.obj` with all 6 items**

  ```
  #17820
  mail banded heavy~
  Heavy banded mail~
  A suit of heavy banded mail is lying here.~
  ~
  9 0 9
  0 0 0 0
  20 4000 0
  A
  17 -6
  A
  5 1
  #17821
  club large~
  a large club~
  A large club is lying here.~
  ~
  5 0 8193
  0 3 8 11
  15 300 0
  #17830
  cudgel spiked hobgoblin~
  a spiked hobgoblin cudgel~
  A spiked hobgoblin cudgel is lying here.~
  ~
  5 0 8193
  0 4 8 11
  18 800 0
  A
  18 1
  #17831
  pickaxe rusty hobgoblin~
  a rusty hobgoblin pickaxe~
  A rusty hobgoblin pickaxe is lying here.~
  ~
  5 0 8193
  0 2 6 11
  10 150 0
  #17832
  greatclub hobgoblin king~
  the Hobgoblin King's Greatclub~
  The massive greatclub of the Hobgoblin King lies here, radiating brutal power.~
  ~
  5 0 8193
  0 5 8 11
  30 5000 0
  A
  18 2
  A
  19 2
  #17833
  harness leather hobgoblin bodyguard~
  a hobgoblin bodyguard's leather harness~
  A sturdy leather harness is lying here.~
  ~
  9 0 9
  0 0 0 0
  8 600 0
  A
  17 -5
  $
  ```

  Field-by-field notes:
  - `17820`: type `9` (`ITEM_ARMOR`), extra `0`, wear `9` (`TAKE+BODY`).
    `val0=0` (per Global Constraints — no type-based auto-AC). Affects:
    `17 -6` (`APPLY_AC -6`), `5 1` (`APPLY_CON +1`).
  - `17821`: type `5` (`ITEM_WEAPON`), wear `8193` (`TAKE+WIELD`). Damage
    `3d8` (`val1=3, val2=8`). No affects block.
  - `17830`: same weapon fields, damage `4d8`. Affect `18 1`
    (`APPLY_HITROLL +1`).
  - `17831`: same weapon fields, damage `2d6`. No affects.
  - `17832`: same weapon fields, damage `5d8`. Two affects: `18 2`
    (`APPLY_HITROLL +2`), `19 2` (`APPLY_DAMROLL +2`) — these are what
    `roll_item_rarity()` (Task 3's mechanism) will vary per the tier it
    rolls when this item drops.
  - `17833`: type `9` (`ITEM_ARMOR`), wear `9` (`TAKE+BODY`). `val0=0`.
    Affect `17 -5` (`APPLY_AC -5`).

- [ ] **Step 2b: Force-add the new `.obj` file to git (bypasses the
  `*.obj` gitignore rule) and confirm it's tracked**

  Run: `git add -f wdii/lib/world/obj/178.obj`
  Run: `git status --short wdii/lib/world/obj/178.obj`

  Expected: `A  wdii/lib/world/obj/178.obj` (staged as a new, added file).

- [ ] **Step 3: Register the file in `wdii/lib/world/obj/index`,
  keeping numeric order**

  Run: `sed -n '24,29p' wdii/lib/world/obj/index`

  Expected:
  ```
  120.obj
  150.obj
  186.obj
  205.obj
  ```

  Edit `wdii/lib/world/obj/index`, inserting `178.obj` between
  `150.obj` and `186.obj`:
  ```
  120.obj
  150.obj
  178.obj
  186.obj
  205.obj
  ```

- [ ] **Step 4: Compile-check**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors. (World-data
  parsing correctness — does the game actually boot without a new
  SYSERR for these lines — is confirmed later once Task 2's zone-reset
  wiring is also in place and the container is actually started; a
  clean `docker compose build` here only confirms the source tree still
  compiles.)

- [ ] **Step 5: Commit**

  ```bash
  git add -f wdii/lib/world/obj/178.obj
  git add wdii/lib/world/obj/index
  git commit -m "feat: create zone 178's missing object file with hobgoblin faction equipment"
  ```

---

### Task 2: Wire the items into zone 178's reset commands

**Files:**
- Modify: `wdii/lib/world/zon/178.zon`

**Interfaces:**
- Consumes: item vnums 17820/17821/17830/17831/17832/17833 from Task 1.
- Produces: a fully-wired zone reset — every hobgoblin mob spawn gets
  its intended equipment on every zone reset. Nothing from this task is
  consumed by later tasks.

This file is plain text and not blocked by `.gitignore` — normal
`git add` works.

- [ ] **Step 1: Add `E` lines for the 4 unequipped soldier spawns**

  Run: `grep -n "17816 20" wdii/lib/world/zon/178.zon`

  Expected:
  ```
  117:M 0 17816 20 17881 	(The hobgoblin soldier)
  118:M 0 17816 20 17881 	(The hobgoblin soldier)
  119:M 0 17816 20 17882 	(The hobgoblin soldier)
  120:M 0 17816 20 17882 	(The hobgoblin soldier)
  ```

  These 4 lines currently have no equipment at all (unlike the other 8
  soldier spawns earlier in the file, which already have
  `E 1 17821 40 16` right after them). Edit the file so each of these 4
  `M` lines is immediately followed by the same `E` line the other 8
  soldiers use:

  ```
  M 0 17816 20 17881 	(The hobgoblin soldier)
  E 1 17821 40 16 	(a large club)
  M 0 17816 20 17881 	(The hobgoblin soldier)
  E 1 17821 40 16 	(a large club)
  M 0 17816 20 17882 	(The hobgoblin soldier)
  E 1 17821 40 16 	(a large club)
  M 0 17816 20 17882 	(The hobgoblin soldier)
  E 1 17821 40 16 	(a large club)
  ```

- [ ] **Step 2: Upgrade the bodyguard's weapon and add their armor**

  Run: `grep -n "17817 5 17867" wdii/lib/world/zon/178.zon`

  Expected (5 identical pairs):
  ```
  97:M 0 17817 5 17867 	(The hobgoblin bodyguard)
  98:E 1 17821 30 16 	(a large club)
  99:M 0 17817 5 17867 	(The hobgoblin bodyguard)
  100:E 1 17821 30 16 	(a large club)
  101:M 0 17817 5 17867 	(The hobgoblin bodyguard)
  102:E 1 17821 30 16 	(a large club)
  103:M 0 17817 5 17867 	(The hobgoblin bodyguard)
  104:E 1 17821 30 16 	(a large club)
  105:M 0 17817 5 17867 	(The hobgoblin bodyguard)
  106:E 1 17821 30 16 	(a large club)
  ```

  Edit the file: for EACH of these 5 `M`/`E` pairs, change the `E`
  line's vnum from `17821` to `17830` (the bodyguard's own cudgel, not
  the soldier's plain club), keeping the same `30` max-existing and `16`
  wear-position fields, then add a new `E` line right after it for the
  harness (vnum 17833, wear position `5` = body). The result for all 5
  spawns:

  ```
  M 0 17817 5 17867 	(The hobgoblin bodyguard)
  E 1 17830 30 16 	(a spiked hobgoblin cudgel)
  E 1 17833 30 5 	(a hobgoblin bodyguard's leather harness)
  M 0 17817 5 17867 	(The hobgoblin bodyguard)
  E 1 17830 30 16 	(a spiked hobgoblin cudgel)
  E 1 17833 30 5 	(a hobgoblin bodyguard's leather harness)
  M 0 17817 5 17867 	(The hobgoblin bodyguard)
  E 1 17830 30 16 	(a spiked hobgoblin cudgel)
  E 1 17833 30 5 	(a hobgoblin bodyguard's leather harness)
  M 0 17817 5 17867 	(The hobgoblin bodyguard)
  E 1 17830 30 16 	(a spiked hobgoblin cudgel)
  E 1 17833 30 5 	(a hobgoblin bodyguard's leather harness)
  M 0 17817 5 17867 	(The hobgoblin bodyguard)
  E 1 17830 30 16 	(a spiked hobgoblin cudgel)
  E 1 17833 30 5 	(a hobgoblin bodyguard's leather harness)
  ```

- [ ] **Step 3: Add the king's signature weapon (leave the existing
  armor line untouched)**

  Run: `grep -n "17818 1 17867" wdii/lib/world/zon/178.zon`

  Expected:
  ```
  107:M 0 17818 1 17867 	(the king of the hobgoblins)
  108:E 1 17820 5 5 	(Heavy banded mail)
  ```

  Edit the file: add one new `E` line for the Greatclub right after the
  existing armor line (do not change or remove the existing
  `E 1 17820 5 5` line — vnum 17820 now resolves to a real object
  thanks to Task 1, so this line starts working as-is):

  ```
  M 0 17818 1 17867 	(the king of the hobgoblins)
  E 1 17820 5 5 	(Heavy banded mail)
  E 1 17832 5 16 	(the Hobgoblin King's Greatclub)
  ```

- [ ] **Step 4: Add `E` lines for the 3 unequipped miner spawns**

  Run: `grep -n "17819 6" wdii/lib/world/zon/178.zon`

  Expected:
  ```
  95:M 0 17819 6 17861 	(A hobgoblin miner)
  96:M 0 17819 6 17863 	(A hobgoblin miner)
  122:M 0 17819 6 17888 	(A hobgoblin miner)
  ```

  Edit the file: add an `E` line for the pickaxe (vnum 17831, wear
  position `16` = wield) right after each of these 3 `M` lines (note the
  third one is far away in the file, near the end, not adjacent to the
  first two):

  ```
  M 0 17819 6 17861 	(A hobgoblin miner)
  E 1 17831 20 16 	(a rusty hobgoblin pickaxe)
  ```
  ```
  M 0 17819 6 17863 	(A hobgoblin miner)
  E 1 17831 20 16 	(a rusty hobgoblin pickaxe)
  ```
  ```
  M 0 17819 6 17888 	(A hobgoblin miner)
  E 1 17831 20 16 	(a rusty hobgoblin pickaxe)
  ```

- [ ] **Step 5: Compile-check**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add wdii/lib/world/zon/178.zon
  git commit -m "feat: wire hobgoblin faction equipment into zone 178's resets"
  ```

---

### Task 3: Signature-drop table entry for the King's Greatclub

**Files:**
- Modify: `wdii/src/fight.c` (the `SIGNATURE_DROPS[]` array)

**Interfaces:**
- Consumes: item vnum 17832 (Task 1), mob vnum 17818 (existing world
  data, the king of the hobgoblins).
- Produces: nothing further consumed by other tasks — this is the last
  code task, verified by the final live playtest.

- [ ] **Step 1: Read the current table to confirm the exact insertion
  point and syntax**

  Run: `grep -n "SIGNATURE_DROPS\[\]" -A 4 wdii/src/fight.c`

  Expected:
  ```c
  static struct signature_drop_entry SIGNATURE_DROPS[] = {
    { 20504, 20599, 30 },  /* Termites King -> a chitinous crown, 30% */
    { -1, -1, -1 }
  };
  ```

- [ ] **Step 2: Add the new entry, before the terminator row**

  Edit `wdii/src/fight.c`, changing:
  ```c
  static struct signature_drop_entry SIGNATURE_DROPS[] = {
    { 20504, 20599, 30 },  /* Termites King -> a chitinous crown, 30% */
    { -1, -1, -1 }
  };
  ```
  to:
  ```c
  static struct signature_drop_entry SIGNATURE_DROPS[] = {
    { 20504, 20599, 30 },  /* Termites King -> a chitinous crown, 30% */
    { 17818, 17832, 30 },  /* King of the Hobgoblins -> the Greatclub, 30% */
    { -1, -1, -1 }
  };
  ```

- [ ] **Step 3: Compile-check**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors. This is a
  pure-data addition to an existing, already-compiling table, so a
  clean build is expected on the first try.

- [ ] **Step 4: Commit**

  ```bash
  git add wdii/src/fight.c
  git commit -m "feat: make the Hobgoblin King's Greatclub a signature drop"
  ```

---

### Task 4: Generate item icons and register their tooltip names

**Files:**
- Modify: `tools/item-icon-prompts.json` (add 6 vnum entries)
- Modify: `web/assets/items-meta.json` (add 6 vnum→name entries)
- Create (via script, not by hand): `web/assets/items/17820.jpg`,
  `17821.jpg`, `17830.jpg`, `17831.jpg`, `17832.jpg`, `17833.jpg`

**Interfaces:**
- Consumes: the same 6 vnums from Task 1 (must match exactly, or the
  client-side equipment tooltip and paperdoll icon lookups silently
  fall back to a placeholder/generic label for a mismatched vnum).
- Produces: nothing consumed by other tasks — this is presentation
  polish, independent of Tasks 1-3's gameplay mechanics.

- [ ] **Step 1: Confirm the prompts file format**

  Run: `python3 -c "import json; d = json.load(open('tools/item-icon-prompts.json')); print(list(d.items())[:2])"`

  Expected: a list of two `(vnum_string, prompt_string)` tuples, e.g.
  `[('1', 'A pair of large feathered wings...'), ('901', 'A dark
  minotaur-hide shield...')]` — confirms it's a flat `{vnum: prompt}`
  JSON object.

- [ ] **Step 2: Add 6 new prompt entries**

  Edit `tools/item-icon-prompts.json`, adding these 6 key-value pairs
  anywhere in the top-level object (valid JSON, comma-separated with
  the existing entries — do not remove or reorder any existing entry):

  ```json
  "17820": "A heavy suit of banded mail armor, thick overlapping metal bands over dark leather, battle-worn and reinforced for a hobgoblin king.",
  "17821": "A large crude wooden club, roughly hewn, bound with strips of iron and leather grip wrapping.",
  "17830": "A spiked wooden cudgel, studded with jagged iron spikes along its head, crude but brutal.",
  "17831": "A rusty iron pickaxe with a worn wooden handle, pitted and stained from digging.",
  "17832": "A massive ornate greatclub studded with iron and bone, radiating brutal royal power, larger and more menacing than an ordinary club.",
  "17833": "A sturdy leather harness with reinforced straps and buckles, worn as body armor."
  ```

- [ ] **Step 3: Generate the icons**

  Run: `node tools/gen-item-icons.js items`

  Expected: log lines `[gen-item-icons] wrote web/assets/items/17820.jpg
  (... bytes)` through `17833.jpg` for all 6 new vnums (existing vnums
  are skipped with a `already exists` log line — safe to re-run).

- [ ] **Step 4: Add display names to the tooltip metadata**

  Run: `python3 -c "import json; d = json.load(open('web/assets/items-meta.json')); print(len(d))"`

  Expected: a number (confirms the file is a flat `{vnum: name}` JSON
  object, same shape as the prompts file).

  Edit `web/assets/items-meta.json`, adding:
  ```json
  "17820": "Heavy banded mail",
  "17821": "a large club",
  "17830": "a spiked hobgoblin cudgel",
  "17831": "a rusty hobgoblin pickaxe",
  "17832": "the Hobgoblin King's Greatclub",
  "17833": "a hobgoblin bodyguard's leather harness"
  ```

- [ ] **Step 5: Verify the generated files**

  Run: `file web/assets/items/17820.jpg web/assets/items/17821.jpg web/assets/items/17830.jpg web/assets/items/17831.jpg web/assets/items/17832.jpg web/assets/items/17833.jpg`

  Expected: all 6 report as `JPEG image data`, non-zero size.

- [ ] **Step 6: Commit**

  ```bash
  git add tools/item-icon-prompts.json web/assets/items-meta.json web/assets/items/17820.jpg web/assets/items/17821.jpg web/assets/items/17830.jpg web/assets/items/17831.jpg web/assets/items/17832.jpg web/assets/items/17833.jpg
  git commit -m "feat: generate icons and tooltip names for hobgoblin faction equipment"
  ```

---

### Task 5: Deploy and live playtest

**Files:** none (verification only).

- [ ] **Step 1: Get explicit user confirmation, then deploy**

  This rebuild wipes ephemeral pfiles (no persistent volume) — confirm
  with the user before running:

  ```bash
  docker compose up -d --build
  ```

  Expected: `Container wardome-server Recreated` / `Started`.

- [ ] **Step 2: Confirm a clean boot**

  Run: `docker compose logs --tail=15 game`

  Expected: `Entering game loop.` with no new `SYSERR` lines referencing
  zone 178 or vnums 17820/17821/17830/17831/17832/17833 (pre-existing
  SYSERRs for the zone's still-broken, out-of-scope gnome items are
  expected and fine — confirm none of the NEW lines are among them, the
  same way this was checked for the newbie boots quest deploy).

- [ ] **Step 3: Playtest each mob type**

  Go to zone 178 and confirm via `zreset 178` (if Implementor) or
  natural room visits:
  - A soldier hobgoblin (`stat mob 17816`/examine one in the world)
    wields "a large club".
  - A bodyguard hobgoblin wields "a spiked hobgoblin cudgel" and wears
    "a hobgoblin bodyguard's leather harness" on its body.
  - A hobgoblin miner wields "a rusty hobgoblin pickaxe".
  - The king of the hobgoblins wears "Heavy banded mail" and wields
    "the Hobgoblin King's Greatclub".
  - Kill the king (as an appropriately leveled/immortal test character)
    across a handful of zone resets and confirm the Greatclub drops
    roughly 30% of the time, with a rarity tag (`[I]`/`[R]`/`[L]`) baked
    into its name when it does, matching the existing signature-drop
    behavior already verified for the Termites King crown earlier this
    session.
