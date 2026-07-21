#!/usr/bin/env python3
"""Dump the Python-side deterministic fake values for every real case id.

Output: src/test/resources/fakes-golden.json, replayed by
DeterministicFakesTest to prove the Java port (DeterministicFakes.java)
is value-identical with sync/views.py.

Run: .venv/bin/python scripts/gen_fakes_golden.py   (local PG must be seeded)
"""
import json
import os
import sys

POC = os.environ.get(
    'POC',
    os.path.expanduser('~/Desktop/development/audit_chart/audit-chart_doc/integration-poc'))
sys.path.insert(0, os.path.join(POC, 'sync'))
import views  # noqa: E402

import psycopg2  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', 'src', 'test', 'resources', 'fakes-golden.json')

conn = psycopg2.connect(os.environ.get('DSN', 'postgresql://localhost:5432/medcode'))
cur = conn.cursor()
cur.execute('SELECT case_id, sex, severity_level FROM cases ORDER BY case_id')

golden = {}
for case_id, sex, severity in cur.fetchall():
    created, updated = views.fake_dates(case_id)
    golden[case_id] = {
        'sex': sex,
        'severity': severity,
        'conf': views.conf(case_id, severity),
        'name': views.fake_name(case_id, sex),
        'hn': views.fake_hn(case_id),
        'created': created,
        'updated': updated,
        'revenue': views.revenue_impact(case_id, severity),
        'demoCoder': views.display_coder(case_id, 'demo.coder'),
    }

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(golden, f, ensure_ascii=False)
print(f'wrote {len(golden)} cases -> {os.path.normpath(OUT)}')
