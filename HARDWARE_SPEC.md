# HARDWARE_SPEC.md — MediHack Extension infrastructure

*Prepared 2026-09-21 (sections 0, the resource profile, VAT totals, 6.1 and 6.2 added 2026-09-23), from the repos as they exist today (CURA AI: `medcode-api`,
`imed-mock-api`, `audit-chart-frontend`, `RAG`, `medcode-stack`) plus
`medcode-api/docs/DEPLOYMENT-PREP.md` (the team's own production checklist, 24 Aug
2026). Where the prompt's template asked for something not in any repo or doc, it is
listed under **Open Questions** instead of guessed.*

## 0. Read this first

- **Every price is indicative.** Figures are rough ranges from public listings
  (checked 21 Sep 2026, converted at ~33 THB/USD, before VAT and reseller
  markup), not quotes. Thai government e-bidding requires a formal price
  survey (สืบราคา) from at least three vendors before any line becomes a TOR.
  Treat the totals as an envelope to seek approval for.
- **Specifications are vendor-neutral**, written as minimum capabilities.
  Where a product is named (e.g. "NVIDIA L4") it is a sizing reference only;
  the TOR wording should be "or equivalent meeting the stated capabilities".
- **The GPU stays inside the hospital.** That is a PDPA consequence, not a cost
  optimisation: Bangkok has no cloud GPUs, and the nearest region
  (Singapore) would send patient text across a border Thai law controls
  (§4). It is the single fact that drives the AI-compute line.
- **The AI is optional by design.** With no GPU at all, coders can still sync,
  code, approve and write back; only suggestions, the chat and AI Training
  stop. A late GPU never delays go-live.

## 1. Project (as given, gaps marked)

| Field | Value |
|---|---|
| Name | MediHack Extension – from hackathon ideas to working prototypes |
| Owner | School of Applied Digital Technology, Mae Fah Luang University |
| Goal | develop **[OPEN — see Q1]** digital health prototypes, piloted at the university medical center |
| Target maturity | **TRL 4**, confirmed by the team's own report (`report/07-results.md`, `08-conclusion.md`) — "tested as a whole in a lab-like setting, not yet on real patients." IP outputs: **[OPEN — see Q2]** |
| Duration | **[OPEN — see Q3]** |

## 2. Prototype covered by this spec

Only **one** working prototype exists in the repos: **CURA AI**, a medical-coding
audit dashboard.

| Field | Value |
|---|---|
| Name / function | CURA AI (team Suvarna Stack) — pulls a hospital visit, an AI suggests ICD-10/ICD-9 codes, a coder reviews and approves, approved codes write back to the hospital system |
| Type | Web app (React SPA + Spring Boot API) + AI microservice (retrieval-augmented generation) |
| AI use | **Inference only**, no training. Generation model: `Llama-3.1-EIRAI-8B-i1-GGUF:Q4_K_M` (8B params, 4-bit quantized) via Ollama. Embedding/retrieval model: bge-m3 (HuggingFace `transformers`), CPU-only in the container. |
| Users | Hospital medical coders (roles: coder, admin). Headcount: **[OPEN — see Q4]** |
| Peak concurrent | Load-tested at **50 simultaneous clients, zero failed requests** (`report/06-testing-evaluation.md`). Real hospital concurrency is explicitly flagged as **unverified** by the team's own report (`08-conclusion.md`, item 7) |
| Integration | Hospital HIS/EMR via the "iMed" API — built and run by the hospital (our same-contract mock was retired 2026-11-10); connecting to it is a one-setting change (`IMED_API_BASE`) |

If the hackathon program includes two more prototypes from other teams, this document
does not cover them — nothing about them exists in this codebase (Q1).

### Resource profile the sizing is based on

| Workload | Figure | Source |
|---|---|---|
| Generation model: Llama-3.1-EIRAI-8B, 4-bit (Q4_K_M), via Ollama | ~4–6 GB VRAM, plus ~25% while working | `DEPLOYMENT-PREP.md` §3 |
| Embedding model: `BAAI/bge-m3` | ~2.3 GB on disk; runs on CPU inside the `rag` container | `docker-compose.yml`, `.env.example` |
| Whole stack on one machine (2 JVMs, PyTorch, nginx, Postgres) | ≥4 GB RAM for Docker; 6 GB if the 8B model runs on the same machine | `medcode-stack/README.md` |
| App server | 4 cores, 8 GB RAM; **one instance only** (in-memory write lock and cache) | `DEPLOYMENT-PREP.md` §3 |
| Program + AI model files | ~10 GB, fixed; the database grows with visit volume | `DEPLOYMENT-PREP.md` §3 |
| Load tested (read path, one machine) | 50 concurrent clients, 2,000 requests, 0 failures, p95 19 ms | `eval-results/perf/` |
| Not measured | AI suggestion latency; several coders writing at once | report Ch.6 §6.4 |

