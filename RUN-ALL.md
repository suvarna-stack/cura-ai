# MedCode AI — วิธีรันทั้งระบบ (4 repo)

คู่มือนำระบบขึ้นตั้งแต่เครื่องเปล่าจนเปิดหน้าเว็บใช้งานได้จริง ระบบนี้ต้องรัน
**ครบทั้ง 4 repo** (+ PostgreSQL) ถึงจะทำงานเต็มรูปแบบ

> เอกสารนี้เป็น "วิธีรัน" อย่างเดียว — รายละเอียดของแต่ละ repo อยู่ใน README
> ของ repo นั้น ๆ และสัญญา API อยู่ที่ `docs/api-contract.md` + `docs/types.ts`
> ของ medcode-api

---

## 1. ระบบประกอบด้วยอะไรบ้าง

| # | ส่วน | Repo | Port | ฐานข้อมูล | หน้าที่ |
|---|---|---|---|---|---|
| 1 | โรงพยาบาลจำลอง (iMed) | `imed-mock-api` | **8003** | `imed` (schema `imed`) | ระบบ HIS ปลอม — ต้นทางข้อมูลเคส และปลายทางที่เราเขียนรหัสกลับไป |
| 2 | Backend หลัก | `medcode-api` | **8001** | `medcode` (schema `public`) | เจ้าของ API contract, auth, sync, approve/reopen, proxy ไป RAG |
| 3 | AI / Graph RAG | `RAG` | **8000** | ไม่มี (Chroma + graph บนดิสก์) | แนะนำรหัส ICD, AI Agent chat, คลังความรู้ (คู่มือ coding) |
| 4 | เว็บของ coder | `audit-chart-frontend` | **5173** | — | UI ทั้งหมด (React + Vite) |
| — | ฐานข้อมูล | — | 5432 | `medcode`, `imed` | PostgreSQL **18** ตัวเดียว เก็บ 2 database |
| — | (ทางเลือก) Ollama | — | 11434 | — | รัน LLM บน GPU ให้ RAG เร็วขึ้นมาก |

ทิศทางการเรียก (เบราว์เซอร์คุยกับ medcode-api เจ้าเดียว):

```
เบราว์เซอร์ :5173
      │  Authorization: Bearer <token>
      ▼
medcode-api :8001 ──► imed-mock-api :8003 ──► DB imed
      │                    (sync ดึงเคส / approve เขียนรหัสกลับ)
      ├──► DB medcode
      └──► RAG :8000 ──► (ทางเลือก) Ollama :11434
             /api/cases/{id}/suggest-codes, /api/agent/chat,
             /api/admin/knowledge/**  ← หน้า AI Training
```

**ต้องรันครบทั้ง 4 ไหม?** ใช่ ถ้าจะเดโมเต็มรูปแบบ แต่แยกระดับได้ดังนี้

- ไม่มี **imed-mock-api** → sync / approve / reopen พังทันที (ระบบแทบไม่มีข้อมูล)
- ไม่มี **RAG** → ระบบยังใช้ได้ แค่ไม่มี AI suggestion, หน้า Agent และหน้า Training ใช้ไม่ได้
- ไม่มี **frontend** → ยังยิง API ผ่าน Swagger `http://localhost:8001/swagger-ui.html` ได้

---

## 2. สิ่งที่ต้องติดตั้งก่อน (Prerequisites)

| ของ | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| **Java** | 21 | ทั้ง 2 backend เป็น Spring Boot 4.1; `./mvnw` โหลด Maven ให้เอง ไม่ต้องลง Maven |
| **PostgreSQL** | **18 เท่านั้น** | ดูกล่องเตือนด้านล่าง — ใช้ 15/16/17 restore dump ไม่ผ่าน |
| **Node.js** | 20+ | สำหรับ frontend |
| **Python** | 3.11 หรือ 3.12 | สำหรับ RAG |
| Ollama | ล่าสุด | *ทางเลือก* — ถ้าไม่มีจะ fallback ไปรันโมเดลเล็กบน CPU (ช้ามาก) |

