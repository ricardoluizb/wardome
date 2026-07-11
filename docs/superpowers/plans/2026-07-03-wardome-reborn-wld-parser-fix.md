# World-File Parser Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `extract/parsers/wld.py`'s broken tilde-string field parsing (it silently drops/corrupts rooms whenever a field's `~` terminator is on the same line as its text, e.g. `door~`), then regenerate all room extraction output.

**Architecture:** Replace the flawed "loop until a line is exactly `~`" pattern (used for `name`, `description`, exit `description`, exit `keywords`, and extra-description `keywords`/`description`) with a single correct helper that recognizes a line *ending* with `~` (not just a line that IS `~`) as the field's last line, stripping the trailing tilde from it. This is pure Python tooling — zero `wdii/src` changes.

**Tech Stack:** Python 3 (extraction tooling), no new dependencies.

## Global Constraints

- Only touch `extract/parsers/wld.py` and regenerated output under `extract/out/rooms/` (plus `extract/out/catalog.json`, which is derived from all extracted data and should be regenerated too so it isn't stale).
- No `wdii/src` changes — this is pure data-pipeline tooling.
- No automated test suite for this project — manual/observational, direct before/after comparison (this Python tool is trivially runnable standalone, so "run it and diff the counts/content" is the natural verification).
- Known real (non-bug) gaps that must NOT be "fixed"/invented: room vnums `18613`-`18619` and `18648`-`18650` genuinely don't exist anywhere in the raw `.wld` source — confirm they're still absent after the fix, don't fabricate them.
- The existing MVP room slate (`3001,3054,3059,3060,3061,18600,18601,18602,18603`) must parse identically to its current committed JSON after the fix — no regression to already-shipped, already-decided content.

---

### Task 1: Fix the tilde-field parser and regenerate rooms

**Files:**
- Modify: `extract/parsers/wld.py` (replace the flawed field-reading logic)
- Regenerate: `extract/out/rooms/*.json` (run `extract/run.py`)
- Regenerate: `extract/out/catalog.json` (run `extract/build_catalog.py`, which reads all of `extract/out/`)

**Interfaces:**
- Consumes: `wdii/lib/world/wld/*.wld` (unchanged, raw game source data).
- Produces: corrected `extract/out/rooms/<vnum>.json` files (up from 1197 to 1878 rooms — the exact recovered count, confirmed by direct testing during design). Nothing else in the codebase currently consumes `wld.py`'s output format at the Python level (the browser/bridge features consume the already-committed JSON files as static build-time data, via `tools/gen-room-art.js` etc. — none of those change in this task, they're just fed better source data if/when someone re-runs them in the future, which is explicitly out of scope here).

- [ ] **Step 1: Confirm the current (buggy) baseline**

Run:
```bash
cd /Users/ricardobussacro/Documents/Wardome
ls extract/out/rooms/*.json | wc -l
```
Expected: `1197`.

```bash
for v in 18605 18606 18607 18608; do [ -f "extract/out/rooms/$v.json" ] && echo "$v exists" || echo "$v MISSING"; done
```
Expected: all 4 print `MISSING`.

- [ ] **Step 2: Replace the field-reading logic in `extract/parsers/wld.py`**

Open `extract/parsers/wld.py`. Replace the entire file with:

```python
from pathlib import Path
import re


def parse_wld_dir(path: Path):
    rooms = []
    warnings = []
    if not path.exists():
        return rooms, warnings
    for file in sorted(path.glob('*.wld')):
        try:
            rooms += parse_wld_file(file)
        except Exception as e:
            warnings.append(f"{file}: {e}")
    return rooms, warnings


def read_tilde_field(lines, i):
    """Read a DikuMUD '~'-terminated string field starting at line i.

    The terminating '~' may be on its own line, or appended directly to
    the last line of content (e.g. a single-line exit keyword like
    "door~"). A line whose stripped text ENDS with '~' is always the
    field's last line, regardless of whether that leaves any text
    before the tilde on that same line.

    Returns (field_text, next_i).
    """
    parts = []
    while i < len(lines):
        line = lines[i]
        stripped = line.rstrip()
        if stripped.endswith('~'):
            parts.append(stripped[:-1])
            i += 1
            break
        parts.append(line)
        i += 1
    return '\n'.join(parts).strip(), i


def parse_wld_file(path: Path):
    rooms = []
    with path.open('r', encoding='utf-8', errors='replace') as f:
        lines = [line.rstrip('\n') for line in f]

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line == '$' or not line:
            i += 1
            continue
        if line.startswith('#') and line[1:].strip().isdigit():
            vnum = int(line[1:].strip())
            i += 1
            name, i = read_tilde_field(lines, i)
            desc, i = read_tilde_field(lines, i)
            # flags/sector line (raw)
            header = lines[i].strip()
            i += 1

            # parse exits and extras until 'S'
            exits = []
            extra_desc = []
            while i < len(lines):
                l = lines[i].strip()
                if l == 'S':
                    i += 1
                    break
                if l.startswith('D') and l[1:].isdigit():
                    dirnum = int(l[1:])
                    i += 1
                    ex_desc, i = read_tilde_field(lines, i)
                    ex_kw, i = read_tilde_field(lines, i)
                    # exit numbers line: door_flag key to_vnum
                    nums = lines[i].strip().split()
                    i += 1
                    door_flag = try_int(nums[0]) if len(nums) > 0 else None
                    key_vnum = try_int(nums[1]) if len(nums) > 1 else None
                    to_vnum = try_int(nums[2]) if len(nums) > 2 else None
                    exits.append({
                        'dir': dirnum,
                        'description': ex_desc,
                        'keywords': ex_kw,
                        'door_flag': door_flag,
                        'key': key_vnum,
                        'to': to_vnum
                    })
                elif l == 'E':
                    # extra description block
                    i += 1
                    kw, i = read_tilde_field(lines, i)
                    ex, i = read_tilde_field(lines, i)
                    extra_desc.append({'keywords': kw, 'description': ex})
                else:
                    # unknown line in room; store raw and advance
                    i += 1

            # Try to parse header: e.g., "12 d 0" or similar
            zone_id, flags, sector = parse_room_header(header)
            rooms.append({
                'id': vnum,
                'zone_id': zone_id,
                'name': name.strip(),
                'description': desc,
                'header_raw': header,
                'flags_text': flags,
                'sector': sector,
                'exits': exits,
                'extra_descriptions': extra_desc,
                'source_path': str(path)
            })
        else:
            i += 1
    return rooms


def parse_room_header(header: str):
    # Heuristic: "<zone> <flags> <sector>" where flags may be letters
    parts = header.split()
    if not parts:
        return None, None, None
    zone_id = try_int(parts[0])
    sector = None
    flags = None
    if len(parts) == 3:
        flags = parts[1]
        sector = try_int(parts[2])
    elif len(parts) == 2:
        flags = parts[1]
    return zone_id, flags, sector


def try_int(s):
    try:
        return int(s)
    except Exception:
        return None
```

