# Race Temple Routing — Design

**Goal:** anyone who lands in room 500 ("The Wardome Preparation Room" —
already the destination for recall, new-character spawn, and death
respawn, fixed earlier this session) is automatically forwarded to their
own race's temple room 1.5 seconds later, for every level, every time.

## Discovery: the destination rooms already exist

Zone 5 ("Wardome - The WarDome City") already has a full "Temple Street"
(rooms 504-510) leading to 12 individual race temple rooms (511-522),
matching this game's 12 base playable races exactly 1:1. No new rooms
need to be built — this is pure routing logic connecting existing world
data that was never wired together. Room 500 itself has zero exits
today; nothing currently leads a player out of it.

**Race → temple room mapping** (`GET_RACE(ch)` value → room vnum, cross-
checked against `pc_race_types[]` in `race.c`, which is index-aligned
with the `RACE_*` constants in `structs.h` — note `RACE_VAMPIRE` (value
`0`) is what this fork actually displays and treats as "Human", a
legacy naming mismatch from the original constant, not a bug to fix
here):

| Race (display name) | `RACE_*` constant | value | Temple room vnum |
|---|---|---|---|
| Human | `RACE_VAMPIRE` | 0 | 516 |
| Drow | `RACE_DROW` | 1 | 517 |
| Dwarf | `RACE_DWARF` | 2 | 518 |
| Elf | `RACE_ELF` | 3 | 513 |
| Ogre | `RACE_OGRE` | 4 | 520 |
| Orc | `RACE_ORC` | 5 | 514 |
| Troll | `RACE_TROLL` | 6 | 515 |
| Gith | `RACE_GITH` | 7 | 521 |
| Gnome | `RACE_GNOME` | 8 | 522 |
| Lizardman | `RACE_LIZARDMAN` | 9 | 519 |
| Sea Elf | `RACE_SEA_ELF` | 10 | 512 |
| Gorak | `RACE_GORAK` | 11 | 511 |

All other races (the "remort races" — Dunedain, Ancient Drow, Naugrim,
High Elf, Hill Ogre, BugBear, Cave Troll, Lich, Tinker, Draconian, High
Sea Elf, Archons — only reachable via remort, never at fresh character
creation) fall back to room 567, "The Temple of the Advanced Races",
which already exists in the same zone for exactly this purpose.

## Mechanism

This needs a small, targeted C addition — there's no existing "delayed
per-character action after N seconds" primitive in this codebase that's
safe to use with a raw character pointer (the one generic event system,
`dg_event.c`'s `add_event()`, was built for DG script `wait` mid-script
continuations and isn't the right tool here — see Rejected Approaches
below).

**Mechanism: a per-character runtime counter, checked once per game
pulse (10 pulses/second, confirmed via `PASSES_PER_SEC` in
`structs.h`).**

1. Add one new runtime-only field to `struct char_data`
   (`wdii/src/structs.h`): `int prep_room_timer;` — placed in the
   struct's non-persisted region (alongside `next_in_room`/`next`/
   `next_fighting`, which are also runtime-only linked-list pointers,
   not part of the on-disk save format), so this requires no save-file
   format changes and carries none of that risk class.
2. Add a new function (e.g. in `limits.c`, alongside other periodic
   per-character checks) that iterates the existing global
   `character_list` linked list once per call: for every non-NPC
   character whose current room is room 500 (via `real_room(500)`,
   matching the existing `real_room()` pattern already used for
   `mortal_start_room`), increment `prep_room_timer`; once it reaches
   15 (15 pulses ÷ 10 pulses/sec = 1.5 seconds), teleport them to their
   race's temple room and reset the counter to 0. For any character NOT
   in room 500, reset their counter to 0 (handles walking in and back
   out before the threshold, or being teleported elsewhere by something
   else in the meantime).
3. Call this new function from `comm.c`'s `heartbeat()`, the same place
   every other periodic per-pulse system hooks in (`mobile_activity()`,
   `perform_violence()`, `zone_update()`, etc.) — every pulse, not
   gated behind a modulo like the slower systems, since 1.5s precision
   needs 1-pulse granularity.

**Why this is safe against dangling pointers:** the function only ever
touches characters found by walking the live `character_list` at the
exact moment it runs. If a character quit, disconnected, or died since
the last pulse, they're simply no longer in that list — there's no
stored pointer anywhere that could go stale, unlike a raw-pointer-based
delayed event would risk.

**Teleport action:** `char_from_room()` / `char_to_room()` to the
mapped temple vnum, a short flavor message (e.g. "You feel a divine pull
guiding you home..."), then `look_at_room()` — matching the exact
pattern `do_recall()` itself already uses for its own transition.

## Rejected approach: `dg_event.c`'s `add_event()`

Considered scheduling a one-shot delayed callback via the existing
generic event queue (`add_event(15, callback, ch)`) at the moment a
character's room becomes 500. Rejected because `info` is a raw
`void *` — if the character disconnects, quits, or is extracted between
scheduling and firing, the stored pointer becomes dangling and the
callback would crash on a stale character. This event system was built
for DG script `wait` mid-script continuations, which have their own
separate lifecycle guarantees this feature doesn't get for free. The
per-pulse-scan approach above achieves the same 1.5s timing without that
risk.

## Deployment

Two small C changes: one new struct field (`structs.h`), and one new
periodic-check function plus its `heartbeat()` call site (likely
`limits.c` + `comm.c`). No world-data changes at all — every destination
room already exists. Requires a container rebuild to compile, which
wipes ephemeral pfiles like any other deploy this session.
