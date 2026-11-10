# MedCode AI — วิธีรันทั้งระบบแบบไม่ใช้ Docker

คู่มือนำระบบขึ้นตั้งแต่เครื่องเปล่าจนเปิดหน้าเว็บใช้งานได้จริง โดยรันแต่ละส่วน
เองใน terminal ของเครื่อง (ไม่ใช้ container)

> **มี Docker อยู่แล้ว?** ง่ายกว่ามาก — ใช้ `docker compose up` ตาม `README.md`
> ที่ root ของ repo (เว็บอยู่พอร์ต 8080, Postgres อยู่ 5433)
>
> เอกสารนี้เป็น "วิธีรัน" อย่างเดียว — สัญญา API อยู่ที่ `docs/api-contract.md`
> + `docs/types.ts` ของ `backend`

---

## 1. ระบบประกอบด้วยอะไรบ้าง

| ส่วน | โฟลเดอร์ | Port | ฐานข้อมูล | หน้าที่ |
|---|---|---|---|---|
| Backend หลัก | `backend/` | **8001** | `medcode` (schema `public`) | เจ้าของ API contract, auth, sync, approve/reopen, proxy ไป RAG |
| AI / Graph RAG | `ai/` | **8000** | ไม่มี (Chroma + graph บนดิสก์) | แนะนำรหัส ICD, AI Agent chat, คลังความรู้ (คู่มือ coding) |
| เว็บของ coder | `frontend/` | **5173** | — | UI ทั้งหมด (React + Vite) |
| ฐานข้อมูล | — | 5432 | `medcode` | PostgreSQL **18** |
| (ทางเลือก) Ollama | — | 11434 | — | รัน LLM บน GPU ให้ RAG เร็วขึ้นมาก |
| **API โรงพยาบาล (iMed)** | ไม่อยู่ใน repo นี้ | ตามที่ รพ. ให้ | — | **โรงพยาบาลเป็นคนสร้างและรันเอง** — ต้นทางข้อมูลเคส และปลายทางที่เราเขียนรหัสกลับไป |

ทิศทางการเรียก (เบราว์เซอร์คุยกับ medcode-api เจ้าเดียว):

```
เบราว์เซอร์ :5173
      │  Authorization: Bearer <token>
      ▼
medcode-api :8001 ──► API โรงพยาบาล (IMED_API_BASE)
      │                    (sync ดึงเคส / approve เขียนรหัสกลับ)
      ├──► DB medcode
      └──► RAG :8000 ──► (ทางเลือก) Ollama :11434
             /api/cases/{id}/suggest-codes, /api/agent/chat,
             /api/admin/knowledge/**  ← หน้า AI Training
```

**ขาดอะไรแล้วเป็นอย่างไร**

- ไม่มี **API โรงพยาบาล** → login และเปิดหน้าเว็บได้ แต่ sync / approve /
  reopen พัง และไม่มีเคสให้ดู (เคสทุกเคสมาจากการ sync)
- ไม่มี **RAG** → ระบบยังใช้ได้ แค่ไม่มี AI suggestion, หน้า Agent และหน้า Training ใช้ไม่ได้
- ไม่มี **frontend** → ยังยิง API ผ่าน Swagger `http://localhost:8001/swagger-ui.html` ได้

---

## 2. สิ่งที่ต้องติดตั้งก่อน (Prerequisites)

| ของ | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| **Java** | 21 | backend เป็น Spring Boot 4.1; `./mvnw` โหลด Maven ให้เอง ไม่ต้องลง Maven |
| **PostgreSQL** | **18 เท่านั้น** | ดูกล่องเตือนด้านล่าง — ใช้ 15/16/17 restore dump ไม่ผ่าน |
| **Node.js** | 20+ | สำหรับ frontend |
| **Python** | 3.11 หรือ 3.12 | สำหรับ RAG |
| Ollama | ล่าสุด | *ทางเลือก* — ถ้าไม่มีจะ fallback ไปรันโมเดลเล็กบน CPU (ช้ามาก) |

> ⚠️ **PostgreSQL ต้องเป็น 18** — ไฟล์ dump ถูก dump จาก 18.4 และมีคำสั่ง
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

## 3. Clone repo

```bash
git clone https://github.com/Occamy-medihack/cura-ai.git ~/cura-ai
```

```
~/cura-ai/
├── backend/              :8001  backend หลัก  ← เอกสารนี้อยู่ที่นี่
├── ai/                   :8000  AI
└── frontend/             :5173  เว็บ coder
```

---

## 4. เตรียมฐานข้อมูล (ทำครั้งเดียว)

```bash
cd ~/cura-ai/backend && scripts/seed_local_pg.sh   # สร้าง db medcode
```

ได้ database `medcode` ที่มี schema + catalog ICD แต่ **ยังไม่มีเคสและไม่มี user**
— ถูกต้องแล้ว: เคสมาจากการ sync จากโรงพยาบาล ส่วนบัญชี admin ถูกสร้างตอนแอป boot

