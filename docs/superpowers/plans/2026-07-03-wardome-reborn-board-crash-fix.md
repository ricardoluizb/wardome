# Board Crash Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the game server from crashing (`exit(1)`) the first time any player interacts with a bulletin board, by trimming the hardcoded board list to only the boards that actually exist in this fork's (deliberately partial) world data.

**Architecture:** `wdii/src/boards.c`'s `board_info[]` array lists 16 boards from the original complete game; this fork's stripped-down `wdii/lib/world/obj/` only includes 3 of those 16 objects (`3096`, `3097`, `3098`, all in the included Midgaard zone). The first time any board's `gen_board` special procedure fires (only `3096` is actually wired up via `spec_assign.c`), `init_boards()` discovers the other 13 don't exist and calls `exit(1)`. Fix: trim `board_info[]` to the 3 real entries and update the matching `NUM_OF_BOARDS` constant.

**Tech Stack:** C (CircleMUD 3.0 fork), Docker (build/run), no new dependencies.

## Global Constraints

- This is the ONE user-approved exception to "only additive tags in `wdii/src`" — a real correction to pre-existing, non-additive board configuration data, not a new precedent for future work. See `docs/superpowers/specs/2026-07-03-board-crash-fix-design.md` for full root-cause investigation.
- No automated test suite for this project — manual/observational verification only; every verification step below is a manual command + expected observable output.
- `board_info[]`'s array size (`boards.c:71`, declared `[NUM_OF_BOARDS]`) and `NUM_OF_BOARDS` (`boards.h:11`) must be changed together and stay in sync — mismatching them zero-pads/truncates the array in undefined ways.
- Do not touch anything else in `boards.c`/`boards.h` (no logic changes, no unrelated cleanup) — this is a data-only fix.

---

### Task 1: Trim `board_info[]` to the 3 real boards

**Files:**
- Modify: `wdii/src/boards.h:11` (the `NUM_OF_BOARDS` constant)
- Modify: `wdii/src/boards.c:71-89` (the `board_info[]` array initializer)

**Interfaces:**
- Consumes: nothing from other tasks (this is a single-task plan).
- Produces: a rebuilt Docker image (`wardome-server`) that no longer crashes when any board is used. Nothing else in the codebase depends on the exact board list.

- [ ] **Step 1: Reproduce the crash first (confirm the bug before fixing it)**

Run (from repo root):
```bash
docker compose up -d --build
```

Connect via telnet, log in a short alphabetic test character (or create one — avoid digits and the substring "war"), and walk to room `3003` (has a Social Bulletin Board) from the starting Temple room `3001`: `south`, `west`, `north`. Then interact with the board:
```
look board
```
Expected (the bug, before the fix): the game may or may not print visible output before the crash, but check:
```bash
docker compose ps
```
Expected: `wardome-server` shows `Exited (1)` (not `Up`). Then:
```bash
docker compose logs game 2>&1 | grep "Fatal board error"
```
Expected: a cascade of 13 lines like `SYSERR: Fatal board error: board vnum 500 does not exist!` (one per missing vnum: `500,509,512,98,97,3097... ` — wait, do NOT expect `3097` or `3098` in this list, only the 13 truly-missing ones: `500,509,512,98,97,3077,31001,30100,1300,9403,507,30401,1901`).

- [ ] **Step 2: Update `NUM_OF_BOARDS` in `wdii/src/boards.h`**

Find:
```c
#define NUM_OF_BOARDS           16       /* change if needed! */
```

Change to:
```c
#define NUM_OF_BOARDS           3        /* trimmed to the boards that actually exist in this fork's world data (3096, 3097, 3098) — see docs/superpowers/specs/2026-07-03-board-crash-fix-design.md */
```

- [ ] **Step 3: Trim `board_info[]` in `wdii/src/boards.c`**

Find the full array (`boards.c:71-89`):

