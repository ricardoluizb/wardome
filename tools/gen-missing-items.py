#!/usr/bin/env python3
# tools/gen-missing-items.py
#
# Fills every ghost-item gap left across the whole world: for each zone
# reset (.zon) that references an object vnum with no .obj block anywhere
# in the game, generate one, calibrated to that vnum's OWNING zone's
# level/remort tier (web/assets/data/areas.json) using the real in-game
# damage formula confirmed in fight.c's damage():
#     dam = dice(ndice, sdice) + GET_DAMROLL(ch) * 0.8
# (STR contributes nothing to combat damage in this fork -- the str_app
# to-hit/todam bonus is dead/commented-out code in fight.c.)
#
# Per-item power scales with the zone's own equip-percent field (lower
# %-chance-to-carry reads as rarer/more significant gear, e.g. a boss's
# unique weapon at 5% vs a common guard's sword at 100%), not by guessing
# from item names.
#
# Item power (weapon damage especially) is anchored to the game's own
# canonical per-level mob difficulty curve (tools/mobfix-table.json, the
# complete 0-210 table from wardome-master/wdii/lib/world-old/mob/mob_fix.c
# -- NOT the truncated 0-65 copy shipped in this repo's own src/util/,
# see memory note "mob_fix.c gotcha"). That table's own dam_avg(level)
# grows cleanly linearly (~level+1.5) across the whole 0-210 range, so
# using it as the basis avoids the runaway/absurd numbers a naive
# level*remort linear formula produced on a first attempt (e.g. AC 35,
# 35d10 weapons for a level 180-200 remort-2 zone).
#
# Usage: node/python3 tools/gen-missing-items.py [--zone VNUM ...] [--dry-run]

import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZON_DIR = os.path.join(ROOT, 'wdii', 'lib', 'world', 'zon')
OBJ_DIR = os.path.join(ROOT, 'wdii', 'lib', 'world', 'obj')
AREAS_PATH = os.path.join(ROOT, 'web', 'assets', 'data', 'areas.json')
MOBFIX_TABLE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mobfix-table.json')

with open(MOBFIX_TABLE_PATH) as _f:
    MOBFIX_TABLE = json.load(_f)  # index = level, row = [lev,hp,exp,thaco,ac,ndice,sdice,dam_extra,gold,at2,at3,at4,hit]


def mob_dam_avg(level):
    level = max(0, min(210, round(level)))
    row = MOBFIX_TABLE[level]
    ndice, sdice, extra = row[5], row[6], row[7]
    return ndice * (sdice + 1) / 2.0 + extra

# WEAR_x reset position -> ITEM_WEAR_x bit (structs.h)
POS_TO_BIT = {
    1: 1, 2: 1,          # FINGER_R/L -> FINGER
    3: 2, 4: 2,          # NECK_1/2 -> NECK
    5: 3,                # BODY
    6: 4,                # HEAD
    7: 5,                # LEGS
    8: 6,                # FEET
    9: 7,                # HANDS
    10: 8,               # ARMS
    11: 9,               # SHIELD
    12: 10,              # ABOUT
    13: 11,              # WAIST
    14: 12, 15: 12,      # WRIST_R/L -> WRIST
    16: 13, 18: 13,      # WIELD, DWIELD -> WIELD bit
    17: 14,              # HOLD
    19: 15, 20: 15,      # EAR_R/L -> EAR
    21: 16,              # FACE
    22: 17,              # FLOAT
}
TAKE_BIT = 0

# rough attribute rotation by wear position, for trinket-style items
POS_ATTR = {
    1: 2, 2: 2,          # rings -> DEX
    3: 6, 4: 6,          # necklaces -> CHA
    6: 3,                # head -> WIS  (APPLY_WIS=4 actually; fixed below)
    9: 1,                # hands -> STR
    12: 5,               # cloak -> CON
    13: 5,               # waist -> CON
    14: 2, 15: 2,        # wrist -> DEX
}
# APPLY_x location codes (structs.h): STR=1 DEX=2 INT=3 WIS=4 CON=5 CHA=6
POS_ATTR = {
    1: 2, 2: 2,      # finger -> DEX
    3: 6, 4: 6,      # neck -> CHA
    6: 4,            # head -> WIS
    9: 1,            # hands -> STR
    12: 5,           # about/cloak -> CON
    13: 5,           # waist -> CON
    14: 2, 15: 2,    # wrist -> DEX
}