> ⚠️ สคริปต์ seed **drop database ทิ้งแล้วสร้างใหม่** — งานที่ approve
> หรือแก้ไว้ในเครื่องหายหมด ใช้เป็นปุ่มรีเซ็ตได้ แต่อย่าเผลอรันตอนมีข้อมูลสำคัญ

ส่วนที่ไม่อยู่ใน dump (คอลัมน์ `password_hash`, การแตก `icd_codes` เป็น
`icd_10`/`icd_9`, บัญชี admin ฯลฯ) ถูกใส่ให้อัตโนมัติ **ตอน boot** โดย Flyway
และ `config/AdminBootstrap` ดังนั้น "seed ใหม่แล้วของหาย" แก้ด้วยการ
**สตาร์ทแอปใหม่** ไม่ใช่ไปแก้ไฟล์ dump

---

## 5. รันระบบ — 3 terminal (ใช้ได้ทุก OS)

ลำดับ: **RAG → medcode → frontend**

### Terminal 1 — RAG `:8000`

ครั้งแรกต้องสร้าง venv และลง dependency ก่อน:

```bash
cd ~/cura-ai/ai
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

> คลังความรู้ถูก index มาให้แล้วและ commit อยู่ใน `ai/data/` — **ไม่ต้อง ingest
> ใหม่** แต่ครั้งแรกที่เรียกใช้จริงจะดาวน์โหลดโมเดล embedding `BAAI/bge-m3`
> (~2 GB) จาก Hugging Face ก่อน ต้องต่อเน็ตรอบแรก

### Terminal 2 — Backend หลัก `:8001`

ต้องบอกที่อยู่ API ของโรงพยาบาล (โฮสต์อย่างเดียว ไม่ต้องมี `/api/v1`) และ
client id/secret ที่แอดมินของโรงพยาบาลออกให้:

```bash
cd ~/cura-ai/backend
export IMED_API_BASE=https://<โฮสต์-api-โรงพยาบาล>
export IMED_CLIENT_ID=<client-id>
export IMED_CLIENT_SECRET=<client-secret>
./mvnw spring-boot:run
```

เช็ก: <http://localhost:8001/api/healthz> · Swagger: <http://localhost:8001/swagger-ui.html>

**ทางลัด (macOS / Linux เท่านั้น):** `scripts/dev.sh` seed database ให้ถ้ายัง
ไม่มี แล้วรัน backend (ยังต้อง export ค่า `IMED_*` ข้างบนก่อน)

```bash
scripts/dev.sh          # seed ถ้ายังไม่มี → สตาร์ต :8001, Ctrl-C ปิด
scripts/dev.sh --seed   # บังคับ seed ใหม่ก่อน (ล้างข้อมูลในเครื่อง)
```

> 🪟 **Windows ใช้สคริปต์ `.sh` ไม่ได้** — ใช้คำสั่งในหัวข้อนี้ตรง ๆ
> (ตั้ง env ตามหัวข้อ 8, ใช้ `.\mvnw.cmd`) หรือรันผ่าน WSL / Git Bash

### Terminal 3 — เว็บ `:5173`

```bash
cd ~/cura-ai/frontend
npm install
npm run dev
```

เปิด <http://localhost:5173> — ไฟล์ `.env` มากับ repo อยู่แล้ว
(`VITE_API_BASE_URL=http://localhost:8001/api` — สังเกตว่ามี `/api` ต่อท้ายในตัว)

**ล็อกอิน:** `admin@medcodeai.demo` / `admin1234`

---

## 6. ทดสอบว่าใช้ได้จริง

1. เปิด <http://localhost:5173> ล็อกอินด้วยบัญชี admin ข้างบน
2. admin เปิดหน้า coding ไม่ได้ — ไปที่ **Accounts** สร้างบัญชี coder แล้ว
   ล็อกอินใหม่ด้วยบัญชีนั้น
3. Dashboard **ว่าง** — ถูกต้อง กด **Sync** เลือกช่วงวันที่ → เคสจาก API
   โรงพยาบาลเข้ามา
4. เปิดเคสหนึ่ง → มี AI suggestion โผล่ (ถ้าไม่มี RAG ช่องนี้จะว่าง แต่ที่เหลือใช้ได้ปกติ)
5. ติ๊กรหัส → **Approve** → เคสย้ายไป Finished และรหัสถูกเขียนกลับไปที่โรงพยาบาล

> **Reset demo** ล้างฝั่ง `medcode` ได้ แต่จากนั้นจะเรียก `/api/demo/reset`
> ของโรงพยาบาล ซึ่ง API จริงไม่มี → ได้ 500 หลังฝั่งเรา reset เสร็จแล้ว

---

## 7. RAG: เลือก backend ของ LLM

แก้ใน `ai/.env` — เลือกอย่างใดอย่างหนึ่ง

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

**medcode-api**