**What the numbers mean for buying:** the model fits a 16 GB card with room
to spare; 24 GB buys headroom for several coders at once, not a minimum. The
app server is a scale-up box, never a cluster.

## 3. Team & environment

| Field | Value |
|---|---|
| Developers | Team of **5**, School of Applied Digital Technology: Guntidamas Sangsawat (DTBI), Aung Kyaw Si (Software Engineering), Zwe Thura Aung (Software Engineering), Phyo Wai Yan Lin Zaw (Software Engineering), Xin Li (DTBI). How many continue past the hackathon, and so need a development laptop, is still **[OPEN — see Q5]** |
| Hackathon teams continuing | **[OPEN — see Q6]** |
| On-site equipment at the hospital | **None found in the repo.** The product is a browser-based SPA — coders use it from their existing hospital workstation, no tablet/kiosk/sensor exists in the code. Confirm those workstations meet the browser requirement (any modern Chrome/Edge/Firefox; no special hardware) — **[OPEN — see Q7]** |

## 4. Constraints (from the repos)

- **Patient data must stay on-premise where PDPA requires it.** The team's own analysis
  (`DEPLOYMENT-PREP.md` §3, sourced 24 Aug 2026): Google Cloud opened a Bangkok region in
  Jan 2026, so the **app and database** can legally run in-country on GCP *or* on-prem —
  but **Bangkok has no GPUs**; the nearest GPU region is Singapore, and sending patient
  data there crosses a border Thai law controls with no approved-country list published
  yet. Conclusion already reached by the team: **the GPU stays physically inside the
  hospital**; app/DB placement is still open.
- **Budget (THB):** **[OPEN — see Q8]**
- **Hosting (server room / cloud / hybrid):** partially decided — GPU is on-prem
  (above); app/DB direction was "GCP, three containers" as of 21 Jul 2026
  (`medcode-api/README.md`) but `DEPLOYMENT-PREP.md` (24 Aug 2026, later) reopens it to
  "either place." Final call: **[OPEN — see Q9]**
- **Procurement:** Thai government e-bidding — every line below is written by spec
  (cores/RAM/VRAM), not by brand, per that requirement. Named products (e.g. "NVIDIA L4")
  appear only as a sizing reference, not a required brand.
- **Deploy by:** **[OPEN — see Q10]** (distinct from the 23 Sep 2026 report deadline)
- **Single-instance backend:** `medcode-api` keeps its write-lock and cache in process
  memory and must never run as more than one instance (`max-instances=1` if on Cloud
  Run) — this shapes the app server spec below; it is a scale-up, not scale-out, box.

## 5. Hardware, grouped

Costs are **rough market ranges converted to THB at ~33 THB/USD**, from public listings
checked 2026-09-21 (sources at the bottom) — **not vendor quotes**. Thai reseller markup,
import duty and VAT (7%) are not included. Get 3 quotes before the e-bidding TOR is
finalized, per standard practice under the Government Procurement and Supplies
Management Act B.E. 2560 (2017).

### 5.1 Development

| Item | Specs | Qty | Est. cost (THB) — Minimum | Est. cost (THB) — Recommended | Justification |
|---|---|---|---|---|---|
| Developer workstation/laptop | ≥16 GB RAM, ≥6-core CPU, ≥512 GB SSD (runs Docker Compose: 2 JVMs + Postgres + nginx + a PyTorch process locally, per `medcode-stack/README.md`) | **[OPEN — see Q5]** (one per active developer) | ~30,000/unit | ~45,000/unit (better CPU, faster local Ollama testing) | Every repo builds and runs fully containerized; devs need enough RAM to run the whole stack (compose docs say give Docker itself ≥4 GB, ≥6 GB with a local 8B Ollama model) |
| Staging environment | Same container images as production, smaller/shared hardware | 1 (shared) | 0 (run on a spare dev machine or a VM on the pilot server) | Dedicated small VM/host | `DEPLOYMENT-PREP.md` step 2 requires a staging copy before any real-patient step; the team's own "three copies, not one" rule (build / test / real) |

