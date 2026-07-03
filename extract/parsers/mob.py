from pathlib import Path


def parse_mob_dir(path: Path):
    mobs = []
    warnings = []
    if not path.exists():
        return mobs, warnings
    for file in sorted(path.glob('*.mob')):
        try:
            mobs += parse_mob_file(file)
        except Exception as e:
            warnings.append(f"{file}: {e}")
    return mobs, warnings


def read_tilde_field(lines, i):
    """Read a DikuMUD '~'-terminated string field starting at line i.

    The terminating '~' may be on its own line, or appended directly to
    the last line of content. A line whose stripped text ENDS with '~'
    is always the field's last line, regardless of whether that leaves
    any text before the tilde on that same line.

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


def parse_mob_file(path: Path):
    out = []
    with path.open('r', encoding='utf-8', errors='replace') as f:
        lines = [line.rstrip('\n') for line in f]
    i = 0
    while i < len(lines):
        l = lines[i].strip()
        if not l:
            i += 1; continue
        if l == '$':
            break
        if l.startswith('#') and l[1:].strip().isdigit():
            vnum = int(l[1:].strip())
            i += 1
            alias, i = read_tilde_field(lines, i)
            short, i = read_tilde_field(lines, i)
            longd, i = read_tilde_field(lines, i)
            desc, i = read_tilde_field(lines, i)
            flags_line = lines[i].strip(); i += 1
            nums1 = lines[i].strip(); i += 1
            nums2 = lines[i].strip(); i += 1
            nums3 = lines[i].strip(); i += 1
            out.append({
                'id': vnum,
                'alias': alias,
                'short_desc': short,
                'long_desc': longd,
                'detailed_desc': desc,
                'flags_raw': flags_line,
                'stats1_raw': nums1,
                'stats2_raw': nums2,
                'stats3_raw': nums3,
                'source_path': str(path)
            })
        else:
            i += 1
    return out