- [ ] **Step 3: Run the fixed extraction**

```bash
cd /Users/ricardobussacro/Documents/Wardome
python3 extract/run.py
```
Expected: prints a JSON summary; `"rooms": 1878` in that summary output.

- [ ] **Step 4: Verify the recovered rooms**

```bash
for v in 18605 18606 18607 18608; do [ -f "extract/out/rooms/$v.json" ] && echo "$v exists" || echo "$v MISSING"; done
ls extract/out/rooms/*.json | wc -l
```
Expected: all 4 print `exists`; total count is `1878`.

```bash
python3 -c "
import json
r = json.load(open('extract/out/rooms/18605.json'))
print(r['name'])
print(r['exits'])
"
```
Expected: `The Dark Pit`, and an exits list including a `dir: 4` entry with `keywords: 'grate'` (not garbage text), `door_flag: 1`, `key: 18608`, `to: 18606`.

- [ ] **Step 5: Verify genuinely-missing vnums are still absent (not a regression, not fabricated)**

```bash
for v in 18613 18614 18615 18616 18617 18618 18619 18648 18649 18650; do [ -f "extract/out/rooms/$v.json" ] && echo "$v EXISTS (unexpected!)" || echo "$v still missing (expected)"; done
```
Expected: all print `still missing (expected)`.

- [ ] **Step 6: Verify no regression to the MVP room slate**

```bash
git diff --stat extract/out/rooms/3001.json extract/out/rooms/3054.json extract/out/rooms/3059.json extract/out/rooms/3060.json extract/out/rooms/3061.json extract/out/rooms/18600.json extract/out/rooms/18601.json extract/out/rooms/18602.json extract/out/rooms/18603.json
```
Expected: no output (these 9 files are byte-identical to their previously-committed versions — the bug never affected them, since none of their exits happen to have an embedded-tilde keyword).

- [ ] **Step 7: Spot-check a previously-corrupted-but-present room is now fixed**

```bash
python3 -c "
import json
r = json.load(open('extract/out/rooms/12001.json'))
for e in r['exits']:
    print(e)
"
```
Expected: the `dir: 5` exit shows `keywords: 'trapdoor'`, `door_flag: 1`, `key: 12033`, `to: 12002` — clean values, not merged garbage text from a subsequent room.

- [ ] **Step 8: Regenerate the catalog**

```bash
python3 extract/build_catalog.py
```
Expected: runs without error, `extract/out/catalog.json` is updated (its room count/listing now reflects 1878 rooms).

- [ ] **Step 9: Commit**

```bash
git add extract/parsers/wld.py extract/out/rooms/ extract/out/catalog.json
git commit -m "fix: correct wld.py tilde-field parsing, recovering 681 dropped/corrupted rooms

The exit-keyword field (and other short fields like room name) often
terminates with '~' embedded in the same line as the text (e.g.
\"door~\"), not on its own line. The parser's field-reading loops only
recognized a line that IS exactly '~' as the terminator, so any
embedded-tilde field caused it to swallow all subsequent lines --
including entire following rooms -- until it coincidentally hit a
real lone '~' several rooms later.

Replaced with a single read_tilde_field() helper applied uniformly to
every tilde-terminated field (name, description, exit description,
exit keywords, extra-description keywords/text): a line whose
stripped text ends with '~' is always the field's last line, tilde
stripped, regardless of whether there's text before it on that same
line.

Recovers zone 186's previously-missing rooms 18605-18608 (including
the Pit Beast's actual room, 18605), plus 677 more rooms across other
zones that hit the same bug, plus corrects 184 already-present rooms
whose exit/extra-description data was silently corrupted rather than
missing. Confirmed genuinely-absent vnums (18613-18619, 18648-18650 --
not in the raw .wld source at all) remain absent, not fabricated."
```

---

## Explicitly out of scope (do not implement)

- Fixing the same likely bug pattern in `mob.py`/`obj.py`/`zon.py`/`shp.py`/`help.py` — needs its own separate investigation per parser, not assumed to transfer verbatim.
- Regenerating room-art images (`tools/gen-room-art.js`) for any newly-recovered rooms, or changing the locked MVP room/mob slate.
- Any change to `wdii/src`.