ATTACK_WORDS = [
    (r'\b(club|mace|maul|hammer|morningstar|staff|cudgel|buckler)\b', 5),   # bludgeon
    (r'\b(axe|glaive|halberd|scythe)\b', 8),                               # claw (visual only)
    (r'\b(spear|crossbow|bow|dagger|dirk)\b', 11),                         # pierce
    (r'\b(sword|blade|saber|rapier)\b', 3),                                # slash
]

KEY_WORDS = r'\bkey\b'
POTION_WORDS = r'\bpotion\b'
SCROLL_WORDS = r'\bscroll\b'
CONTAINER_WORDS = r'\b(bag|sack|pouch|chest|pack|vial|jar|box|basket|footlocker)\b'
FOOD_WORDS = r'\b(bread|lobster|caviar|rabbit|biscuit|meat|fish|fruit|apple|cake|pie)\b'
DRINK_WORDS = r'\b(skin|barrel|flask of water|wine|ale)\b'
LIGHT_WORDS = r'\b(torch|lantern|lamp|candle)\b'


def load_areas():
    with open(AREAS_PATH, 'r', encoding='utf-8') as f:
        areas = json.load(f)
    by_vnum = {a['vnum']: a for a in areas}
    return by_vnum


def level_midpoint(level_str):
    level_str = str(level_str)
    nums = re.findall(r'\d+', level_str)
    if not nums:
        return 100.0
    nums = [int(n) for n in nums]
    return sum(nums) / len(nums)


def effective_level(area):
    if not area:
        return 60.0
    mid = level_midpoint(area['level'])
    # remort zones hit far above their raw level tag -- a small nudge,
    # clamped to the table's own 0-210 range so it never overshoots into
    # runaway numbers the way level+remort*15 did on the first attempt.
    return max(0.0, min(210.0, mid + area.get('remort', 0) * 8))


def read_index(dirpath):
    with open(os.path.join(dirpath, 'index')) as f:
        return [l.strip() for l in f if l.strip() and not l.strip().startswith('$')]


def existing_obj_vnums():
    files = read_index(OBJ_DIR)
    vnums = set()
    for fn in files:
        path = os.path.join(OBJ_DIR, fn)
        with open(path, 'rb') as f:
            c = f.read().decode('latin-1')
        for m in re.finditer(r'^#(\d+)$', c, re.M):
            vnums.add(int(m.group(1)))
    return vnums, files


ITEM_LINE_RE = re.compile(r'^([EGOP])\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s*\t?\((.*)\)\s*$')


def parse_zone_items(zone_id):
    path = os.path.join(ZON_DIR, f'{zone_id}.zon')
    if not os.path.exists(path):
        return {}
    with open(path, 'rb') as f:
        c = f.read().decode('latin-1')
    items = {}
    for line in c.splitlines():
        m = ITEM_LINE_RE.match(line)
        if not m:
            continue
        cmd, mode, vnum, third, fourth, name = m.groups()
        vnum = int(vnum)
        name = name.strip()
        pct = int(third)
        if cmd == 'E':
            pos = int(fourth)
            if pos not in POS_TO_BIT and pos != 0:
                pos = None
            items[vnum] = {'pos': pos, 'name': name, 'pct': pct}
        else:
            items.setdefault(vnum, {'pos': None, 'name': name, 'pct': pct})
    return items


def rarity_factor(pct):
    pct = max(0, min(100, pct))
    return 1.3 - (pct / 100.0) * 0.6  # 100% -> 0.7 (common), 0% -> 1.3 (rare/boss)