> ⚠️ **PostgreSQL ต้องเป็น 18** — ไฟล์ dump ทั้งหมดถูก dump จาก 18.4 และมีคำสั่ง
> ที่ client เก่าไม่รู้จัก (`\restrict`) กับ parameter ที่ server เก่าไม่รู้จัก
> (`transaction_timeout`, มีตั้งแต่ PG17) ถ้าใช้ psql 15 จะเจอ
> `ERROR: unrecognized configuration parameter "transaction_timeout"` และ
> `syntax error at or near "estrict"` แล้วหยุดกลางคัน
>
> ```bash
> brew install postgresql@18 && brew services start postgresql@18
> # ถ้าเคยลง 15/16/17 ไว้ ให้หยุดตัวเก่าก่อนกัน port 5432 ชนกัน
> brew services stop postgresql@15
> ```
>
> ถ้า psql ใน PATH ยังเป็นตัวเก่า ให้ชี้ `PGBIN` ตอนรัน script:
> `PGBIN=/opt/homebrew/opt/postgresql@18/bin scripts/dev.sh`

เช็กว่าพร้อม:

```bash
java -version      # ต้องขึ้น 21
psql -V            # ต้องขึ้น 18.x
node -v            # 20+
python3 -V         # 3.11 / 3.12
pg_isready         # accepting connections
```

---

## 3. Clone ทั้ง 4 repo

ทุก repo อยู่ที่ GitHub org `Occamy-medihack` วางเป็นโฟลเดอร์พี่น้องกัน:

```bash
mkdir -p ~/medcode && cd ~/medcode
git clone https://github.com/Occamy-medihack/imed-mock-api.git
git clone https://github.com/Occamy-medihack/medcode-api.git
git clone https://github.com/Occamy-medihack/audit-chart-frontend.git
git clone https://github.com/Occamy-medihack/RAG.git
```

ได้โครงแบบนี้ (สคริปต์ `scripts/dev.sh` ของ medcode-api สมมติ layout นี้):

```
~/medcode/
├── imed-mock-api/        :8003  โรงพยาบาลจำลอง
├── medcode-api/          :8001  backend หลัก  ← เอกสารนี้อยู่ที่นี่
├── audit-chart-frontend/ :5173  เว็บ coder
└── RAG/                  :8000  AI
```

> 📌 **บนเครื่องนี้ (ปัจจุบัน)** `imed-mock-api` ไม่ได้อยู่ข้าง ๆ แต่อยู่ที่
> `~/audit_chart/imed-mock-api` เวลารัน `scripts/dev.sh` ต้องบอกที่อยู่ก่อน:
> ```bash
> export IMED_DIR=~/audit_chart/imed-mock-api
> ```

---

## 4. เตรียมฐานข้อมูล (ทำครั้งเดียว)

มี 2 ทาง — **เลือกทางใดทางหนึ่ง**

### ทาง A — ชุดเดโม (แนะนำ ถ้าจะไปนำเสนอ)

ใช้ dump ที่แช่ไว้ว่าเป็น "จุดเริ่มเดโม": หน้าเว็บเปิดมา **ว่างเปล่า** แล้วกด
Sync ดึง 21 เคส OPD ที่ยังไม่ถูกลงรหัสเข้ามา และมี schema สำรอง
(`imed_baseline` / `demo_baseline`) ให้ปุ่ม **Reset demo** ใช้งานได้ทันที

```bash
cd ~/medcode/imed-mock-api
createdb imed
createdb medcode
pg_restore --clean --if-exists --no-owner -d imed    db-backups/imed_demo_ready_2026-08-02.dump
pg_restore --clean --if-exists --no-owner -d medcode db-backups/medcode_demo_ready_2026-08-02.dump
```

ตรวจว่าถูก:

```bash
psql -d imed    -tc "SELECT count(*) FROM imed.medhack_patient;"   # 21
psql -d medcode -tc "SELECT count(*) FROM cases;"                  # 0  ← ว่างถูกแล้ว!
```

### ทาง B — seed จากไฟล์ baseline ใน repo

ชุดข้อมูลตัวอย่างก้อนใหญ่ (73k แถว) ไม่ใช่สภาพ "เริ่มเดโม" และ **ยังไม่มี
snapshot สำหรับปุ่ม Reset** (กด Reset จะได้ 409 จนกว่าจะยิง
`POST /api/demo/snapshot` เองหนึ่งครั้ง)

