#!/usr/bin/env python3
# tools/rebalance-weak-items.py
# Applies the same mob_fix.c-anchored calibration used by
# gen-missing-items.py to EXISTING items flagged weak by
# tools/scan-weak-items.py. Rewrites only the numeric stat lines (weapon
# dice + DAMROLL affect, or armor value0 AC) in place -- names,
# keywords, descriptions, and any pre-existing affects other than the
# ones being adjusted are left untouched.
#
# Usage: python3 tools/rebalance-weak-items.py [--dry-run] [--threshold 0.5]

import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBJ_DIR = os.path.join(ROOT, 'wdii', 'lib', 'world', 'obj')
ZON_DIR = os.path.join(ROOT, 'wdii', 'lib', 'world', 'zon')
AREAS_PATH = os.path.join(ROOT, 'web', 'assets', 'data', 'areas.json')
MOBFIX_TABLE_PATH = os.path.join(ROOT, 'tools', 'mobfix-table.json')

with open(MOBFIX_TABLE_PATH) as f:
    MOBFIX_TABLE = json.load(f)
with open(AREAS_PATH) as f:
    AREAS = {a['vnum']: a for a in json.load(f)}


def mob_dam_avg(level):
    level = max(0, min(210, round(level)))
    row = MOBFIX_TABLE[level]
    ndice, sdice, extra = row[5], row[6], row[7]
    return ndice * (sdice + 1) / 2.0 + extra


def level_midpoint(level_str):
    nums = re.findall(r'\d+', str(level_str))
    if not nums:
        return 100.0
    return sum(int(n) for n in nums) / len(nums)


def effective_level(zone_vnum):
    area = AREAS.get(zone_vnum)
    if not area:
        return None
    mid = level_midpoint(area['level'])
    return max(0.0, min(210.0, mid + area.get('remort', 0) * 8))


def rarity_factor(pct):
    pct = max(0, min(100, pct))
    return 1.3 - (pct / 100.0) * 0.6


ITEM_LINE_RE = re.compile(r'^([EGOP])\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s*\t?\(')

_pct_cache = None


def build_pct_index():
    """vnum -> minimum pct found across every zone reset's E/G/O/P references"""
    global _pct_cache
    if _pct_cache is not None:
        return _pct_cache
    idx = {}
    for fn in glob.glob(os.path.join(ZON_DIR, '*.zon')):
        with open(fn, 'rb') as f:
            c = f.read().decode('latin-1')
        for line in c.splitlines():
            m = ITEM_LINE_RE.match(line)
            if not m:
                continue
            _, vnum, third, _fourth = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            if vnum not in idx or third < idx[vnum]:
                idx[vnum] = third
    _pct_cache = idx
    return idx


def read_index():
    with open(os.path.join(OBJ_DIR, 'index')) as f:
        return [l.strip() for l in f if l.strip() and not l.strip().startswith('$')]


def find_numline_idx(lines):
    tcount = 0
    for i, l in enumerate(lines):
        if l.endswith('~'):
            tcount += 1
            if tcount == 4:
                return i + 1
    return None


def find_affect(lines, loc):
    for i, l in enumerate(lines):
        if l == 'A' and i + 1 < len(lines):
            p = lines[i + 1].split()
            if len(p) == 2 and int(p[0]) == loc:
                return i + 1, int(p[1])
    return None, None


def rebalance_weapon_block(lines, eff, pct):
    numline_idx = find_numline_idx(lines)
    numline = lines[numline_idx].split()
    valline = lines[numline_idx + 1].split()
    ndice, sdice = int(valline[1]), int(valline[2])
    msg = valline[3] if len(valline) > 3 else '11'
    old_avg = ndice * (sdice + 1) / 2.0
    old_damroll_idx, old_damroll = find_affect(lines, 19)
    old_total = old_avg + (old_damroll or 0) * 0.8

    factor = rarity_factor(pct)
    mob_dam = mob_dam_avg(eff)
    target_total = mob_dam * max(0.35, min(0.9, 0.35 + factor * 0.35))

    if target_total <= old_total:
        return lines, False  # already fine, don't touch

    dice_avg = target_total * 0.87
    new_damroll = max(0, round((target_total * 0.13) / 0.8))
    new_ndice = max(1, round(dice_avg / 5.5))
    new_sdice = 10

    lines[numline_idx + 1] = f'0 {new_ndice} {new_sdice} {msg}'
    if old_damroll_idx is not None:
        lines[old_damroll_idx] = f'19 {new_damroll}'
    elif new_damroll > 0:
        # if this object is the LAST one in its file, its block's lines
        # end with the bare file-terminator '$' line (parse_object() in
        # db.c treats '$' as "no more fields for this object" AND, via
        # the caller's top-level loop, "no more objects in this file" --
        # appending after it would silently truncate every object that
        # should follow). insert the new affect just before it instead.
        if lines and lines[-1].strip() == '$':
            lines = lines[:-1] + ['A', f'19 {new_damroll}', lines[-1]]
        else:
            lines.append('A')
            lines.append(f'19 {new_damroll}')
    return lines, True


