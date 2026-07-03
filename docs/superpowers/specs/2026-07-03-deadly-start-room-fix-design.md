# Deadly-start-room crash hardening — design

## Problem (confirmed, not fully reproduced end-to-end)

`wdii/src/config.c:202` sets `deadly_start_room = 10` — room vnum `10` does not exist anywhere in this fork's stripped-down world data (confirmed absent from `extract/out/rooms/` and the raw `.wld` source; matches the boot-time `SYSERR: Warning: Deadly start room does not exist. Change in config.c.` log line, same bug class as the earlier `board_info[]` crash).

`db.c:1068-1070` resolves this to `r_deadly_start_room = real_room(10) = NOWHERE (-1)` at boot. `interpreter.c:1650-1653` (`enter_player_game()`) uses this value unconditionally whenever a logging-in character has the `PLR_DEAD` flag set: `load_room = r_deadly_start_room; ... char_to_room(d->character, load_room);`. `char_to_room()` (`handler.c:498`) already guards `room < 0` (logs SYSERR, does not crash) — but the caller in `interpreter.c` (`CON_MENU` case `'1'`, line 2114) unconditionally calls `look_at_room(d->character, 0)` right after `enter_player_game()` returns, regardless of whether the room transition actually succeeded. `look_at_room()` (`act.informative.c:1258` on) dereferences `world[ch->in_room]` (via `IS_DARK(ch->in_room)` and others) with no guard against `ch->in_room == NOWHERE` — a negative array index, undefined behavior, plausible intermittent segfault depending on adjacent memory layout.

This was investigated as the likely (not 100%-confirmed) cause of a real crash observed in this session (a new character, "DarTh", crashed the server shortly after login). Extensive empirical reproduction (~35 new characters across all 12 races, all 12 classes, both sexes, and the literal first-player-in-a-fresh-database scenario) did not reproduce a crash, since none of those paths set `PLR_DEAD` — meaning this specific mechanism doesn't explain a brand-new character's crash on its own. It is being fixed anyway because it is a real, confirmed, low-risk defect in the same category as the already-fixed board bug, and because a player legitimately dying and reconnecting (not just fresh character creation) WILL hit this exact path in normal gameplay.

## Fix (two independent, complementary changes)

1. **Point `deadly_start_room` at a room that actually exists.** Change `wdii/src/config.c:202` from `10` to `1202` (the same room already used as `frozen_start_room`, confirmed to exist in `extract/out/rooms/1202.json`) — reusing an already-valid, already-configured "special" room rather than inventing new content, consistent with the board fix's philosophy of correcting config to match this fork's actual (deliberately partial) world data.
2. **Add a defensive guard in `look_at_room()`** (`act.informative.c`, right after the existing `if (!ch->desc) return;` guard at the top of the function): if `ch->in_room == NOWHERE`, log a `SYSERR` and return, instead of falling through to dereference `world[NOWHERE]`. This is the same defensive pattern `char_to_room()` already uses for the identical condition, applied at the next function in the same unconditional call chain — general hardening against ANY future code path that might leave a character's room invalid, not just this one.

## Scope

Both changes are in `wdii/src` (non-additive, real corrections) — same category of user-approved exception as the board-crash fix. Change 1 is a one-line config value. Change 2 is a small guard clause (4-5 lines), mirroring `char_to_room`'s existing style exactly.

## Testing

Manual/observational, per project convention:
- Before: confirm the boot warning `SYSERR: Warning: Deadly start room does not exist.` appears in `docker compose logs`.
- After fix 1: confirm that warning no longer appears on boot.
- After fix 2: cannot easily force `PLR_DEAD` on a fresh character through normal play, so this is verified by code inspection (matching `char_to_room`'s existing guard exactly) rather than a live repro — acceptable given the project's manual/observational testing convention and the low risk of a small, mirrored guard clause.
- Re-run the same race/class/sex sweep used during investigation (or a representative subset) after the fix to confirm no regression to normal character creation.