# Name-based wear-position fallback for items referenced only via G/O/P
# (given/carried, e.g. shop stock) which have no explicit reset-time
# equip position -- without this, obvious gear like "a suit of
# brigandine" or "a bill-guisarme" would wrongly fall through to the
# generic no-stat 'treasure' bucket.
NAME_POS_RULES = [
    (r'\b(shield|buckler)\b', 11),
    (r'\b(sword|blade|saber|rapier|scimitar|dagger|dirk|axe|mace|club|'
     r'hammer|spear|bow|staff|whip|flail|glaive|halberd|guisarme|pike|'
     r'bardiche|fauchard|bill[- ]?guisarme|sickle|claw|cleaver|crossbow|'
     r'morningstar|maul|trident)\b', 16),
    (r'\b(helm|helmet|cap|hood|crown|circlet|coif|visor)\b', 6),
    (r'\b(greaves|leggings|hose|leg)\b', 7),
    (r'\b(boots|shoes|sandals)\b', 8),
    (r'\b(gloves|gauntlets)\b', 9),
    (r'\b(sleeves|vambraces|bracer)\b', 10),
    (r'\b(cloak|cape)\b', 12),
    (r'\b(belt|girdle|sash)\b', 13),
    (r'\b(bracelet)\b', 14),
    (r'\b(ring)\b', 1),
    (r'\b(necklace|amulet|pendant|holy symbol)\b', 3),
    (r'\b(earring|earlobe)\b', 19),
    (r'\b(mask|veil)\b', 21),
    (r'\b(orb|sphere)\b', 22),
    (r'\b(plate|mail|armor|breastplate|hauberk|brigandine|cuirass|robe|'
     r'jacket|tunic|garde|chainmail)\b', 5),
]


def infer_pos_from_name(name):
    lname = name.lower()
    for pattern, pos in NAME_POS_RULES:
        if re.search(pattern, lname):
            return pos
    return None


def classify_type(name, pos):
    if pos is None:
        pos = infer_pos_from_name(name)
    lname = name.lower()
    if pos is not None:
        if pos in (16, 18):
            return 'weapon'
        if pos == 0:
            return 'light'
        if pos == 11:
            return 'shield'
        if pos == 17:
            return 'wand_hold'  # HOLD position: magical implement, not armor
        return 'armor'
    if re.search(KEY_WORDS, lname):
        return 'key'
    if re.search(POTION_WORDS, lname):
        return 'potion'
    if re.search(SCROLL_WORDS, lname):
        return 'scroll'
    if re.search(CONTAINER_WORDS, lname):
        return 'container'
    if re.search(FOOD_WORDS, lname):
        return 'food'
    if re.search(DRINK_WORDS, lname):
        return 'drinkcon'
    if re.search(LIGHT_WORDS, lname):
        return 'light'
    return 'treasure'


def attack_msg_type(name):
    lname = name.lower()
    for pattern, val in ATTACK_WORDS:
        if re.search(pattern, lname):
            return val
    return 11  # default: pierce


def wear_flags_for(pos):
    if pos is None:
        return 1  # TAKE only
    if pos == 0:
        return 1 | (1 << 14)  # TAKE | HOLD (lights are worn via type check, not a bit)
    bit = POS_TO_BIT.get(pos)
    if bit is None:
        return 1
    return 1 | (1 << bit)


def gen_room_desc(name):
    cap = name[0].upper() + name[1:] if name and not name[0].isupper() else name
    return f"{cap} lies here, waiting to be claimed."


def clean_keywords(name):
    words = re.sub(r'&[A-Za-z]', ' ', name)
    words = re.sub(r'[^A-Za-z0-9\' ]', ' ', words)
    tokens = [w.lower() for w in words.split() if len(w) > 2]
    tokens = [t for t in tokens if t not in ('the', 'and', 'named', 'lord', 'huge', 'pair', 'some')]
    if not tokens:
        tokens = ['item']
    seen = []
    for t in tokens[:5]:
        if t not in seen:
            seen.append(t)
    return ' '.join(seen)