```c
struct board_info_type board_info[NUM_OF_BOARDS] = {
  {500, 0, 2, LVL_GOD, LIB_ETC"board.mort", 0},
  {509, 0, 2, LVL_GOD, LIB_ETC"board.path", 0},
  {512, 0, 2, LVL_GOD, LIB_ETC"board.quest", 0},
  {3098, LVL_IMMORT, LVL_IMMORT, LVL_GRGOD, LIB_ETC"board.immort", 0},
  {98, LVL_IMMORT, LVL_IMMORT, LVL_GRGOD, LIB_ETC"board.builder", 0},
  {97, 0, 2, LVL_IMMORT, LIB_ETC"board.coder", 0},
  {3097, 0, 0, LVL_GOD, LIB_ETC"board.freeze", 0}, /*purple dragons clan*/
  {3096, 0, 0, LVL_IMMORT, LIB_ETC"board.social", 0},
  {3077, 0, 0, LVL_GOD, LIB_ETC"board.bugs", 0},
  {31001, 0, 0, LVL_GOD, LIB_ETC"board.titans", 0},
  {30100, 0, 0, LVL_GOD, LIB_ETC"board.ultimates", 0},
  {1300, 0, LVL_GOD, LVL_GOD, LIB_ETC"board.questbook", 0},
 /* {3099, 0, 0, LVL_GOD, LIB_ETC"board.mort", 0},*/
  {9403, 0,0, LVL_GOD, LIB_ETC"board.helms", 0},
  {507, 0, 0, LVL_GOD, LIB_ETC"board.idea", 0},
  {30401, 0, 0, LVL_GOD, LIB_ETC"board.sith", 0}, /*sith clan*/
  {1901, 0, 0, LVL_GOD, LIB_ETC"board.hells", 0}, //hells angels clan
};
```

Replace with (keep only the 3 entries whose vnum is a real object in `wdii/lib/world/obj/30.obj` — `3096`, `3097`, `3098` — with their original per-board level/filename fields unchanged):

```c
struct board_info_type board_info[NUM_OF_BOARDS] = {
  {3098, LVL_IMMORT, LVL_IMMORT, LVL_GRGOD, LIB_ETC"board.immort", 0},
  {3097, 0, 0, LVL_GOD, LIB_ETC"board.freeze", 0}, /*purple dragons clan*/
  {3096, 0, 0, LVL_IMMORT, LIB_ETC"board.social", 0},
};
```

- [ ] **Step 4: Rebuild and verify the fix**

```bash
docker compose up -d --build
```

Repeat Step 1's live test: log in, walk to room `3003` (`south`, `west`, `north` from `3001`), `look board`.

Expected: `docker compose ps` shows `wardome-server` still `Up` (not `Exited`). `docker compose logs game 2>&1 | grep "Fatal board error"` shows NO output (no fatal errors at all — all 3 remaining boards are real objects). The `look board` command completes normally (shows the board's contents/description, or the standard "nothing special" response — either is fine, the point is the server didn't crash).

- [ ] **Step 5: Commit**

```bash
git add wdii/src/boards.h wdii/src/boards.c
git commit -m "fix: trim board_info[] to the 3 boards that exist in this fork's world data

The original board_info[] listed 16 boards from the complete original
game; this fork's stripped-down wdii/lib/world/obj/ only includes 3 of
those objects (3096, 3097, 3098, all in the included Midgaard zone).
init_boards() called exit(1) the first time any board was used (only
3096 is actually wired up via spec_assign.c), since it always checked
all 16 hardcoded vnums and 13 don't exist. Trimmed board_info[] and
NUM_OF_BOARDS to match reality — no gameplay logic changed, just
correcting stale configuration data to this fork's actual content."
```

---

## Explicitly out of scope (do not implement)

- Re-adding the missing 13 board objects/zones to the world data (would require inventing content this fork never extracted — contradicts the project's "real extracted data only" rule).
- Re-enabling any of the other commented-out `ASSIGNOBJ(..., gen_board)` lines in `spec_assign.c` — those boards' objects don't exist, enabling them would just move the crash elsewhere.
- Any change to board read/write/remove behavior, `Board_load_board`, `Board_save_board`, or any other function in `boards.c` beyond the `board_info[]` data itself.