```bash
cd ~/medcode/medcode-api    && scripts/seed_local_pg.sh        # สร้าง db medcode
cd ~/medcode/imed-mock-api  && scripts/seed_local_imed_pg.sh   # สร้าง db imed
```

> ⚠️ สคริปต์ seed ทั้งสองตัว **drop database ทิ้งแล้วสร้างใหม่** — งานที่ approve
> หรือแก้ไว้ในเครื่องหายหมด ใช้เป็นปุ่มรีเซ็ตได้ แต่อย่าเผลอรันตอนมีข้อมูลสำคัญ

### เรื่อง schema ที่ควรรู้

- ตารางของ `imed` **ไม่ได้อยู่ใน `public`** แต่อยู่ใน schema ชื่อ `imed` เปิด
  DBeaver/DataGrip แล้วเห็นว่างเป็นเรื่องปกติ ต้องติ๊ก schema `imed` เอง
  (ใน psql: `SET search_path TO imed;`)
- ฝั่ง `medcode` **ไม่มีเครื่องมือ migration** — DDL ที่เพิ่มหลัง dump
  (คอลัมน์ `password_hash`, ตาราง `imed_write_ops`, การแตก `icd_codes` เป็น
  `icd_10`/`icd_9`, ฯลฯ) ถูกใส่ให้อัตโนมัติ **ตอน boot** โดย
  `config/SchemaBootstrap` ดังนั้น "seed ใหม่แล้วของหาย" แก้ด้วยการ**สตาร์ทแอปใหม่**
  ไม่ใช่ไปแก้ไฟล์ dump

---

## 5. รันระบบ — 4 terminal ตามลำดับนี้ (ใช้ได้ทุก OS)

> วิธีนี้คือวิธีหลักและ **ทำงานได้ทั้ง macOS / Linux / Windows** — ถ้าอยู่บน
> mac หรือ Linux แล้วอยากได้คำสั่งเดียวจบ ดูทางลัดในหัวข้อ 5.1

### ทางเลือก — รันด้วย Docker คำสั่งเดียว (ทุก OS)

ถ้ามี Docker อยู่แล้วและไม่อยากลง PostgreSQL / Node / Python เอง มี compose
ที่รันทั้งระบบ (4 repo + Postgres = 5 container) อยู่ที่ repo พี่น้องชื่อ
**`medcode-stack`** ซึ่งต้องวางไว้ข้าง ๆ อีก 4 repo:

```bash
cd ~/medcode/medcode-stack
cp .env.example .env
docker compose up -d --build      # ครั้งแรกนานหน่อย (build Java 2 ตัว + npm + torch)
```

เปิด <http://localhost:8080> (ไม่ใช่ 5173) แล้ว login ด้วยแอดมินใน `.env`
ฐานข้อมูลทั้ง 2 ตัวถูก seed จากไฟล์ dump ให้อัตโนมัติตอนสร้าง volume ครั้งแรก

ต่างจากวิธี 4 terminal ตรงนี้:

- **เว็บอยู่พอร์ต 8080** และ Postgres อยู่ **5433** — เลี่ยงพอร์ตที่เครื่อง dev
  มักใช้อยู่แล้ว (5173 = vite, 5432 = Postgres ที่ลงในเครื่อง) จึงรันคู่กันได้
- เบราว์เซอร์ยิง `/api` ที่ origin เดียวกัน (nginx proxy ให้) → ไม่มีเรื่อง CORS
- **Ollama ยังต้องลงในเครื่อง** (container คุยออกมาที่ `host.docker.internal`)
  เพราะ Docker บน macOS ใช้ GPU ไม่ได้
- seed ใหม่ = `docker compose down -v` แล้ว `up` อีกครั้ง

รายละเอียดทั้งหมด (พอร์ต, env, volume, การรันเทสต์, ข้อจำกัดเรื่อง RAM/ดิสก์)
อยู่ใน `../medcode-stack/README.md`

ลำดับสำคัญ: **iMed → RAG → medcode → frontend**
(medcode-api ตอน boot ไม่ได้เรียก RAG ทันที แต่เรียกโรงพยาบาลตอน sync/approve)

### Terminal 1 — โรงพยาบาลจำลอง `:8003`