def build_item(vnum, meta, eff_level):
    name = meta['name']
    pos = meta['pos']
    if pos is None:
        pos = infer_pos_from_name(name)
    pct = meta.get('pct', 100)
    factor = rarity_factor(pct)
    kind = classify_type(name, pos)
    keywords = clean_keywords(name)
    short_desc = name if not name[:1].isupper() else name
    room_desc = gen_room_desc(name)
    lvl_tag = max(1, round(eff_level))

    lines = [f'#{vnum}', f'{keywords}~', f'{short_desc}~', f'{room_desc}~', '~']
    affects = []

    if kind == 'weapon':
        # anchor to the game's own canonical mob damage curve for this
        # level (tools/mobfix-table.json), not a standalone linear formula
        mob_dam = mob_dam_avg(eff_level)
        total = mob_dam * max(0.35, min(0.9, 0.35 + factor * 0.35))
        dice_avg = total * 0.87
        damroll = max(0, round((total * 0.13) / 0.8))
        ndice = max(1, round(dice_avg / 5.5))
        sdice = 10
        wear = wear_flags_for(pos if pos else 16)
        msg = attack_msg_type(name)
        weight = 5 + round(eff_level / 20)
        cost = round(50 + eff_level * 15 * factor)
        rent = max(5, round(cost / 8))
        lines.append(f'5 a {wear}')
        lines.append(f'0 {ndice} {sdice} {msg}')
        lines.append(f'{weight} {cost} {rent} {lvl_tag}')
        if damroll > 0:
            affects.append((19, damroll))
    elif kind == 'shield':
        ac = max(1, min(40, round(1 + eff_level / 15 * (0.5 + factor * 0.5))))
        wear = wear_flags_for(11)
        weight = 8 + round(eff_level / 15)
        cost = round(40 + eff_level * 10 * factor)
        rent = max(5, round(cost / 8))
        lines.append(f'9 a {wear}')
        lines.append(f'{ac} 0 0 0')
        lines.append(f'{weight} {cost} {rent} {lvl_tag}')
    elif kind == 'armor':
        ac = max(1, min(40, round(1 + eff_level / 15 * (0.5 + factor * 0.5))))
        wear = wear_flags_for(pos)
        weight = 2 + round(eff_level / 25)
        cost = round(30 + eff_level * 8 * factor)
        rent = max(5, round(cost / 8))
        lines.append(f'9 a {wear}')
        lines.append(f'{ac} 0 0 0')
        lines.append(f'{weight} {cost} {rent} {lvl_tag}')
        attr_loc = POS_ATTR.get(pos)
        if attr_loc and factor > 0.9:
            attr_bonus = max(1, min(10, round(1 + eff_level / 40 * factor)))
            affects.append((attr_loc, attr_bonus))
    elif kind == 'wand_hold':
        # HOLD-position magical implements (rods, wands, held trinkets):
        # not armor, give a modest attribute bonus instead of fake AC
        wear = wear_flags_for(17)
        weight = 2 + round(eff_level / 30)
        cost = round(60 + eff_level * 12 * factor)
        rent = max(5, round(cost / 8))
        lines.append(f'8 a {wear}')
        lines.append('0 0 0 0')
        lines.append(f'{weight} {cost} {rent} {lvl_tag}')
        attr_bonus = max(1, min(10, round(1 + eff_level / 40 * factor)))
        affects.append((3, attr_bonus))  # INT (arcane implement flavor)
    elif kind == 'light':
        wear = wear_flags_for(0)
        weight = 1
        cost = round(30 + eff_level * 3)
        rent = max(5, round(cost / 8))
        lines.append(f'1 a {wear}')
        lines.append('0 0 -1 0')
        lines.append(f'{weight} {cost} {rent}')
    elif kind == 'key':
        lines.append('18 0 1')
        lines.append('0 0 0 0')
        lines.append('1 0 0')
    elif kind == 'potion':
        wear = 1 | (1 << 14)
        weight = 1
        cost = round(50 + eff_level * 5)
        rent = max(5, round(cost / 10))
        lines.append(f'10 g {wear | (1<<0)}')
        lines.append(f'{lvl_tag} 16 -1 -1')
        lines.append(f'{weight} {cost} {rent}')
    elif kind == 'scroll':
        wear = 1 | (1 << 14)
        weight = 1
        cost = round(80 + eff_level * 8)
        rent = max(5, round(cost / 10))
        lines.append(f'2 g {wear}')
        lines.append(f'{lvl_tag} 501 -1 -1')
        lines.append(f'{weight} {cost} {rent}')
    elif kind == 'container':
        wear = 1 | (1 << 14)
        cap = 15 + round(eff_level / 5)
        weight = 2 + round(eff_level / 40)
        cost = round(40 + eff_level * 4)
        rent = max(5, round(cost / 10))
        lines.append(f'15 0 {wear}')
        lines.append(f'{cap} 0 -1 0')
        lines.append(f'{weight} {cost} {rent}')
    elif kind == 'food':
        weight = 1
        cost = round(10 + eff_level)
        lines.append('19 0 1')
        lines.append('6 0 0 0')
        lines.append(f'{weight} {cost} 0')
    elif kind == 'drinkcon':
        weight = 2
        cost = round(20 + eff_level)
        lines.append('17 0 1')
        lines.append('20 20 10 0')
        lines.append(f'{weight} {cost} 0')
    else:  # treasure / misc
        wear = 1
        weight = 1
        cost = round(50 + eff_level * 6 * factor)
        rent = max(5, round(cost / 10))
        lines.append(f'8 0 {wear}')
        lines.append('0 0 0 0')
        lines.append(f'{weight} {cost} {rent}')

    for loc, mod in affects:
        lines.append('A')
        lines.append(f'{loc} {mod}')

    return '\n'.join(lines)