| ตัวแปร | ค่า default | ความหมาย |
|---|---|---|
| `DATABASE_URL` | `postgresql://…localhost:5432/medcode` | DSN แบบ libpq แปลงเป็น JDBC ให้เอง |
| `IMED_API_BASE` | `http://localhost:8003` | API ของโรงพยาบาล (โฮสต์อย่างเดียว) — **ต้องตั้งเสมอ** |
| `IMED_CLIENT_ID` / `IMED_CLIENT_SECRET` | — | แอดมินโรงพยาบาลออกให้ ใช้ขอ token ที่ `/auth/token` (ระบบต่ออายุ token ให้เอง) |
| `IMED_READ_TIMEOUT_SECONDS` | `60` | เวลารอคำตอบจาก API โรงพยาบาล (วินาที) |
| `RAG_API_BASE` | `http://localhost:8000` | บริการ RAG |
| `PORT` | `8001` | |
| `SWAGGER_ENABLED` | `true` (ใน Docker บังคับ `false`) | |
| `DEMO_TOOLS_ENABLED` | `true` (ใน Docker บังคับ `false`) | เปิด `POST /api/demo/reset` |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | `admin@medcodeai.demo` / `admin1234` | **เปลี่ยนก่อนขึ้นจริง** |
| `ALLOWED_ORIGINS` | `*` | CORS |

**RAG** — ดู `ai/.env.example`: `PORT`, `LLM_BACKEND`, `OLLAMA_MODEL`, `EMBED_DEVICE`,
`TOP_K`, `CHUNK_SIZE`, `MAX_NEW_TOKENS`

**frontend** — `VITE_API_BASE_URL` (มี `/api` ต่อท้ายในตัว)

บน Windows PowerShell ตั้งค่าแบบนี้ก่อนสั่งรันในแต่ละ terminal:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:<password>@localhost:5432/medcode'
$env:IMED_API_BASE = 'https://<โฮสต์-api-โรงพยาบาล>'
.\mvnw.cmd spring-boot:run
```

---

## 9. ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| seed แล้วเจอ `unrecognized configuration parameter "transaction_timeout"` หรือ `syntax error at or near "estrict"` | PostgreSQL ไม่ใช่เวอร์ชัน 18 — ดูหัวข้อ 2 |
| `Unable to locate a Java Runtime` | ยังไม่ได้ลง Java 21 (`brew install openjdk@21` แล้ว symlink / ตั้ง `JAVA_HOME`) |
| backend ตาย ตอน boot ด้วย error `password authentication` (SCRAM) | ไม่ได้ตั้ง `DATABASE_URL` (โดยเฉพาะบน Windows ที่ user เป็น `postgres` + มีรหัส) |
| กด Sync / Approve แล้ว 500 `iMed API not reachable` | API โรงพยาบาลไม่ตอบ หรือ `IMED_API_BASE` ผิด — sync/approve/reopen ยิง HTTP ไปโรงพยาบาลจริง ๆ |
| Sync แล้ว 401 | `IMED_CLIENT_ID` / `IMED_CLIENT_SECRET` ผิด — ขอคู่ใหม่จากแอดมินโรงพยาบาล |
| ไม่มี AI suggestion / หน้า Agent ค้าง | RAG ไม่ได้รัน หรือกำลังโหลดโมเดลรอบแรกอยู่ (ครั้งแรกช้าเป็นนาที) |
| `./mvnw` ไม่ทำงาน | `chmod +x mvnw` (Windows ใช้ `.\mvnw.cmd`) |
| `something already serves :8001` ตอนรัน dev.sh | มี medcode-api ค้างอยู่ — `lsof -tiTCP:8001 | xargs kill` |
| หน้า **Analytics** ว่าง / ขึ้น error | หน้านี้ใช้ข้อมูลจริงจาก `GET /api/analytics` — ถ้าว่างแปลว่า backend ตอบไม่ได้ ดู log ของ :8001 |

---

## 10. รันเทสต์

```bash
cd ~/cura-ai/backend && ./mvnw test   # ต้องมี db medcode + API โรงพยาบาลที่ IMED_API_BASE
cd ~/cura-ai/ai                  && pytest -q     # ไม่ต้องโหลดโมเดล
cd ~/cura-ai/frontend            && npm run lint
```

`CasesApiIntegrationTest` ของ medcode-api ยิง endpoint จริงทั้ง read/write/
approve/reopen/reset โดยไม่ mock — เทสต์ฝั่งเขียนจะเขียนข้อมูลลง API โรงพยาบาล
จริง จึงควรรันกับ server ทดสอบของโรงพยาบาลเท่านั้น

---

## 11. เอกสารอ่านต่อ

| เรื่อง | ไฟล์ |
|---|---|
| สัญญา API ทุก endpoint | `backend/docs/api-contract.md` + `docs/types.ts` |
| ศัพท์การแพทย์ที่ใช้ในโปรเจกต์ | `backend/docs/medical-glossary.md` |
| การเชื่อมต่อกับ iMed + คำถามค้างกับโรงพยาบาล | `backend/docs/imed-integration.md` |
| บริบทสำหรับ AI assistant | `backend/CLAUDE.md` |
