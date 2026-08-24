# What it actually takes to run this in production

*MedCode AI · production-readiness checklist · 2-minute pitch segment · 2026-08-24*

Not a demo on a laptop — a system a hospital coder logs into on a Monday
morning, that writes real codes into iMed, and that can be recovered on a bad
day. **The software is built.** Everything below is what stands between a
working build and a production service, and most of it needs the hospital's IT
team rather than ours.

|  |  |
|---|---|
| Environments needed | **3** — dev, staging, production |
| Machines | **2 servers + 1 GPU** |
| Answers that block go-live | **3** 🔴 |
| Items | **28** (23 need the hospital) |
| Time on stage | **2:00** — three blocks, forty seconds each |

Status key: 🟢 ours to build · 🟡 waiting on input · 🔴 blocks go-live

---

## The route from build to first real patient

| # | Phase | Gate to clear it |
|---|---|---|
| 01 | **Access** | We can reach a machine and your test iMed. |
| 02 | **Staging** | A coder signs in with their hospital account and opens a case. |
| 03 | **UAT** | An approval we make lands in iMed and you can see it there. |
| 04 | **Validation** | Coding supervisor and security team both sign off. |
| 05 | **Pilot** | A full week of real coding with no rollback. |

**The critical path is not our build.** Phases 3 and 4 cannot start until three
questions come back from the hospital — marked 🔴 below. Our work in each phase
is measured in days; the calendar is set by how fast those answers and that
hardware arrive.

---

## 0:00 – 0:40 · Getting in: identity, network, environments

> **Say:** "In production nobody shares a login and nothing is reachable by
> accident. That means your sign-on, your certificates, and three environments
> instead of the one we demo on."

**Today the app signs people in with email and password** — hashed credentials,
server-side sessions, seven-day expiry, login rate limiting
(`src/main/java/com/medcodeai/api/service/AuthService.java`). That is honest
demo-grade auth. Production means your identity provider, so a coder who leaves
the hospital loses access the same hour without anyone remembering to tell us.

- [ ] 🟡 **Sign-on through your identity provider** — *Hospital.* Which one
      (Entra ID, AD FS, Google Workspace, Keycloak), plus its metadata XML and
      signing certificate. Ask outright whether they issue **SAML 2.0 or OIDC**:
      Microsoft now recommends OIDC for new applications while continuing to
      support SAML with no announced retirement, so an Entra hospital may hand us
      either. Cheaper to ask than to build the wrong one.
- [ ] 🟡 **Roles, and the coder's hospital ID** — *Both.* A group claim we map to
      *coder* or *admin*. The same claim can carry the iMed employee ID
      (`coder_eid`) we already need to stamp on every write-back — one decision
      fixes both who may approve and whose name appears in your records.
- [ ] 🟡 **Certificate renewal, and a way back in** — *Both.* Who renews the
      signing certificate before it expires — an expired certificate locks out
      every coder at once — and one local admin account that still works when
      sign-on is down.
- [ ] 🟡 **Hostname, DNS and TLS certificate** — *Hospital.* The address coders
      type. It also pins which sites may call the API: `ALLOWED_ORIGINS` defaults
      to `*` in the demo build, which is fine on a laptop and unacceptable on a
      hospital network.
- [ ] 🟡 **Firewall openings, both directions** — *Hospital.* Outbound from our
      server to the iMed API, inbound from staff browsers to the app. If there is
      no route to the internet at all we bake the AI models into the image
      (`PREFETCH_EMBED_MODEL=1`) — but that is a build decision we need before,
      not after.
- [ ] 🟢 **Three environments, not one** — *Ours.* Development, staging and
      production: separate databases, separate sign-on registrations, separate
      hostnames. `SWAGGER_ENABLED` and `DEMO_TOOLS_ENABLED` on in staging, off in
      production; every default password replaced before either is reachable.
      Without a staging copy there is nowhere to rehearse an upgrade.
- [ ] 🟡 **Secrets in a store, with named owners** — *Both.* The iMed token, the
      database password and the signing certificate belong in a secret store, not
      a settings file on the server. Each needs a person responsible for rotating
      it and an interval agreed up front.
- [ ] 🟡 **Security review before it is reachable** — *Hospital.* A vulnerability
      scan and, ideally, a penetration test — even for a system reachable only
      from inside the hospital. Your security team's sign-off is a gate in the
      schedule, not a formality at the end.

---

## 0:40 – 1:20 · Earning the right to touch real records

> **Say:** "Connecting to your real iMed is one address and one token.
> Everything else in this block is what has to be true before we're allowed to
> use it on a real patient."