def zone_index_insert_point(index_lines, target_fname):
    target_num = int(target_fname.replace('.obj', ''))
    for i, fname in enumerate(index_lines):
        num = int(fname.replace('.obj', ''))
        if num > target_num:
            return i
    return len(index_lines)


def main():
    dry_run = '--dry-run' in sys.argv

    areas_by_vnum = load_areas()
    existing_vnums, obj_index_files = existing_obj_vnums()

    zon_files = read_index(ZON_DIR)

    # 1. collect every referenced item vnum across the whole world, per its OWNING zone
    owner_needed = {}  # owning_zone_vnum -> {vnum: meta}
    for zfn in zon_files:
        zone_id = int(zfn.replace('.zon', ''))
        items = parse_zone_items(zone_id)
        for vnum, meta in items.items():
            if vnum in existing_vnums:
                continue
            owning_zone = vnum // 100
            owner_needed.setdefault(owning_zone, {})
            # keep the lowest pct (rarest/most significant) reference if duplicated
            if vnum in owner_needed[owning_zone]:
                if meta['pct'] < owner_needed[owning_zone][vnum]['pct']:
                    owner_needed[owning_zone][vnum] = meta
            else:
                owner_needed[owning_zone][vnum] = meta

    total_generated = 0
    zones_touched = 0
    index_lines = list(obj_index_files)
    report = []

    for owning_zone in sorted(owner_needed):
        items = owner_needed[owning_zone]
        if not items:
            continue
        area = areas_by_vnum.get(owning_zone)
        eff = effective_level(area)
        area_name = area['name'] if area else f'(unlisted zone {owning_zone})'

        blocks = []
        for vnum in sorted(items):
            meta = items[vnum]
            try:
                blocks.append(build_item(vnum, meta, eff))
            except Exception as e:
                print(f"ERROR building vnum {vnum} in zone {owning_zone}: {e}")
                continue

        if not blocks:
            continue

        fname = f'{owning_zone}.obj'
        fpath = os.path.join(OBJ_DIR, fname)
        new_content = '\n'.join(blocks) + '\n'

        if os.path.exists(fpath):
            with open(fpath, 'rb') as f:
                existing = f.read().decode('latin-1')
            if existing.rstrip().endswith('$~'):
                existing = existing.rstrip()[:-2].rstrip() + '\n'
            merged = existing + new_content + '$~\n'
        else:
            merged = new_content + '$~\n'
            if fname not in index_lines:
                pos = zone_index_insert_point(index_lines, fname)
                index_lines.insert(pos, fname)

        report.append((owning_zone, area_name, len(blocks)))
        total_generated += len(blocks)
        zones_touched += 1

        if not dry_run:
            with open(fpath, 'w', encoding='latin-1') as f:
                f.write(merged)

    if not dry_run:
        with open(os.path.join(OBJ_DIR, 'index'), 'w') as f:
            for fn in index_lines:
                f.write(fn + '\n')
            f.write('$~\n')

    print(f"\n{'DRY RUN: ' if dry_run else ''}Generated {total_generated} items across {zones_touched} zones\n")
    for zid, zname, count in sorted(report, key=lambda r: -r[2]):
        print(f"  zone {zid:>4} ({zname}): {count} items")


if __name__ == '__main__':
    main()
