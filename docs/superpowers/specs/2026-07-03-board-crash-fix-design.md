# Board crash fix — design

## Problem (root cause, confirmed via source + world-data inspection)

`wdii/src/boards.c:132` (`init_boards()`) iterates the hardcoded `board_info[]` array (16 entries, `boards.c:71-89`) and calls `real_object(BOARD_VNUM(i))` for each. If any vnum isn't found, it logs `SYSERR: Fatal board error: board vnum %d does not exist!` and, after the loop, calls `exit(1)` (`boards.c:161-162`) — killing the entire server process for every connected player.

This fork's `wdii/lib/world/obj/` only ships a stripped-down subset of the original game's zones. Checked all 16 hardcoded vnums against the actual `.obj` files: **13 of 16 don't exist** (`500,509,512,98,97,3077,31001,30100,1300,9403,507,30401,1901`). Only 3 exist, all in the included Midgaard zone (`30.obj`): `3096`, `3097`, `3098`.

`init_boards()` is lazily triggered the first time any board's `SPECIAL(gen_board)` procedure fires. Checked `wdii/src/spec_assign.c:363-384`: only **one** `ASSIGNOBJ(3096, gen_board)` is active (the "social board") — all 15 others are commented out. So the crash is deterministic and inevitable: the first time any player interacts with the one active board (3096), `init_boards()` runs, finds 13 phantom vnums, and calls `exit(1)`.

## Chosen fix (user-approved)

Trim `board_info[]` to only the 3 boards whose objects actually exist in this fork's world data (`3096`, `3097`, `3098`), and update `NUM_OF_BOARDS` in `wdii/src/boards.h` from 16 to 3 to match (the array is declared `board_info[NUM_OF_BOARDS]`; leaving `NUM_OF_BOARDS` at 16 while trimming the initializer list would zero-pad the remaining 13 slots to vnum `0`, and `real_object(0)` also fails since no object vnum `0`... actually confirmed `0.obj` file exists so this specific edge case doesn't apply, but zero-padding to unintended vnum 0 is still wrong/undefined behavior we must avoid by keeping the array size and initializer count in sync).

This is a minimal, surgical fix: no gameplay logic changes, no new features, just correcting a data/config array to match this fork's actual (deliberately partial) world content — consistent with the project's existing pattern of the MVP room slate being a real subset of the original game, not an oversight to "complete."

## Scope note (breaks precedent, explicitly user-approved)

Every previous change to `wdii/src` in this project was a strictly additive tag block, never touching existing logic or data. This is the first exception: a real correction to pre-existing, non-additive C data (the `board_info[]` array + `NUM_OF_BOARDS` constant) to fix a genuine crash bug. Explicitly approved by the user for this specific case — does not reopen the "additive tags only" rule for anything else.

## Testing

Manual/observational only, per project convention. Before the fix: reproduce the crash (log in, walk to wherever board 3096 lives, interact with it — `look board` or similar — confirm `docker compose ps` shows `Exited (1)` and `docker compose logs` shows the `SYSERR: Fatal board error` cascade). After the fix: rebuild, repeat the same interaction, confirm the server does NOT exit — container stays `Up`, and the board interaction completes normally (shows board contents or the appropriate "nothing here" response).
