# Race Temple Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anyone standing in room 500 ("The Wardome Preparation Room")
gets automatically teleported to their own race's temple room 1.5
seconds later, every time, regardless of level.

**Architecture:** One new runtime-only `int` field on `struct char_data`
tracks how many pulses a character has continuously spent in room 500.
A new function, called unconditionally every game pulse from `comm.c`'s
existing `heartbeat()`, walks the global character list and advances
this counter for anyone in room 500 (resetting it for everyone else),
teleporting to a race-specific room once the counter reaches 15 pulses
(1.5 seconds at this codebase's fixed 10-pulses/second rate). No new
event-scheduling primitive and no world-data changes — the mechanism
mirrors existing periodic per-character systems in `limits.c`, and every
destination room already exists.

**Tech Stack:** CircleMUD 3.0 C server (`wdii/src`). No unit test
framework exists in this codebase — verification is `docker compose
build` (compile-check) followed by a live playtest after deploy.

## Global Constraints

- New field: `int prep_room_timer;` on `struct char_data`
  (`wdii/src/structs.h`), placed in the runtime-only region (next to
  `next_in_room`/`next`/`next_fighting`), NOT part of the saved pfile
  format.
- Threshold: exactly 15 pulses (`PASSES_PER_SEC` is `10`, confirmed in
  `structs.h`, so 15 pulses = 1.5 real seconds).
- Race → room table (`GET_RACE(ch)` value → destination room vnum),
  copied verbatim from the spec:
  | value | race constant | room vnum |
  |---|---|---|
  | 0 | `RACE_VAMPIRE` (displays as "Human" in this fork) | 516 |
  | 1 | `RACE_DROW` | 517 |
  | 2 | `RACE_DWARF` | 518 |
  | 3 | `RACE_ELF` | 513 |
  | 4 | `RACE_OGRE` | 520 |
  | 5 | `RACE_ORC` | 514 |
  | 6 | `RACE_TROLL` | 515 |
  | 7 | `RACE_GITH` | 521 |
  | 8 | `RACE_GNOME` | 522 |
  | 9 | `RACE_LIZARDMAN` | 519 |
  | 10 | `RACE_SEA_ELF` | 512 |
  | 11 | `RACE_GORAK` | 511 |
  | anything else (remort races) | — | 567 |
- Applies to every character regardless of level, and only to PCs
  (`!IS_NPC(ch)`) — NPCs are never affected even if somehow placed in
  room 500.
- `docker compose build` must succeed with no errors after every task.
- Any deploy of this feature requires `docker compose up -d --build`,
  which wipes ephemeral pfiles (no persistent volume) — get explicit
  user confirmation before running it, per this session's standing
  rule.

---

### Task 1: Add the runtime timer field, the pulse-check function, and the heartbeat hook

**Files:**
- Modify: `wdii/src/structs.h` (add `prep_room_timer` field)
- Modify: `wdii/src/limits.c` (add `prep_room_check()`)
- Modify: `wdii/src/comm.c` (call it from `heartbeat()`)

**Interfaces:**
- Produces: `void prep_room_check(void)` in `limits.c`, called from
  `comm.c`'s `heartbeat()`. Nothing else in this plan consumes it — this
  is the whole feature in one task, since the field, the function, and
  the hook only make sense together (none is independently testable).

- [ ] **Step 1: Add the new runtime field to `struct char_data`**

  Run: `grep -n "int current_quest;" wdii/src/structs.h`

  Expected:
  ```
  1229:   int current_quest;			/* vnum of current quest          */
  ```

  Edit `wdii/src/structs.h`, changing:
  ```c
     int current_quest;			/* vnum of current quest          */

     struct char_data *next_in_room;      /* For room->people - list
  ```
  to:
  ```c
     int current_quest;			/* vnum of current quest          */
     int prep_room_timer;                /* pulses spent in room 500, for
                                             race-temple auto-routing --
                                             runtime only, not saved     */

     struct char_data *next_in_room;      /* For room->people - list
  ```

- [ ] **Step 2: Confirm `real_room()`, `IN_ROOM()`, `GET_RACE()`,
  `character_list`, and the safe-iteration pattern this codebase already
  uses, are all available in `limits.c`**

  Run: `grep -n 'extern struct char_data \*character_list' wdii/src/limits.c`

  Expected: `23:extern struct char_data *character_list;` — confirms the
  global list is already accessible in this file.

  Run: `sed -n '279,291p' wdii/src/limits.c`

  Expected (an existing function in the same file, `mental_update()`,
  showing the exact safe-iteration idiom to copy — captures `next_char`
  before any mutation could invalidate `i`):
  ```c
  void mental_update(void)
  {
    struct char_data *i, *next_char;

    for (i = character_list; i; i = next_char) {
      next_char = i->next;
      if(!i)  return;
      if (GET_POS(i) >= POS_STUNNED)
        GET_MENTAL(i) = MIN(GET_MENTAL(i) + mental_gain(i), GET_MAX_MENTAL(i));
      if (GET_POS(i) < POS_INCAP)
        update_pos(i);
    }
  }
  ```

- [ ] **Step 3: Add `prep_room_check()` to `wdii/src/limits.c`, right
  after `mental_update()`**

  ```c
  void prep_room_check(void)
  {
    struct char_data *i, *next_char;
    int prep_room, dest_room;

    prep_room = real_room(500);
    if (prep_room < 0)
      return;

    for (i = character_list; i; i = next_char) {
      next_char = i->next;

      if (IS_NPC(i))
        continue;

      if (IN_ROOM(i) != prep_room) {
        i->prep_room_timer = 0;
        continue;
      }

      i->prep_room_timer++;
      if (i->prep_room_timer < 15)
        continue;

      i->prep_room_timer = 0;

      switch (GET_RACE(i)) {
        case RACE_VAMPIRE:    dest_room = real_room(516); break;
        case RACE_DROW:       dest_room = real_room(517); break;
        case RACE_DWARF:      dest_room = real_room(518); break;
        case RACE_ELF:        dest_room = real_room(513); break;
        case RACE_OGRE:       dest_room = real_room(520); break;
        case RACE_ORC:        dest_room = real_room(514); break;
        case RACE_TROLL:      dest_room = real_room(515); break;
        case RACE_GITH:       dest_room = real_room(521); break;
        case RACE_GNOME:      dest_room = real_room(522); break;
        case RACE_LIZARDMAN:  dest_room = real_room(519); break;
        case RACE_SEA_ELF:    dest_room = real_room(512); break;
        case RACE_GORAK:      dest_room = real_room(511); break;
        default:              dest_room = real_room(567); break;
      }

      if (dest_room < 0)
        continue;

      send_to_char("&WYou feel a divine pull guiding you toward your homeland...&n\r\n", i);
      act("$n fades away in a shimmer of divine light.", TRUE, i, 0, 0, TO_ROOM);
      char_from_room(i);
      char_to_room(i, dest_room);
      act("$n appears in a shimmer of divine light.", TRUE, i, 0, 0, TO_ROOM);
      look_at_room(i, 0);
    }
  }
  ```

  Note the `dest_room < 0` guard: `real_room()` returns `-1` if a vnum
  doesn't resolve to a real room at boot time. Every vnum in this
  table (511-522, 567) is confirmed to exist in `wdii/lib/world/wld/5.wld`
  already, so this guard should never actually trigger — it's there so
  a future world-data mistake fails safe (skip that character this
  pulse, try again next pulse) instead of teleporting into `NOWHERE`.

- [ ] **Step 4: Call `prep_room_check()` from `comm.c`'s `heartbeat()`**

  Run: `sed -n '992,1020p' wdii/src/comm.c`

  Expected (confirms the exact insertion point and this function's
  existing style of declaring called functions locally, e.g.
  `void auction_update();` right above its own call site):
  ```c
  void heartbeat(int pulse)
  {
    static int mins_since_crashsave = 0;
    void auction_update();
    void process_events(void);
    void process_program_output(void);

    process_program_output();
    ...
    dg_global_pulse++;

    process_events();

    if (!(pulse % PULSE_DG_SCRIPT))
      script_trigger_check();
  ```

  Edit `wdii/src/comm.c`, changing:
  ```c
  void heartbeat(int pulse)
  {
    static int mins_since_crashsave = 0;
    void auction_update();
    void process_events(void);
    void process_program_output(void);

    process_program_output();
  ```
  to:
  ```c
  void heartbeat(int pulse)
  {
    static int mins_since_crashsave = 0;
    void auction_update();
    void process_events(void);
    void process_program_output(void);
    void prep_room_check(void);

    process_program_output();

    prep_room_check();
  ```

  This calls it unconditionally every pulse (no `pulse % N` gate, unlike
  most of the other systems in this function) — 1.5-second precision
  needs 1-pulse granularity, and the function itself is cheap (a single
  pass over the character list, most of which `continue`s immediately).

- [ ] **Step 5: Compile-check**

  Run: `docker compose build`

  Expected: `Image wardome-server Built` with no errors. If you see an
  undeclared-identifier error for `RACE_VAMPIRE`/`RACE_DROW`/etc, they
  are all defined in `structs.h` (already included by `limits.c`); if
  you see one for `real_room`, `IN_ROOM`, `GET_RACE`, `char_from_room`,
  `char_to_room`, or `look_at_room`, re-check that `limits.c` still
  includes `db.h`/`utils.h`/`handler.h` (confirmed present during
  planning) — a clean build is expected on the first try.

- [ ] **Step 6: Commit**

  ```bash
  git add wdii/src/structs.h wdii/src/limits.c wdii/src/comm.c
  git commit -m "feat: auto-route characters in the preparation room to their race's temple"
  ```

---

### Task 2: Deploy and live playtest

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

  Expected: `Entering game loop.` with no new `SYSERR` lines.

- [ ] **Step 3: Playtest the routing for at least 2 different races**

  As an Implementor (or any test character), teleport into room 500
  (`goto 500`), confirm you land there, then wait roughly 2 seconds
  without typing anything and confirm you're automatically moved to
  the room matching your character's race (per the Global Constraints
  table above) — e.g. a Dwarf character ends up in room 518 ("The
  Temple of the Dwarves"), an Elf in 513, etc. Repeat with a second
  test character of a different race to confirm the table's branching
  actually varies by race and isn't hardcoded to a single destination.

- [ ] **Step 4: Playtest that leaving early cancels the timer**

  `goto 500`, then immediately (`before ~1.5s pass`) walk out of the
  room or `goto` somewhere else, then `goto 500` again. Confirm the
  timer restarts from zero each time (you get a fresh ~1.5s in the room
  before being routed, not an accumulated total across separate visits)
  — this exercises the "reset to 0 for anyone not in room 500" branch
  in `prep_room_check()`.

- [ ] **Step 5: Playtest recall and death-respawn still land in room
  500 first**

  Confirm `recall` (from any other room) puts you in room 500 briefly
  before the ~1.5s auto-route fires, and that this doesn't feel broken
  or instant — the intended experience is "arrive at the Preparation
  Room, brief pause, then routed home."
