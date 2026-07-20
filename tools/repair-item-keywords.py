#!/usr/bin/env python3
# tools/repair-item-keywords.py
# One-shot repair for the mid-word color-code bug in gen-missing-items.py's
# clean_keywords() (fixed in this same change): items whose original zone
# name colored individual letters within a word (e.g. "&WG&wrey" for
# "Grey") got their keyword line shattered into unusable fragments (or the
# generic "item" fallback). Re-derives each item's keyword line from its
# own already-written short_description using the corrected function, and
# only touches blocks whose keyword line actually changes.
#
# Usage: python3 tools/repair-item-keywords.py [--dry-run]

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBJ_DIR = os.path.join(ROOT, 'wdii', 'lib', 'world', 'obj')
# Only touch vnums this session's gen-missing-items.py itself created
# (git diff of the mass-generation commit vs the commit right before it)
# -- never regenerate a pre-existing, hand-authored item's keyword line
# from its short_description, since hand-authored keywords can carry
# intentionally extra search terms a short_desc-only derivation would drop.
GENERATED_VNUMS_PATH = os.path.join(
    '/private/tmp/claude-501/-Users-ricardobussacro-Documents-Wardome/1e4c6a67-ee59-4ae2-b996-12ab6839da56',
    'scratchpad', 'my_generated_vnums.txt'
)
with open(GENERATED_VNUMS_PATH) as _f:
    GENERATED_VNUMS = set(int(l.strip()) for l in _f if l.strip())


def clean_keywords(name):
    words = re.sub(r'&[A-Za-z]', '', name)
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


def read_index():
    with open(os.path.join(OBJ_DIR, 'index')) as f:
        return [l.strip() for l in f if l.strip() and not l.strip().startswith('$')]


def main():
    dry_run = '--dry-run' in sys.argv
    total_fixed = 0
    files_touched = 0

    for fn in read_index():
        path = os.path.join(OBJ_DIR, fn)
        with open(path, 'rb') as f:
            content = f.read().decode('latin-1')

        blocks = re.split(r'\n(?=#\d+\n)', content)
        changed_in_file = 0
        new_blocks = []

        for b in blocks:
            m = re.match(r'^(#(\d+))\n([^\n]*)~\n([^\n]*)~\n', b)
            if not m:
                new_blocks.append(b)
                continue
            vnum_line, vnum, old_kw, short_desc = m.group(1), int(m.group(2)), m.group(3), m.group(4)
            if vnum not in GENERATED_VNUMS:
                new_blocks.append(b)
                continue
            new_kw = clean_keywords(short_desc)
            if new_kw != old_kw and new_kw.strip():
                b = b.replace(f'{vnum_line}\n{old_kw}~\n', f'{vnum_line}\n{new_kw}~\n', 1)
                changed_in_file += 1
            new_blocks.append(b)

        if changed_in_file:
            files_touched += 1
            total_fixed += changed_in_file
            print(f"{fn}: repaired {changed_in_file} keyword line(s)")
            if not dry_run:
                new_content = '\n'.join(new_blocks)
                with open(path, 'w', encoding='latin-1') as f:
                    f.write(new_content)

    print(f"\n{'DRY RUN: ' if dry_run else ''}Total repaired: {total_fixed} items across {files_touched} files")


if __name__ == '__main__':
    main()