### 5.2 AI compute

| Item | Specs | Qty | Est. cost (THB) — Minimum | Est. cost (THB) — Recommended | Justification |
|---|---|---|---|---|---|
| GPU card | 16 GB VRAM minimum | 1 | ~65,000–85,000 (e.g. class of card below L4) | — | `DEPLOYMENT-PREP.md` §3: the running model needs ~4–6 GB VRAM +~25% headroom; 16 GB "also works" per the team |
| GPU card (recommended) | 24 GB VRAM | 1 | — | ~85,000–120,000 (e.g. NVIDIA L4-class card) | Team's own sizing: 24 GB is headroom for several coders concurrently, not a hard minimum; L4-class named as "the right size," bigger cards called unnecessary for this workload |
| GPU host chassis | PCIe slot + PSU capacity for the card above; can be one of the two servers in 5.3 if it has a spare slot | 1 | included in server cost | included in server cost | The GPU must live in a physical box inside the hospital (Constraint, §4) |
| **No GPU at all** is a valid fallback | — | — | 0 | — | The team designed AI as optional-by-design: suggestions/chat/training pause, everything else (loading visits, editing, approving, write-back) keeps working |

### 5.3 Pilot hosting (the two servers `DEPLOYMENT-PREP.md` calls for)

| Item | Specs | Qty | Est. cost (THB) — Minimum | Est. cost (THB) — Recommended | Justification |
|---|---|---|---|---|---|
| App server | 4 cores, 8 GB RAM (team's own spec, `DEPLOYMENT-PREP.md` §3) | 1 | 0 — reuse spare hospital capacity if available (team flags this as worth checking first) | ~100,000–135,000 (new enterprise 1U server: ECC RAM, redundant PSU, remote management) | Runs the dashboard, the API, and the iMed link. Must stay a single instance — this is a scale-up box, not a cluster |
| Database server | PostgreSQL **18.6 or newer specifically** (15–17 fail loading this system's data, per the team's own testing — 18.5 was cancelled and never released) | 1 | 0 — reuse spare capacity | ~100,000–135,000 (same class as app server; separate box so a DB failure doesn't take the app down too) | Hosts both the `medcode` and hospital-mirror `imed` databases |
| Backup storage | Separate physical hardware from the two servers above (NAS or backup appliance) | 1 | ~25,000 (small NAS, 2–4 TB) | ~50,000+ (redundant NAS, larger capacity, offsite-capable) | Team's own rule: "copying every night is not a plan until someone has restored one and timed it... on different hardware, or they are not backups" |
| Disk (app+AI images) | ~10 GB fixed (program + AI models), does not grow | included above | included above | included above | `DEPLOYMENT-PREP.md` §3. Database disk on top of this scales with hospital visit volume — **[OPEN — see Q11]** |

### 5.4 End-user / on-site devices

| Item | Specs | Qty | Est. cost (THB) | Justification |
|---|---|---|---|---|
| Tablets / kiosks / sensors | — | 0 | — | None exist in the current implementation. The product is a browser-based SPA used from the hospital's own coder workstations — no new end-user hardware identified. Confirm existing workstations are adequate: **[OPEN — see Q7]** |

## 6. Total (excluding open items priced 0/unknown)

| Scenario | Rough total (THB) |
|---|---|
| Minimum (reuse spare hospital servers, 16 GB GPU, small NAS, no new dev laptops) | ~120,000–140,000 |
| Recommended (new pilot servers, 24 GB GPU, redundant NAS; developer laptop count still open) | ~360,000–440,000 + (developer laptops × Q5) |

| **Minimum incl. VAT 7%** | ~128,400–149,800 |
| **Recommended incl. VAT 7%** | ~385,200–470,800 + (developer laptops × Q5) |

Both totals exclude every item marked **[OPEN]** below, since pricing those would be
guessing, not estimating.

**Recurring costs** are power, backup storage and staff time for updates. The
software has no per-code, per-user or cloud fee: the models are open and run
on the hospital's own card, so the running cost does not grow with coding
volume (`DEPLOYMENT-PREP.md`, "What it costs"). Power is not priced here
because the GPU's duty cycle is unmeasured.

### 6.1 What separates Minimum from Recommended

| | Minimum buys | Recommended adds |
|---|---|---|
| **AI compute** | One 16 GB GPU: the model fits with headroom | A 24 GB GPU: several coders at once, or a larger Thai model if accuracy needs it |
| **Hosting** | Reuse spare hospital server capacity | Dedicated app and database servers (ECC, redundant power), so a database failure cannot take the app down with it |
| **Backup** | A small NAS | A redundant NAS, able to go offsite |
| **Staging** | A VM on the pilot hardware | A dedicated small host, so updates are rehearsed before they reach coders |

**If only one upgrade above Minimum is affordable, choose the dedicated
staging environment.** The team's own checklist makes "three copies, not one"
(build, test, real) a precondition for touching real patient records.

### 6.2 Explicitly excluded

Named so nobody assumes they are covered: software development and hospital
integration work; single sign-on setup with the hospital's identity provider;
network cabling, firewall rules and TLS certificates; coder workstations
(the product runs in their existing browser, Q7); staff training; extended
warranty beyond the vendor's standard term; and PDPA compliance work (DPIA,
data processing agreement), which is procedural, not hardware.

## 7. Open questions

Only the hospital, the university, or the project's own leadership can answer these —
none of them are answerable from the code.

1. **How many prototypes does this hardware spec need to cover?** The repos contain
   exactly one working system (CURA AI). The hackathon template names 3. If two more
   exist elsewhere, their hardware needs are not in this document.
2. Does the target maturity include specific **intellectual property outputs** (patent
   filing, disclosure, licensing plan)? Not mentioned in any repo.
3. **Project duration in months** — not stated anywhere in the codebase or reports.
4. **Coder headcount** at the pilot hospital — `DEPLOYMENT-PREP.md` itself lists "visits
   per day" and "how many coders" as open hospital questions (§2), unanswered as of the
   report.
5. **Confirmed developer count** continuing past the hackathon, to size the laptop line
   item (§5.1).
6. **How many hackathon teams continue** into this extension phase.
7. Are the hospital's **existing coder workstations** (browser version, network access)
   already adequate, or is there a workstation refresh needed too?
8. **Total budget in THB** — not stated anywhere.
9. **Final hosting decision**: GCP (app/DB) + on-prem GPU, or fully on-prem for
   everything. `DEPLOYMENT-PREP.md` (24 Aug 2026) reopened a decision the README had
   called settled a month earlier (21 Jul 2026) — worth explicitly re-confirming with
   whoever owns that call now.
10. **Target deploy date** — distinct from the 23 Sep 2026 report submission date.
11. **Expected visit volume / data retention window**, which sets database disk size —
    listed as an open hospital question in `DEPLOYMENT-PREP.md` §2 ("how much, how old,
    how long") and still unanswered there as of the report.
12. Whether the hospital already has **spare server capacity** that removes the two
    servers from the shopping list entirely — the team's own checklist says this is
    "worth checking first" and has not been checked yet.

## 8. Pricing basis (checked 2026-09-21)

- NVIDIA L4 24GB — purchase price ~US$2,500–3,500 as of Sep 2026: [NVIDIA L4 GPU: Price, Specs & Cloud Pricing Guide (2026)](https://jarvislabs.ai/blog/l4-gpu-price), [NVIDIA L4 Price & Specs 2026 – Buy vs Rent](https://gpucost.org/gpu/l4)
- Entry-level new rack server (single CPU, modest RAM) — ~US$2,000–3,000 for small-business grade; enterprise-grade (redundant PSU, remote mgmt) trends higher: [Best Rack Servers for Small Business 2026](https://allofficesmarts.com/blogs/tips/best-rack-servers-for-small-business-2026), [Rackmount Servers - Rack Servers from 1U to 5U](https://www.broadberry.com/rackmount-servers)
- Thai public procurement framework — Government Procurement and Supplies Management Act B.E. 2560 (2017): [Q&A: public procurement in Thailand — Lexology](https://www.lexology.com/library/detail.aspx?g=ea0f1bf9-433f-4ebe-83fc-910cd7ca4202)
- PostgreSQL version requirement, GPU sizing, on-prem-vs-cloud decision, server specs, backup rule, "10 GB fixed" disk figure — all from the team's own `medcode-api/docs/DEPLOYMENT-PREP.md` (24 Aug 2026), not web-sourced.