**The hospital connection is already written as a contract** — six ways we read
visits (R1–R6), four ways we write approved codes back (W1–W4) — and we built a
faithful stand-in server against it, *including its refusals*. So the cutover
really is one setting. What is missing is your reference data, and three answers
we cannot invent.

- [ ] 🟡 **API address and access token** — *Hospital.* Test system first,
      production second. On our side it is `IMED_API_BASE` plus a token — no code
      change, no rebuild, no separate release.
- [ ] 🔴 **Who serves the read feeds in production** — *Hospital.* The
      specification we were given covers writing codes back, not reading visits
      out. We read eleven feeds — diagnoses, procedures, labs, drugs, vitals and
      the rest. Something has to serve those live, and right now nothing does.
      *(open question 8)*
- [ ] 🔴 **Your reference ID lists** — *Hospital.* The real IDs behind visit type,
      diagnosis type, operation type and discharge status. We write against
      documented placeholders today; they slot in as settings, but must be right
      before one real code is saved — a wrong ID writes a wrong record silently.
      *(open question 2)*
- [ ] 🔴 **How coding approval meets discharge** — *Hospital.* The write
      specification expects a discharge object on every submission, but coding is
      approved *after* the patient is discharged. Does our write update that
      record, echo it back, or get rejected by it? The single biggest unknown in
      the project. *(open question 3)*
- [ ] 🟡 **How coders are identified in iMed** — *Both.* Does each coder get a
      hospital employee ID we stamp on their approvals, or does everything go in
      under one system account? It decides whether your records can tell who
      coded what — an audit question, not a technical one. *(open question 4)*
- [ ] 🟡 **Starter data set and reference catalogues** — *Hospital.* A
      de-identified extract to rehearse on — we run on 110 visits today, 100 OPD
      and 10 IPD. Plus your ICD-10 and ICD-9 catalogues marked by edition
      (WHO / TM / CM), and the coding manuals as PDFs so the assistant answers
      from your rulebook rather than a generic one. *(open question 13)*
- [ ] 🟡 **Volume, history and residency** — *Both.* Visits per day, how far back
      we backfill, and where patient data may physically sit. Volume sets both
      database sizing and batch sizes — the contract caps each request at 20 visit
      IDs or a 31-day window, and we respect those rather than working around them.
- [ ] 🟡 **Audit trail retention** — *Hospital.* Who approved which code, when,
      and against which AI suggestion. That record sits in our database with no
      retention rule attached. Your medical-records policy sets the period; we
      implement it.
- [ ] 🟡 **Data protection paperwork** — *Hospital.* Processing agreement, records
      of processing, and an impact assessment covering the AI component.
      Thailand's PDPC put a **healthcare-sector guideline** out for public
      consultation this year — it adds no new legal obligations but shows exactly
      how hospitals will be supervised, so aligning now costs less than
      retrofitting.
- [ ] 🟡 **Clinical accuracy sign-off** — *Both.* Before anyone trusts a
      suggestion, we run the AI across visits your coders have already coded and
      compare. Your coding supervisor signs off on the result. This is the item
      that decides whether the product is useful at all — and it cannot be done
      without your historic data.

Full list of open questions: `imed-integration.md` §Open questions for the
hospital.

---

## 1:20 – 2:00 · The machines, and keeping them up

> **Say:** "Two ordinary servers and one graphics card. The interesting part
> isn't buying them — it's the backup you've actually restored and the person
> who gets called when a sync fails."

**The AI service is optional by design.** Nothing else depends on it. Switched
off you lose code suggestions, the assistant and the training page — syncing
visits, editing codes and approving back into iMed keep working. That is
deliberate: a GPU delay never delays go-live.

- [ ] 🟢 **Application server — 4 cores, 8 GB** — *Ours to spec.* Runs the
      dashboard, the API and the hospital connector. One instance and never two:
      it holds the write lock (`WriteGate`) and cases cache (`CasesCache`) in
      memory, so a second copy would corrupt approvals rather than share load.
- [ ] 🟡 **Database — PostgreSQL 18.6 or newer** — *Hospital.* Major version 18
      specifically; 15/16/17 fail partway through restoring our dumps
      (`\restrict`, `transaction_timeout`). Install **18.6** (2026-08-13), not the
      18.4 our dumps were taken on — 18.4 itself closed 11 security issues, and
      running a superseded version in a hospital is a finding waiting to happen.
      Note 18.5 was pulled and never shipped. Two databases on one server:
      `medcode` and the `imed` mirror.
