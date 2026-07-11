# World-file (.wld) parser fix — design

## Problem (root cause, confirmed via direct reproduction, not guessed)

`extract/parsers/wld.py` is meant to parse every room in `wdii/lib/world/wld/*.wld` into `extract/out/rooms/<vnum>.json`. It currently produces only 1197 room files. Direct testing of the parser in isolation shows it's silently dropping and corrupting real rooms present in the source `.wld` files — this is a parser bug, not a genuine content gap.

**Exact bug:** the CircleMUD `.wld` format terminates string fields (name, description, exit description, exit keywords, extra-description keywords/text) with a literal `~` character. For most fields in this dataset the `~` sits on its own line (e.g., description text ends, then a lone `~` line). But short fields — most commonly an exit's keyword field (e.g. `door~`, `trapdoor~`, `grate~`) — have the `~` appended directly to the same line as the text, with no separate terminator line.

`wld.py`'s field-reading loops (`ex_kw` at `wld.py:63-67`, and the analogous pattern for `desc`, `ex_desc`, and extra-description fields) only terminate on a line that is *exactly* `~` (`lines[i].strip() != '~'`). When a field's terminator is embedded in the same line as its text (e.g. `door~`), the loop doesn't recognize that line as the end — it keeps consuming every subsequent line (the exit's numeric door-flag/key/destination line, the room's `S` terminator, and then the *entire next room's* `#<vnum>`, name, description...) as if it were still part of the keyword field, until it happens to stumble onto some later line that is coincidentally exactly `~` (typically several rooms later, wherever a description block's lone terminator happens to fall).

**Confirmed impact, quantified by direct testing:**
- In zone 186 (Newbie Zone) alone, this swallows rooms `18605`-`18608` entirely (they vanish, merged as garbage text into room `18604`'s corrupted exit-keyword fields) — this is the originally-reported gap that blocked testing the actual Pit Beast (which spawns in room `18605`).
- Project-wide: the current (buggy) parser yields **1197** rooms; a corrected version yields **1878** — **681 additional real rooms**, recovered from every zone that has any door/extra-description with an embedded-tilde keyword, not just zone 186.
- Even among the 1197 rooms the buggy parser currently DOES emit, **184 of them have subtly corrupted data** (wrong `door_flag`/`key`/`to` values, or exit-keyword/extra-description fields containing garbage merged-in text from the *next* room) — these aren't missing, but their data is wrong. Spot-checked example: room `12001`'s `D5` exit (keyword `trapdoor~`) currently reports corrupted numbers because the parser swallowed the real numeric line as part of the keyword text.
- Some vnum gaps are genuinely real, not parser bugs — e.g. `18613`-`18619` and `18648`-`18650` simply don't exist anywhere in the raw `.wld` source (confirmed via direct `grep`). The fix does not and should not invent these.

## Fix

Replace the flawed "loop until a line is exactly `~`" pattern with the correct general DikuMUD tilde-string read: read lines, and whichever line's *stripped end* ends with `~` is the LAST line of the field — strip that trailing `~` from it and stop (whether that's the very first line, as with `door~`, or a later line, as with multi-line descriptions that end `...last sentence.~` on their own line, or genuinely end with a lone `~` line, which is just the degenerate empty-content case of the same rule).

Apply this uniformly to every tilde-terminated field this parser reads: `name`, room `description`, exit `description`, exit `keywords`, and extra-description `keywords`/`description` — they all use the identical (currently broken) convention, and the room `name` field already happens to work today only because names are conventionally always single-line with an embedded tilde (it currently uses a different, simpler one-line-only implementation — `lines[i].rstrip('~')` — that isn't wrong for single-line fields, but doesn't generalize; the fix unifies all of these under one correct helper).

## Scope

This only touches `extract/parsers/wld.py` (a Python extraction tool) and its output (`extract/out/rooms/*.json`, `extract/out/catalog.json` if it's derived from room data). **Zero changes to `wdii/src`** — this is pure tooling/data-pipeline work, not gameplay code, so none of the project's "additive tags only" constraints apply.

After the fix, re-run the full extraction (`extract/run.py`) to regenerate all room JSON files — not just zone 186's — since the bug affects rooms across many zones.

## Out of scope

- The same tilde-parsing bug likely exists in this project's other parsers (`mob.py`, `obj.py`, `zon.py`, `shp.py`, `help.py`) — they were written by the same author with a similar convention and may share the identical flaw. Confirmed only for `wld.py` in this investigation; NOT fixing the others now (separate future task, needs its own investigation to confirm each parser's actual bug surface before touching it — don't assume the fix transfers verbatim).
- Any change to the MVP room/mob slate decisions already locked in project memory (rooms `3001-18603`, mobs `18601-18615`) — this fix recovers additional real rooms as a byproduct, but doesn't change what's already shipped/decided for the browser client's MVP content.
- Regenerating room-art images for any newly-recovered rooms — out of scope; a future decision if/when the MVP slate itself is revisited.

## Testing

Manual/observational, per project convention, plus this is Python tooling so a straightforward before/after comparison is natural:
- Before the fix: confirm current room count (`ls extract/out/rooms/*.json | wc -l` → 1197) and confirm rooms `18605`-`18608` are absent.
- After the fix: re-run extraction, confirm room count is `1878`, confirm `18605`-`18608` now exist with clean, correct exit data (matching the raw `.wld` source read by hand), confirm the previously-known-missing `18613`-`18619`/`18648`-`18650` are STILL absent (real gaps, not something the fix should fabricate).
- Spot-check at least one previously-"successfully-parsed-but-corrupted" room (e.g. `12001`) to confirm its exit/extra-description data is now correct instead of merged garbage.
- Confirm the existing MVP room slate's 9 rooms (`3001,3054,3059,3060,3061,18600,18601,18602,18603`) still parse identically to their current committed JSON (no regression to already-correct, already-shipped content).