```bash
cd ~/medcode/imed-mock-api
./mvnw spring-boot:run
```

ขึ้นแล้วเช็ก: <http://localhost:8003/api/health> → `{"ok":true}`
คอนโซลลองยิง API: <http://localhost:8003/console.html>

### Terminal 2 — RAG `:8000`

ครั้งแรกต้องสร้าง venv และลง dependency ก่อน:

```bash
cd ~/medcode/RAG
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt      # torch/transformers ก้อนใหญ่ ใช้เวลาสักพัก
cp .env.example .env                 # แล้วเลือก backend (ดูหัวข้อ 7)
```

รัน:

```bash
python run.py                        # หรือ: uvicorn app.main:app --reload
```

เช็ก: <http://localhost:8000/health> · เอกสาร: <http://localhost:8000/docs>

> คลังความรู้ถูก index มาให้แล้วและ commit อยู่ใน `data/` (คู่มือ 2 เล่ม:
> `S0053.pdf` 735 chunk + `icd9.pdf` 1,517 chunk) — **ไม่ต้อง ingest ใหม่**
> แต่ครั้งแรกที่เรียกใช้จริงจะดาวน์โหลดโมเดล embedding `BAAI/bge-m3` (~2 GB)
> จาก Hugging Face ก่อน ต้องต่อเน็ตรอบแรก

### Terminal 3 — Backend หลัก `:8001`

```bash
cd ~/medcode/medcode-api
./mvnw spring-boot:run
```

เช็ก: <http://localhost:8001/api/healthz> · Swagger: <http://localhost:8001/swagger-ui.html>

**ทางลัด (macOS / Linux เท่านั้น):** สคริปต์เดียวรันทั้ง iMed + medcode
(ข้าม Terminal 1):

```bash
cd ~/medcode/medcode-api
scripts/dev.sh          # seed อันที่ยังไม่มี → สตาร์ต :8003 → สตาร์ต :8001, Ctrl-C ปิดทั้งคู่
scripts/dev.sh --seed   # บังคับ seed ใหม่ทั้ง 2 database ก่อน (ล้างข้อมูลในเครื่อง)
```

`dev.sh` รันแค่ **backend 2 ตัว** — RAG กับ frontend ยังต้องเปิด terminal
เองตามข้างบน

> 🪟 **Windows ใช้สคริปต์พวกนี้ไม่ได้** — `scripts/*.sh` เป็น bash + `lsof` +
> `brew` รันบน PowerShell/cmd ไม่ขึ้น ให้ใช้วิธี 4 terminal ตามหัวข้อนี้
> (ตั้ง env ตามหัวข้อ 8, ใช้ `.\mvnw.cmd`) ซึ่งเป็นวิธีมาตรฐานที่ใช้ได้ทุก OS
> อยู่แล้ว — หรือรันผ่าน WSL / Git Bash

### Terminal 4 — เว็บ `:5173`

```bash
cd ~/medcode/audit-chart-frontend
npm install
npm run dev
```

เปิด <http://localhost:5173> — ไฟล์ `.env` มากับ repo อยู่แล้ว
(`VITE_API_BASE_URL=http://localhost:8001/api` — สังเกตว่ามี `/api` ต่อท้ายในตัว)

**ล็อกอิน:** `admin@medcodeai.demo` / `admin1234`
(ชุดเดโมมี account ของ coder — Austin / Pablo / Frank — ติดมาด้วย)

---

## 6. ทดสอบว่าใช้ได้จริง (demo loop)

1. เปิด <http://localhost:5173> ล็อกอินด้วยบัญชี admin ข้างบน
2. Dashboard **ว่าง** — ถูกต้อง นี่คือจุดเริ่มเดโม
3. กด **Sync** → ควรได้ **total 21 · complete 6 · incomplete 15** พร้อมดึง
   ICD catalog (ICD-10 649 รหัส / ICD-9 332 รหัส) เข้ามา
