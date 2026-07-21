#!/usr/bin/env python3
"""Deep-compare the Flask reference (:8000) and Spring (:8001) read endpoints
running against the SAME database. Compares parsed JSON including OBJECT KEY
ORDER (the contract preserves it) and reports the first divergent paths.

Run: .venv/bin/python scripts/parity_read.py [--details N|all]
"""
import json
import os
import sys
import urllib.error
import urllib.request

FLASK = os.environ.get('FLASK_BASE', 'http://localhost:8000/api')
SPRING = os.environ.get('SPRING_BASE', 'http://localhost:8001/api')
MAX_REPORT = 20

diffs = []


def get(base, path, expect_status=200):
    try:
        with urllib.request.urlopen(base + path) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))


def cmp(a, b, loc):
    if len(diffs) >= MAX_REPORT:
        return
    num = (int, float)
    if isinstance(a, bool) is not isinstance(b, bool) or (
            not (isinstance(a, num) and isinstance(b, num))
            and type(a) is not type(b)):
        diffs.append(f'{loc}: type {type(a).__name__} != {type(b).__name__} ({a!r} vs {b!r})')
        return
    if isinstance(a, dict):
        if list(a.keys()) != list(b.keys()):
            diffs.append(f'{loc}: key order/set differs\n  flask : {list(a.keys())}\n  spring: {list(b.keys())}')
            return
        for k in a:
            cmp(a[k], b[k], f'{loc}.{k}')
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append(f'{loc}: len {len(a)} != {len(b)}')
            return
        for i, (x, y) in enumerate(zip(a, b)):
            cmp(x, y, f'{loc}[{i}]')
    elif a != b:
        diffs.append(f'{loc}: {a!r} != {b!r}')


def main():
    n_details = sys.argv[sys.argv.index('--details') + 1] if '--details' in sys.argv else 'all'

    _, fh = get(FLASK, '/healthz')
    _, sh = get(SPRING, '/healthz')
    cmp(fh, sh, 'healthz')

    _, fc = get(FLASK, '/cases.json')
    _, sc = get(SPRING, '/cases.json')
    cmp(fc, sc, 'cases')

    ids = ([c['id'] for c in fc['complete']]
           + [c['id'] for g in fc['incompleteGroups'] for c in g['cases']]
           + [c['id'] for c in fc['finished']])
    if n_details != 'all':
        ids = ids[:int(n_details)]

    checked = 0
    for cid in ids:
        if len(diffs) >= MAX_REPORT:
            break
        fs, fd = get(FLASK, f'/cases/{cid}.json')
        ss, sd = get(SPRING, f'/cases/{cid}.json')
        if fs != ss:
            diffs.append(f'detail[{cid}]: status {fs} != {ss}')
            continue
        for key in ('codeEdits', 'reportDraft'):
            if key not in fd or key not in sd:
                diffs.append(f'detail[{cid}]: {key} missing (flask={key in fd}, spring={key in sd})')
        cmp(fd, sd, f'detail[{cid}]')
        checked += 1

    # unknown id must 404 with the same body on both
    fs, fd = get(FLASK, '/cases/NOPE.json')
    ss, sd = get(SPRING, '/cases/NOPE.json')
    if (fs, fd) != (ss, sd):
        diffs.append(f'404 case: flask {fs} {fd} != spring {ss} {sd}')

    if diffs:
        print(f'PARITY FAIL — first {len(diffs)} diff(s):')
        for d in diffs:
            print(' ', d)
        sys.exit(1)
    print(f'PARITY OK — cases.json + {checked} details + healthz + 404 identical')


if __name__ == '__main__':
    main()
