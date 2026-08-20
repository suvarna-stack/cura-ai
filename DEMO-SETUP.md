# MedCode AI — full demo setup runbook

Hand this file to an AI assistant (or a human) on a fresh machine and it can
bring the whole hospital demo up from zero. State as of 2026-08-02.

## What the system is

Three services + one React frontend, two Postgres databases:

| Piece | Repo | Port | Database |
|---|---|---|---|
| Hospital mock API ("iMed") | `imed-mock-api` (this repo) | 8003 | `imed` (schema `imed`) |
| MedCode AI backend | `medcode-api` | 8001 | `medcode` (schema `public`) |
| RAG suggestion service | `RAG` | 8000 | — (own local index) |
| Audit chart frontend (React/Vite) | `audit-chart-frontend` | 5173 | — |

Demo flow: the webapp opens EMPTY → **Sync** pulls the hospital's ICD catalogs
(649 ICD-10 + 332 ICD-9) and 21 uncoded OPD cases into medcode → the coder
codes a case (AI suggestions from RAG) → **Approve** writes the codes + a
medical discharge back to the hospital DB over `POST /api/v1/diagnosis` →
**Settings → Reset** restores BOTH databases to the frozen demo baseline.
Repeatable forever.

## Prerequisites

- Windows with PowerShell (commands below assume it; adjust paths on
  Linux/macOS — everything is standard Java/Node/Python)
- Java 21 (both backends are Spring Boot; `.\mvnw.cmd` bootstraps Maven)
- Node 20+ for the webapp
- Python 3.12 for RAG (repo has its own venv instructions)
- **PostgreSQL 18** — `pg_restore` must be v18+ because the demo dumps were
  made with 18. Default install path assumed:
  `C:\Program Files\PostgreSQL\18\bin\`

## 1. Databases — restore the demo-ready dumps

You need the two dump files (ask the team; they are also kept in the
workspace's `demo-data/db-backups/`):

- `imed_demo_ready_2026-08-02.dump` — 21 uncoded cases + ICD catalogs +
  `imed_baseline` snapshot schema
- `medcode_demo_ready_2026-08-02.dump` — empty case tables (by design!),
  4 user accounts, coverage types, `demo_baseline` snapshot schema

```powershell
$env:PGPASSWORD = 'admin123'   # your postgres superuser password
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres -h localhost imed     # skip if exists
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres -h localhost medcode  # skip if exists
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U postgres -h localhost --clean --if-exists -d imed    imed_demo_ready_2026-08-02.dump
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U postgres -h localhost --clean --if-exists -d medcode medcode_demo_ready_2026-08-02.dump
```

`--clean` intentionally OVERWRITES existing data. Verify:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d imed    -t -c "SELECT count(*) FROM imed.medhack_patient;"   # 21
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d medcode -t -c "SELECT count(*) FROM cases;"                  # 0  (empty until Sync!)
```

## 2. Run the services (one PowerShell terminal each, in this order)

Every backend terminal needs `DATABASE_URL` set FIRST — a missing one causes a
SCRAM "password authentication" error at startup. Use PowerShell, not cmd.exe
(`$env:` does nothing in cmd; there use `set DATABASE_URL=...`).

**Terminal 1 — hospital mock (this repo), port 8003:**
```powershell
cd imed-mock-api
$env:DATABASE_URL = 'postgresql://postgres:admin123@localhost:5432/imed'
.\mvnw.cmd spring-boot:run
```

**Terminal 2 — medcode backend, port 8001:**
```powershell
cd medcode-api
$env:DATABASE_URL = 'postgresql://postgres:admin123@localhost:5432/medcode'
.\mvnw.cmd spring-boot:run
```

**Terminal 3 — RAG service, port 8000** (see `RAG/how-to-run` notes; venv is
`.venv-uv`):
```powershell
cd RAG
.\.venv-uv\Scripts\activate
python main.py   # or the repo's documented uvicorn command
```

**Terminal 4 — webapp, port 5173:**
```powershell
cd audit-chart-frontend
npm install
npm run dev
```

Health checks: `http://localhost:8003/api/health`, `:8001/api/health` →
`{"ok":true}`. "Port already in use" → find the stale process with
`Get-NetTCPConnection -LocalPort 8003 | Select OwningProcess` and stop it.

## 3. Verify the demo loop end-to-end

1. Open `http://localhost:5173`, log in `admin@medcodeai.demo` / `admin1234`
   (coder accounts Austin / Pablo / Frank exist with their own passwords).
2. Dashboard is EMPTY — correct; that's the demo opening.
3. Click **Sync**. Expect: **total 21 · complete 6 · incomplete 15**
   (medicine 5, ct-x-ray 4, other 3, surgery 3) and both ICD catalogs filled
   on the medcode side.
4. Open a case → AI suggestions appear (needs RAG on :8000; without it the
   code columns just stay empty — the demo still works, minus suggestions).
5. Add/edit codes → **Approve** → the case moves to Finished, and on the
   hospital DB new rows appear in `imed.medhack_diagnosis_icd10` and
   `imed.doctor_discharge_opd`, and that visit's
   `imed.medhack_patient.coding_status` flips to `approved` — the hospital-side
   twin of medcode's `cases.case_status` (that's the write-back proof).
   Reopening the case clears it back to NULL. The visit's `dischargestatus`
   never moves: that column is the doctor's clinical outcome.
6. **Settings → Reset demo** → both databases return to step 2's state, your
   login survives. If reset returns 409 "no demo baseline", the dumps didn't
   include the baseline schemas — re-restore, or freeze a new baseline with
   `POST http://localhost:8001/api/demo/snapshot` (admin Bearer token).

## Key facts an assistant should know

- "Complete" = the chart's DOCUMENTATION is complete (chief complaint + exam +
  assessment present) — never "already coded". The hospital sends NO
  diagnoses; coding is what this product does. All 21 demo cases are uncoded.
- The webapp keeps no case state in the browser — server is the single source
  of truth; a page reload always reflects the DB.
- `imed_request_log` implements the hospital PDF's request_id dedup — keep it.
- The coding-status extension and report drafts were removed 2026-08-02 —
  don't resurrect them from old docs.
- To change what "demo start" looks like: arrange both DBs as desired, then
  `POST /api/demo/snapshot` once. Reset always returns to the last snapshot.
- Dataset source of truth: `demo-data/generate_demo_cases.py` (workspace
  root, outside the repos) — regenerates `demo_cases.sql` if the cases ever
  need changing.