4. เปิดเคสหนึ่ง → มี AI suggestion โผล่ (ถ้าไม่มี RAG ช่องนี้จะว่าง แต่ที่เหลือใช้ได้ปกติ)
5. เพิ่ม/แก้รหัส → **Approve** → เคสย้ายไป Finished และฝั่งโรงพยาบาลมีแถวใหม่
   ใน `imed.medhack_diagnosis_icd10` + `imed.doctor_discharge_opd` (นี่คือหลักฐานว่า write-back ทำงาน)
   ```bash
   psql -d imed -tc "SELECT count(*) FROM imed.medhack_diagnosis_icd10 WHERE is_cancelled IS NOT TRUE;"
   ```
6. **Settings → Reset demo** → ทั้ง 2 database กลับไปสภาพข้อ 2 ล็อกอินไม่หลุด ทำซ้ำได้ไม่จำกัด

---

## 7. RAG: เลือก backend ของ LLM

แก้ใน `RAG/.env` — เลือกอย่างใดอย่างหนึ่ง

**(ก) Ollama — เร็ว แนะนำถ้ามี GPU** (ค่าใน `.env.example` ตั้งไว้ทางนี้)

```bash
# ติดตั้ง Ollama จาก https://ollama.com แล้ว
ollama pull hf.co/mradermacher/Llama-3.1-EIRAI-8B-i1-GGUF:Q4_K_M   # LLM การแพทย์ภาษาไทย ~5 GB
```
```ini
LLM_BACKEND=ollama
OLLAMA_BASE=http://localhost:11434
```

**(ข) transformers — ไม่ต้องลงอะไรเพิ่ม แต่ช้า** (รันในตัว process บน CPU)

```ini
LLM_BACKEND=transformers
LLM_MODEL=scb10x/llama3.2-typhoon2-1b-instruct
LLM_DEVICE=cpu
```

ทางนี้คำตอบหนึ่งครั้งใช้เวลาเป็นนาที (ฝั่ง medcode-api ตั้ง read timeout ไว้
600 วินาทีเผื่อไว้แล้ว) และครั้งแรกต้องโหลด weight ก่อน

มี GPU CUDA ก็ตั้ง `EMBED_DEVICE=cuda` / `LLM_DEVICE=cuda` เพิ่มได้

---

## 8. ตัวแปรสภาพแวดล้อมที่ใช้บ่อย

รันในเครื่องแบบ Homebrew ปกติ **ไม่ต้องตั้งอะไรเลย** ค่า default ถูกหมด
ตารางนี้ไว้ใช้ตอนย้ายเครื่อง/ขึ้น server

**medcode-api**

| ตัวแปร | ค่า default | ความหมาย |
|---|---|---|
| `DATABASE_URL` | `postgresql://…localhost:5432/medcode` | DSN แบบ libpq แปลงเป็น JDBC ให้เอง |
| `IMED_API_BASE` | `http://localhost:8003` | โรงพยาบาล (เปลี่ยนเป็นของจริงตอน production) |
| `IMED_API_TOKEN` | `imed-mock-token` | Bearer token ของ API เขียนฝั่งโรงพยาบาล |
| `RAG_API_BASE` | `http://localhost:8000` | บริการ RAG |
| `PORT` | `8001` | |
| `SWAGGER_ENABLED` | `true` (ใน Docker บังคับ `false`) | |
| `DEMO_TOOLS_ENABLED` | `true` (ใน Docker บังคับ `false`) | เปิด `POST /api/demo/reset` |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | `admin@medcodeai.demo` / `admin1234` | **เปลี่ยนก่อนขึ้นจริง** |
| `ALLOWED_ORIGINS` | `*` | CORS |

**imed-mock-api**

| ตัวแปร | ค่า default |
|---|---|
| `DATABASE_URL` | `postgresql://…localhost:5432/imed` |
| `PORT` | `8003` |
| `IMED_API_TOKEN` | `imed-mock-token` (ต้องตรงกับฝั่ง medcode-api) |

**RAG** — ดู `.env.example`: `PORT`, `LLM_BACKEND`, `OLLAMA_MODEL`, `EMBED_DEVICE`,
`TOP_K`, `CHUNK_SIZE`, `MAX_NEW_TOKENS`

**frontend** — `VITE_API_BASE_URL` (มี `/api` ต่อท้ายในตัว)