- [ ] 🟡 **GPU — 24 GB, and it stays in your building** — *Both.* Runs a Thai
      medical language model (Eir-8B, Q4_K_M via Ollama) alongside the bge-m3
      retrieval model. The model itself needs roughly 4–6 GB plus 20–30% for
      KV-cache and framework overhead, so **24 GB is headroom for several coders
      at once, not a floor**. An NVIDIA **L4 (24 GB)** is the sweet spot; L40S
      (48 GB) and RTX PRO 6000 Blackwell (96 GB) are real but oversized for one
      8B model. 16 GB works. CPU-only runs correctly but slowly enough that
      coders will notice.
- [ ] 🟢 **Storage — about 10 GB fixed, plus your data** — *Ours to spec.* Model
      weights and container images ≈ 10 GB and do not grow. Search index and
      uploaded manuals start under 100 MB (42 MB today). The database is sized
      from your visit volume. Backups go on separate hardware, or they are not
      backups.
- [ ] 🟡 **Where it runs — and the catch** — *Hospital.* Google Cloud opened a
      **Bangkok region (`asia-southeast3`) on 2026-01-21** with three availability
      zones, so in-country hosting is now genuinely available for the dashboard
      and database. **But Bangkok lists no GPUs** — the nearest are Singapore
      (`asia-southeast1`: L4/G2, A2, A3, A4), which makes the AI tier a
      cross-border transfer, governed by PDPA transfer rules for which the PDPC
      has published no adequacy list. So: app and database either place, GPU
      on-site. (Build `linux/amd64`; keep `max-instances=1` either way.)
- [ ] 🟡 **Backup and recovery, with numbers on it** — *Both.* A nightly copy is
      not a recovery plan until a restore has been timed. Agree how much data may
      be lost (RPO) and how long we may be down (RTO), rehearse the restore
      against those numbers, and write down what it actually took.
- [ ] 🟡 **Monitoring, and who gets called** — *Both.* Every write to the hospital
      is already recorded in `imed_write_ops` — but recording is not alerting.
      Decide who is notified when a sync fails or an approval does not reach iMed,
      and where that alert lands outside working hours.
- [ ] 🟡 **Patch cadence** — *Both.* Database, base images, Java runtime. Agree
      who applies security updates and how quickly, before the first vulnerability
      lands rather than during it.
- [ ] 🟢 **Availability without replicas** — *Ours.* Because the API cannot run as
      a second copy, uptime comes from fast restart and health checks rather than
      from adding servers. Agree the maintenance window, the restart procedure,
      and what a coder sees on screen while it happens.
- [ ] 🟢 **Rehearsal on your hardware, then a pilot** — *Ours.* 65 automated
      checks (46 + 19) re-run on the real machines, not our laptops. Then a small
      group of coders working alongside the current process rather than replacing
      it, with a way back, and someone named to train the team.

---

## What it really takes, in one sentence

Three environments, two servers and a graphics card that stays in your building,
your reference data — and three answers only your team can give.

The build is done and the hospital connection is already written as a contract,
so the cutover itself is one setting. Every remaining week on the calendar
belongs to hardware, sign-off and those three answers — which is why we are
asking for them now rather than at the end.

---

## Checked against current sources — 2026-08-24

- Google Cloud's Bangkok region and its GPU gap —
  [launch announcement, 2026-01-21](https://www.googlecloudpresscorner.com/2026-01-21-Google-Cloud-Launches-New-Cloud-Region-in-Thailand,-Bolstering-its-Commitment-to-Advancing-the-Countrys-AI-Driven-Digital-Economy),
  [GPU regions and zones](https://docs.cloud.google.com/compute/docs/gpus/gpu-regions-zones)
- PostgreSQL 18.6 and the pulled 18.5 —
  [release notes](https://www.postgresql.org/docs/release/),
  [endoflife.date/postgresql](https://endoflife.date/postgresql)
- SAML still supported, OIDC recommended for new apps —
  [Microsoft Entra SSO protocol decision guide](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/saml-vs-oidc-decision-guide)
- PDPA cross-border transfer and the draft healthcare guideline —
  [PDPC healthcare guideline consultation](https://www.hlc.com/en/publications/thailand-pdpc-consults-on-first-healthcarespecific-data-protection-guideline),
  [Chambers: Data Protection & Privacy 2026, Thailand](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/thailand/trends-and-developments)

Worth revisiting separately, not a checklist item: our default generation model
is Eir-8B, a Llama-3.1 derivative. SCB 10X's **Typhoon 2** line now ships Thai
models built on Gemma 3 and Qwen 3 in sizes from 1B to 30B. Worth a bake-off
against your own coding manuals before go-live — the swap is one environment
variable (`OLLAMA_MODEL`), not a rebuild.