def rebalance_armor_block(lines, eff, pct):
    numline_idx = find_numline_idx(lines)
    valline = lines[numline_idx + 1].split()
    old_value0 = int(valline[0])
    _, ac17 = find_affect(lines, 17)
    old_effective = old_value0 + (-ac17 if ac17 and ac17 < 0 else 0)

    factor = rarity_factor(pct)
    target_floor = max(1, (1 + eff / 15 * 0.5) * 0.35 / 0.7)
    # scale similarly to gen-missing-items.py's armor formula, using the
    # item's own rarity-implied factor instead of the flat common-tier floor
    target_ac = max(1, min(40, round(1 + eff / 15 * (0.5 + factor * 0.5))))

    if target_ac <= old_effective:
        return lines, False

    new_value0 = old_value0 + (target_ac - old_effective)
    rest = ' '.join(valline[1:]) if len(valline) > 1 else '0 0 0'
    lines[numline_idx + 1] = f'{new_value0} {rest}'
    return lines, True


def process_file(fname, weak_vnums, dry_run):
    path = os.path.join(OBJ_DIR, fname)
    with open(path, 'rb') as f:
        content = f.read().decode('latin-1')

    blocks = re.split(r'\n(?=#\d+\n)', content)
    changed_count = 0
    pct_index = build_pct_index()

    new_blocks = []
    for b in blocks:
        stripped = b.rstrip('\n')
        m = re.match(r'^#(\d+)\n', stripped)
        if not m:
            new_blocks.append(b)
            continue
        vnum = int(m.group(1))
        if vnum not in weak_vnums:
            new_blocks.append(b)
            continue

        lines = stripped.split('\n')
        numline_idx = find_numline_idx(lines)
        if numline_idx is None or numline_idx >= len(lines):
            new_blocks.append(b)
            continue
        type_flag = lines[numline_idx].split()[0] if lines[numline_idx].split() else ''
        zone_vnum = vnum // 100
        eff = effective_level(zone_vnum)
        if eff is None:
            new_blocks.append(b)
            continue
        pct = pct_index.get(vnum, 100)

        if type_flag == '5':
            lines, changed = rebalance_weapon_block(lines, eff, pct)
        elif type_flag == '9':
            lines, changed = rebalance_armor_block(lines, eff, pct)
        else:
            changed = False

        if changed:
            changed_count += 1
        new_blocks.append('\n'.join(lines))

    if changed_count and not dry_run:
        new_content = '\n'.join(new_blocks)
        if not new_content.endswith('\n'):
            new_content += '\n'
        with open(path, 'w', encoding='latin-1') as f:
            f.write(new_content)

    return changed_count


def collect_weak_vnums(threshold):
    """Re-derive the weak-item vnum set using the same logic as scan-weak-items.py"""
    weak = {}  # fname -> set(vnums)
    for fn in read_index():
        path = os.path.join(OBJ_DIR, fn)
        with open(path, 'rb') as f:
            c = f.read().decode('latin-1')
        blocks = re.split(r'\n(?=#\d+\n)', c)
        for b in blocks:
            lines = b.strip('\n').split('\n')
            if not lines or not lines[0].startswith('#'):
                continue
            try:
                vnum = int(lines[0][1:])
            except ValueError:
                continue
            numline_idx = find_numline_idx(lines)
            if numline_idx is None or numline_idx >= len(lines):
                continue
            numline = lines[numline_idx].split()
            if not numline:
                continue
            type_flag = numline[0]
            zone_vnum = vnum // 100
            eff = effective_level(zone_vnum)
            if eff is None:
                continue

            if type_flag == '5':
                if numline_idx + 1 >= len(lines):
                    continue
                valline = lines[numline_idx + 1].split()
                if len(valline) < 3:
                    continue
                try:
                    ndice, sdice = int(valline[1]), int(valline[2])
                except ValueError:
                    continue
                avg = ndice * (sdice + 1) / 2.0
                _, damroll = find_affect(lines, 19)
                total = avg + (damroll or 0) * 0.8
                expected_floor = mob_dam_avg(eff) * 0.35
                if total < expected_floor * threshold and expected_floor > 3:
                    weak.setdefault(fn, set()).add(vnum)

            elif type_flag == '9':
                if numline_idx + 1 >= len(lines):
                    continue
                valline = lines[numline_idx + 1].split()
                if not valline:
                    continue
                try:
                    value0 = int(valline[0])
                except ValueError:
                    continue
                _, ac17 = find_affect(lines, 17)
                effective_ac = value0 + (-ac17 if ac17 and ac17 < 0 else 0)
                expected_floor = max(1, (1 + eff / 15 * 0.5) * 0.35 / 0.7)
                if effective_ac < expected_floor * threshold and expected_floor > 1.5:
                    weak.setdefault(fn, set()).add(vnum)
    return weak


def main():
    dry_run = '--dry-run' in sys.argv
    threshold = 0.5
    if '--threshold' in sys.argv:
        threshold = float(sys.argv[sys.argv.index('--threshold') + 1])

    weak_by_file = collect_weak_vnums(threshold)
    total_changed = 0
    for fname, vnums in sorted(weak_by_file.items()):
        changed = process_file(fname, vnums, dry_run)
        if changed:
            print(f"{fname}: rebalanced {changed}/{len(vnums)} flagged items")
            total_changed += changed

    print(f"\n{'DRY RUN: ' if dry_run else ''}Total rebalanced: {total_changed}")


if __name__ == '__main__':
    main()