บน Windows PowerShell ตั้งค่าแบบนี้ก่อนสั่งรันในแต่ละ terminal:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:<password>@localhost:5432/medcode'
.\mvnw.cmd spring-boot:run
```

---

## 9. ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| seed แล้วเจอ `unrecognized configuration parameter "transaction_timeout"` หรือ `syntax error at or near "estrict"` | PostgreSQL ไม่ใช่เวอร์ชัน 18 — ดูหัวข้อ 2 |
| `Unable to locate a Java Runtime` | ยังไม่ได้ลง Java 21 (`brew install openjdk@21` แล้ว symlink / ตั้ง `JAVA_HOME`) |
| backend ตาย ตอน boot ด้วย error `password authentication` (SCRAM) | ไม่ได้ตั้ง `DATABASE_URL` (โดยเฉพาะบน Windows ที่ user เป็น `postgres` + มีรหัส) |
| กด Sync / Approve แล้ว 500 | imed-mock-api ไม่ได้รัน — approve/reopen/sync ยิง HTTP ไปโรงพยาบาลจริง ๆ |
| ไม่มี AI suggestion / หน้า Agent ค้าง | RAG ไม่ได้รัน หรือกำลังโหลดโมเดลรอบแรกอยู่ (ครั้งแรกช้าเป็นนาที) |
| กด Reset ได้ 409 "no demo baseline" | seed มาด้วยทาง B — ยิง `POST http://localhost:8001/api/demo/snapshot` (ใส่ Bearer token ของ admin) หนึ่งครั้งเพื่อแช่สภาพปัจจุบันเป็น baseline |
| Port 5173 ชนกัน | ใน repo `RAG` มี admin frontend ของตัวเอง (`RAG/frontend`) ที่ตั้ง port 5173 เหมือนกัน — ปกติไม่ต้องรัน เพราะหน้า **AI Training** ในเว็บหลักคุมงานเดียวกันผ่าน `/api/admin/knowledge/**` อยู่แล้ว ถ้าจะรันจริงให้สั่ง `npm run dev -- --port 5174` |
| `./mvnw` ไม่ทำงาน | `chmod +x mvnw` (Windows ใช้ `.\mvnw.cmd`) |
| `something already serves :8001` ตอนรัน dev.sh | มี medcode-api ค้างอยู่ — `lsof -tiTCP:8001 | xargs kill` |
| `imed-mock-api not found at …` ตอนรัน dev.sh | repo ไม่ได้วางเป็นพี่น้องกัน — `export IMED_DIR=/path/to/imed-mock-api` |
| หน้า **Analytics** ว่าง / ขึ้น error | ตั้งแต่ 2026-08-07 หน้านี้ใช้ข้อมูลจริงจาก `GET /api/analytics` แล้ว (ไม่มี mock ให้ fallback อีก) — ถ้าว่างแปลว่า backend ตอบไม่ได้ ดู log ของ :8001 |

---

## 10. รันเทสต์

```bash
cd ~/medcode/imed-mock-api && ./mvnw test    # ต้องมี db imed
cd ~/medcode/medcode-api   && ./mvnw test    # ต้องมี db ทั้งสอง + imed-mock-api รันอยู่ :8003
cd ~/medcode/RAG           && pytest -q      # ไม่ต้องโหลดโมเดล
cd ~/medcode/audit-chart-frontend && npm run lint
```

`CasesApiIntegrationTest` ของ medcode-api คือด่านตรวจความถูกต้องหลักของโปรเจกต์
— ยิง endpoint จริงทั้ง read/write/approve/reopen/reset โดยไม่ mock

---

## 11. เอกสารอ่านต่อ

| เรื่อง | ไฟล์ |
|---|---|
| สัญญา API ทุก endpoint | `medcode-api/docs/api-contract.md` + `docs/types.ts` |
| ศัพท์การแพทย์ที่ใช้ในโปรเจกต์ | `medcode-api/docs/medical-glossary.md` |
| การเชื่อมต่อกับ iMed จริง + คำถามค้างกับโรงพยาบาล | `medcode-api/docs/imed-integration.md` |
| runbook เดโม (ฉบับ Windows) | `imed-mock-api/DEMO-SETUP.md` |
| สเปก API ฝั่งโรงพยาบาล (generate จากโค้ด) | <http://localhost:8003/v3/api-docs.yaml> |
| บริบทสำหรับ AI assistant | `medcode-api/CLAUDE.md` |
