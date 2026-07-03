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

