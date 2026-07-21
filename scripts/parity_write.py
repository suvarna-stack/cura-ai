#!/usr/bin/env python3
"""Write-path parity: clone the seeded local DB into scratch_flask and
scratch_spring, run a dedicated Flask (:8100) and Spring (:8101) against the
clones, drive an IDENTICAL write sequence through both, then diff:
  - every HTTP response (parsed JSON incl. key order),
  - full pg_dump --data-only of both scratch DBs (timestamps masked),
  - the final cases.json from both servers (exercises cache invalidation).

Run: .venv/bin/python scripts/parity_write.py [--with-reset]
Requires: local PG running with the seeded "medcode" DB; no servers attached
to it (the script clones from it as a template).
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PGBIN = os.environ.get('PGBIN', '/opt/homebrew/opt/postgresql@18/bin')
POC = os.environ.get('POC', os.path.expanduser(
    '~/Desktop/development/audit_chart/audit-chart_doc/integration-poc'))
TEMPLATE = 'medcode'
FLASK_DB, SPRING_DB = 'scratch_flask', 'scratch_spring'
FLASK_PORT, SPRING_PORT = 8100, 8101
TS = re.compile(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?")

fails = []


def sh(*args, **kw):
    subprocess.run(args, check=True, **kw)


def req(port, path, method='GET', body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
    r = urllib.request.Request(f'http://localhost:{port}/api{path}', data=data, method=method,
                               headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))


def wait_up(port, name, tries=60):
    for _ in range(tries):
        try:
            urllib.request.urlopen(f'http://localhost:{port}/api/health')
            return
        except OSError:
            time.sleep(1)
    raise SystemExit(f'{name} did not come up on :{port}')


def check(name, cond, detail=''):
    if not cond:
        fails.append(f'{name}: {detail}')
    print(('ok  ' if cond else 'FAIL'), name, '' if cond else detail)


def both(step, path, method='GET', body=None):
    """Run the same request against both servers; responses must be identical."""
    f = req(FLASK_PORT, path, method, body)
    s = req(SPRING_PORT, path, method, body)
    fj = json.dumps(f, ensure_ascii=False, sort_keys=False)
    sj = json.dumps(s, ensure_ascii=False, sort_keys=False)
    check(f'{step}: response parity', fj == sj, f'\n  flask : {fj[:400]}\n  spring: {sj[:400]}')
    return f


def dump(db):
    out = subprocess.run([f'{PGBIN}/pg_dump', '--data-only', '--inserts', db],
                         check=True, capture_output=True, text=True).stdout
    # \restrict / \unrestrict lines carry a per-run random token (pg_dump >= 17.6)
    out = re.sub(r'^\\(un)?restrict .*$', r'\\\1restrict TOKEN', out, flags=re.M)
    return TS.sub('TS', out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--with-reset', action='store_true', help='also exercise POST /demo/reset')
    args = ap.parse_args()

    for db in (FLASK_DB, SPRING_DB):
        subprocess.run([f'{PGBIN}/dropdb', '--if-exists', db], check=True)
        sh(f'{PGBIN}/createdb', '-T', TEMPLATE, db)
    print(f'cloned {TEMPLATE} -> {FLASK_DB}, {SPRING_DB}')

    env_f = dict(os.environ, DATABASE_URL=f'postgresql://localhost:5432/{FLASK_DB}',
                 PORT=str(FLASK_PORT))
    env_s = dict(os.environ, DATABASE_URL=f'postgresql://localhost:5432/{SPRING_DB}',
                 PORT=str(SPRING_PORT))
    flask_p = subprocess.Popen([f'{ROOT}/.venv/bin/python', 'app.py'], cwd=f'{POC}/server',
                               env=env_f, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    spring_p = subprocess.Popen(['java', '-jar', f'{ROOT}/target/medcode-api-0.0.1-SNAPSHOT.jar'],
                                env=env_s, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_up(FLASK_PORT, 'flask')
        wait_up(SPRING_PORT, 'spring')

        # pick targets from the (identical) baseline payload
        cases = req(FLASK_PORT, '/cases.json')[1]
        a, b = [c['id'] for c in cases['complete'][:2]]
        c = cases['incompleteGroups'][0]['cases'][0]['id']
        print(f'targets: complete={a},{b} incomplete={c}')

        payload = [
            {'code': 'I21.0', 'type': 'ICD-10', 'desc': 'STEMI ผนังหน้า', 'confidence': 92},
            {'code': '???', 'type': 'ICD-10', 'desc': 'รอผล', 'confidence': 0, 'missing': True},
            {'code': 'E11.9', 'type': 'ICD-10', 'desc': 'เบาหวานชนิดที่ 2', 'confidence': 71},
            {'code': '00.66', 'type': 'ICD-9', 'desc': 'PTCA', 'confidence': 88},
            {'code': 'ZZ-NEW.1', 'type': 'ICD-10', 'desc': 'brand new code row', 'confidence': 50},
        ]

        both('save codes A', f'/cases/{a}/codes', 'PUT', payload)
        both('approve A+B+missing', '/cases/approve', 'POST',
             {'ids': [a, b, 'NO-SUCH-ID']})
        both('approve C (simulate path)', '/cases/approve', 'POST',
             {'ids': [c], 'coder': 'web.coder'})
        both('approve bad body', '/cases/approve', 'POST', {'ids': 'nope'})
        both('reopen A', f'/cases/{a}/reopen', 'POST', {'coder': 'web.coder'})
        both('reopen unknown', '/cases/NO-SUCH-ID/reopen', 'POST', {})
        both('re-approve A', '/cases/approve', 'POST', {'ids': [a]})
        if args.with_reset:
            both('demo reset', '/demo/reset', 'POST', {})
            both('re-approve A after reset', '/cases/approve', 'POST', {'ids': [a]})
            both('demo reset again', '/demo/reset', 'POST', {})

        both('final cases.json', '/cases.json')
        both(f'final detail A', f'/cases/{a}.json')
        both(f'final detail C', f'/cases/{c}.json')

        df, ds = dump(FLASK_DB), dump(SPRING_DB)
        if df != ds:
            delta = list(difflib.unified_diff(df.splitlines(), ds.splitlines(),
                                              'flask_db', 'spring_db', lineterm=''))[:60]
            check('DB dump parity', False, '\n' + '\n'.join(delta))
        else:
            check('DB dump parity', True)
    finally:
        flask_p.terminate()
        spring_p.terminate()
        flask_p.wait()
        spring_p.wait()
        for db in (FLASK_DB, SPRING_DB):
            subprocess.run([f'{PGBIN}/dropdb', '--if-exists', db], check=True)

    if fails:
        print(f'\nWRITE PARITY FAIL ({len(fails)}):')
        for f in fails:
            print(' ', f)
        sys.exit(1)
    print('\nWRITE PARITY OK')


if __name__ == '__main__':
    main()
