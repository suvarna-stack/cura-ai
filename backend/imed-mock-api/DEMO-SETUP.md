# MedCode AI — full demo setup runbook

Hand this file to an AI assistant (or a human) on a fresh machine and it can
bring the whole hospital demo up from zero. State as of 2026-08-02, with a
macOS/Linux path and a few real gotchas added 2026-09-19 after actually
running this end to end on a bare-metal Mac (no Docker) — see the
**macOS/Linux quickstart** section, which the original Windows-only
instructions below did not cover beyond "adjust paths."

## What the system is

Three services + one React frontend, two Postgres databases:

| Piece | Repo | Port | Database |
|---|---|---|---|
| Hospital mock API ("iMed") | `imed-mock-api` (this repo) | 8003 | `imed` (schema `imed`) |
| MedCode AI backend | `medcode-api` | 8001 | `medcode` (schema `public`) |
| RAG suggestion service | `RAG` | 8000 | — (own local index) |
| Audit chart frontend (React/Vite) | `audit-chart-frontend` | 5173 | — |

Demo flow: the webapp opens EMPTY → **Sync** pulls the hospital's ICD catalogs
(650 ICD-10 + 332 ICD-9) and 100 OPD cases into medcode, 50 of them already
complete → the coder codes a case (AI suggestions from RAG) → **Approve** writes
the codes + a medical discharge back to the hospital DB over
`POST /api/v1/diagnosis` → **Settings → Reset** restores BOTH databases to the
demo baseline. Repeatable forever.

**Take the baseline snapshot first.** Reset restores to a snapshot, and a
freshly seeded database has none — so it answers *409 no demo baseline* until
you capture one. Right after seeding and **before** the first Sync, call
`POST /api/demo/snapshot` on medcode-api (:8001). This is easy to miss on a
brand-new Docker stack, where every database starts empty.

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

You need the two dump files — they are tracked in this repo at
`imed-mock-api/db-backups/` (not a separate workspace-level `demo-data/`
folder; that path is stale as of 2026-09-19):

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

**Terminal 3 — RAG service, port 8000** (venv is plain `.venv`, per `RAG/README.md`):
```powershell
cd RAG
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py   # NOT main.py -- that's the app module, run.py starts uvicorn
```

> ⚠️ **Python version trap (hit 2026-09-19):** `requirements.txt` has no
> explicit Python floor, but several pinned deps (`networkx>=3.4`, modern
> `sentence-transformers`/`transformers`/`torch` builds) require **Python
> 3.10+**. A machine whose default `python`/`python3` is older (3.9 was the
> macOS system default that caused this) will fail mid-`pip install` with
> cryptic "no matching distribution" errors for `networkx`. Fix: point the
> venv at a newer interpreter explicitly, e.g. `python3.12 -m venv .venv`
> (install via `brew install python@3.12` on macOS if needed).
>
> ⚠️ **First real request downloads ~3–5 GB of model weights** (`bge-m3` +
> `Qwen2.5-0.5B-Instruct`) from Hugging Face on first use, lazily — not
> during `pip install`. On a slow connection this can take hours, not
> minutes; plan for it, and know that `huggingface_hub` downloads are
> resumable if interrupted (safe to re-run, won't restart from zero).
> `POST /suggest` only needs the embedding model (`bge-m3`), not the LLM —
> useful if you're validating retrieval and want to skip waiting on the
> Qwen download.

**Terminal 4 — webapp, port 5173:**
```powershell
cd audit-chart-frontend
npm install
npm run dev
```

Health checks: `http://localhost:8003/api/health`, `:8001/api/health` →
`{"ok":true}`. "Port already in use" → find the stale process with
`Get-NetTCPConnection -LocalPort 8003 | Select OwningProcess` and stop it.

## macOS / Linux quickstart (tested 2026-09-19, bare-metal, no Docker)

The steps above are Windows/PowerShell-specific beyond password handling.
Here's what actually worked end to end on macOS with a local Homebrew
Postgres (no Docker):

```bash
# 1. Databases — same dumps as above, psql/pg_restore instead of .exe
createdb imed && createdb medcode     # skip if they already exist
pg_restore --clean --if-exists -d imed    imed-mock-api/db-backups/imed_demo_ready_2026-08-02.dump
pg_restore --clean --if-exists -d medcode imed-mock-api/db-backups/medcode_demo_ready_2026-08-02.dump

# 2. Services — DATABASE_URL is optional locally
# Both Spring apps default to postgresql://localhost:5432/<db> using YOUR
# macOS username when DATABASE_URL is unset (see DataSourceConfig.java) --
# this "just worked" against a local Postgres with trust/peer auth and no
# password, no admin123 needed. Only set DATABASE_URL if your local
# Postgres actually requires a password.

# terminal 1
cd imed-mock-api && ./mvnw spring-boot:run          # :8003

# terminal 2
cd medcode-api && ./mvnw spring-boot:run            # :8001 -- start AFTER
# imed-mock-api is healthy; medcode-api calls out to it and some flows
# (sync, write-back) fail with "iMed API not reachable" otherwise.

# terminal 3
cd RAG && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py                                        # :8000 -- see the
# Python-version and model-download notes above before this step

# terminal 4
cd audit-chart-frontend && npm install && npm run dev # :5173
```

Health checks are the same as above (`curl http://localhost:8001/api/health`
etc.). If a port is already bound: `lsof -i :8001` (or 8000/8003/5173) to
find the stale process, then `kill <pid>`.

## 3. Verify the demo loop end-to-end

1. Open `http://localhost:5173`, log in `admin@medcodeai.demo` / `admin1234`
   (coder accounts Austin / Pablo / Frank exist with their own passwords).
2. Dashboard is EMPTY — correct; that's the demo opening.
   (The **Finished** queue also starts empty and stays empty until step 5.
   20 of the synced visits do carry `coding_status='approved'` from the
   hospital, but medcode seeds every synced case as `open` on purpose —
   workflow state is coder-owned — so they sit in *complete*, not *finished*.)
3. Click **Sync**. Expect: **total 100 · complete 50 · incomplete 50**
   (medicine 39, ct-x-ray 5, other 4, surgery 2) and both ICD catalogs filled
   on the medcode side. The hospital also ships 10 IPD admissions; those are
   deliberately absent from the dashboard, which serves OPD only.
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
- Dataset source of truth: `imed-mock-api/scripts/generate_demo_data.py`
  (inside this repo, not a workspace-root `demo-data/` folder — that path is
  stale as of 2026-09-19) — regenerates `scripts/generated_demo_data.sql`
  if the cases ever need changing. Each scenario in its `S` list hardcodes
  a real ground-truth ICD-10/ICD-9 code alongside the note text, which is
  useful as a gold set for scoring AI suggestion accuracy (see
  `../../eval-results/rag-accuracy-SUMMARY.md`).
