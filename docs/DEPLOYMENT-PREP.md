# Deployment prep — what we need before go-live

*MedCode AI · 2-minute pitch segment · 2026-08-24*

Everything here is a **handover item**: a setting, an answer, or a machine.
The build is done — these are the things only the hospital's IT team can give
us. Three blocks, forty seconds each.

|  |  |
|---|---|
| Time on stage | **2:00** |
| Items | **19** |
| Need the hospital | **15** |
| Block go-live | **3** 🔴 |

Status key: 🟢 ours to build · 🟡 waiting on input · 🔴 blocks go-live

---

## 0:00 – 0:40 · Login, domains, and a staging copy

> **Say:** "We plug into your existing sign-on. We need your identity
> provider's details, one hostname, and a second copy of the system to
> rehearse on."

**Today the app signs people in with email and password** — hashed
credentials, server-side sessions, a seven-day expiry and login rate limiting
(`src/main/java/com/medcodeai/api/service/AuthService.java`).
SAML replaces the sign-in step only. Roles, sessions and the approval audit
trail stay exactly as built.

- [ ] 🟡 **Identity provider details** — *Hospital.* Which one (Entra ID, AD FS,
      Google Workspace, Keycloak), plus its metadata XML and signing
      certificate. We hand back the entity ID and reply URL for you to register.
- [ ] 🟡 **Which claims we receive** — *Both.* Email or employee ID as the
      identifier, plus a group claim we map to *coder* or *admin*. The same
      claim can carry the iMed employee ID we already need to stamp on
      write-backs — one decision solves two problems.
- [ ] 🟡 **Certificate renewal and a way back in** — *Both.* Who renews the
      signing certificate before it expires, and one local admin account that
      still works if sign-on is down.
- [ ] 🟡 **Hostname, DNS and TLS certificate** — *Hospital.* The address coders
      will type. It also pins the browser allowlist — `ALLOWED_ORIGINS`
      currently defaults to `*`, which is fine for a demo and not for a
      hospital.
- [ ] 🟡 **Firewall openings** — *Hospital.* Outbound from our server to the
      iMed API, inbound from staff browsers to the app. If the network has no
      internet access at all, we ship the AI models inside the image
      (`PREFETCH_EMBED_MODEL=1`) instead of downloading them.
- [ ] 🟢 **A staging environment that mirrors production** — *Ours.* Its own
      hostname, its own database, its own sign-on registration.
      `SWAGGER_ENABLED` and `DEMO_TOOLS_ENABLED` stay on in staging and off in
      production, and every default password is replaced before either goes
      live.

---

## 0:40 – 1:20 · Connecting to iMed, and the first load of data

> **Say:** "Switching from our stand-in hospital server to your real one is one
> address and one token. What we're still missing is your reference data — and
> three answers."

**The hospital connection is already written as a contract** — six ways we read
visits (R1–R6), four ways we write approved codes back (W1–W4). We built a
faithful stand-in server against that contract, *including its refusals*, so
nothing was tuned to a mock the real system won't honour.

- [ ] 🟡 **API address and access token** — *Hospital.* Test system first,
      production second. On our side the cutover is `IMED_API_BASE` plus a
      token — no code change, no rebuild.
- [ ] 🔴 **Who serves the read feeds in production** — *Hospital.* The
      specification we were given covers writing codes back, not reading visits
      out. We read eleven feeds — diagnoses, procedures, labs, drugs, vitals and
      the rest. Something has to serve those live. *(open question 8)*
- [ ] 🔴 **Your reference ID lists** — *Hospital.* Real IDs for visit type,
      diagnosis type, operation type and discharge status/type. We write against
      documented placeholders today; they slot in as env vars, but must be right
      before a single real code is saved. *(open question 2)*
- [ ] 🔴 **How coding approval sits alongside discharge** — *Hospital.* The write
      specification expects a discharge object on every submission — but coding
      is approved *after* the patient is discharged. Does our write update that
      record, echo it, or get rejected by it? Biggest open question.
      *(open question 3)*
- [ ] 🟡 **How coders are identified in iMed** — *Both.* Does each coder get a
      hospital employee ID we stamp on their approvals (`coder_eid`), or does
      everything go in under one system account? Drives both the SAML claims
      above and who gets credit in your records. *(open question 4)*
- [ ] 🟡 **Starter data set for staging** — *Hospital.* A de-identified extract
      to rehearse on — we run on 110 visits today, 100 OPD and 10 IPD. Plus your
      ICD-10 and ICD-9 catalogues marked by edition (WHO / TM / CM), and the
      coding manuals as PDFs so the assistant answers from your rulebook rather
      than a generic one. *(open question 13)*
- [ ] 🟡 **Volume, history and retention** — *Both.* Visits per day, how far back
      we backfill, and how long patient data may be kept and where it may
      physically sit (PDPA). Volume also sets our batch sizes — the contract caps
      each request at 20 visit IDs or a 31-day window, and we respect both rather
      than working around them.

Full list of open questions: `imed-integration.md` §Open
questions for the hospital.

---

## 1:20 – 2:00 · Machines: two tiers, one of them optional

> **Say:** "The dashboard runs on an ordinary server. Only the AI needs a
> graphics card — and if you don't have one on day one, everything else still
> works."

**The AI service is optional by design.** Nothing else depends on it being up.
Switched off, you lose code suggestions, the assistant and the training page —
syncing visits, editing codes and approving back into iMed all keep working.

- [ ] 🟢 **Application server — 4 cores, 8 GB** — *Ours to spec.* Runs the
      dashboard, the API and the hospital connector. One instance of the API and
      never more: it holds a write lock (`WriteGate`) and a cache (`CasesCache`)
      in memory, so a second copy would corrupt approvals rather than share load.
- [ ] 🟡 **Database — PostgreSQL 18** — *Hospital.* Version 18 specifically;
      earlier versions fail partway through restoring our dumps (`\restrict`,
      `transaction_timeout`). Two databases on one server: `medcode` and the
      `imed` mirror. Nightly backup, and a restore we actually test.
- [ ] 🟡 **GPU for the AI service — 24 GB comfortable** — *Both.* Runs a Thai
      medical language model (Eir-8B, Q4_K_M via Ollama) alongside the bge-m3
      retrieval model. An NVIDIA L4, A10 or RTX 4090 is comfortable; 16 GB works;
      CPU-only runs correctly but slowly enough that coders will notice.
- [ ] 🟢 **Storage — roughly 10 GB fixed, plus your data** — *Ours to spec.*
      Model weights and container images ≈ 10 GB and don't grow. Search index and
      uploaded manuals start under 100 MB (42 MB today). The database is sized
      from your visit volume — the number we're asking for above. Add backup
      space on separate hardware.
- [ ] 🟡 **Where it runs** — *Hospital.* Your own rack, or cloud hosting in a
      Thailand region. Patient-data residency decides this, not us — we build the
      same containers either way. (Build `linux/amd64`; keep `max-instances=1`.)
- [ ] 🟢 **Rehearsal on the real hardware** — *Ours.* Both test suites re-run on
      the machines you give us, not just on our laptops, before anyone codes a
      real patient. 65 automated checks (46 + 19), hitting real endpoints and a
      real database.

---

## The whole ask, in one sentence

Your identity provider's details, one hostname and firewall opening, your
reference ID lists and a starter extract — plus an answer on how coding approval
meets discharge.

Everything else on this page is ours. Give us a staging server and those
answers, and the rehearsal starts the same week.
