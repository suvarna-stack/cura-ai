# Deployment prep — what we need before go-live

*MedCode AI · 2-minute pitch segment + leave-behind · 2026-08-24*

Everything here is a **handover item**: a setting, an answer, or a machine.
The build is done — these are the things only the hospital's IT team can give
us.

**Sections 1–3 are the two minutes on stage**, forty seconds each. **Section 4
is not spoken** — it is the production-readiness work that has to be done
before a real patient's codes go through the system, and it belongs on the page
they take away rather than in the pitch.

|  |  |
|---|---|
| Time on stage | **2:00** (sections 1–3) |
| Items | **29** |
| Need the hospital | **25** |
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

- [ ] 🟡 **Identity provider details — and which protocol** — *Hospital.* Which
      IdP (Entra ID, AD FS, Google Workspace, Keycloak), plus its metadata XML
      and signing certificate. We hand back the entity ID and reply URL for you
      to register. Ask explicitly whether they will issue **SAML 2.0 or OIDC**:
      Microsoft now recommends OIDC for new applications while continuing to
      support SAML with no announced retirement, so an Entra shop may hand us
      either. Enterprise procurement still hands over SAML metadata XML by
      default. Cheaper to ask than to build the wrong one.
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
- [ ] 🟡 **Database — PostgreSQL 18.6 or newer** — *Hospital.* Major version 18
      specifically; 15/16/17 fail partway through restoring our dumps
      (`\restrict`, `transaction_timeout`). Install **18.6** (released
      2026-08-13), not the 18.4 our dumps were taken on — 18.4 itself fixed 11
      security issues and 18.6 adds ~110 bug fixes on top. Note 18.5 was pulled
      and never shipped. Two databases on one server: `medcode` and the `imed`
      mirror. Nightly backup, and a restore we actually test.
- [ ] 🟡 **GPU for the AI service — 24 GB comfortable** — *Both.* Runs a Thai
      medical language model (Eir-8B, Q4_K_M via Ollama) alongside the bge-m3
      retrieval model. An 8B model at 4-bit needs roughly 4–6 GB of weights plus
      20–30% for KV-cache and framework overhead, so **24 GB is headroom for
      several coders at once, not a floor**. An NVIDIA **L4 (24 GB)** is the
      sweet spot and is what cloud guidance still points at for real-time
      chat-style serving; L40S (48 GB) or RTX PRO 6000 Blackwell (96 GB) are
      real but oversized for one 8B model. 16 GB works. CPU-only runs correctly
      but slowly enough that coders will notice.
- [ ] 🟢 **Storage — roughly 10 GB fixed, plus your data** — *Ours to spec.*
      Model weights and container images ≈ 10 GB and don't grow. Search index and
      uploaded manuals start under 100 MB (42 MB today). The database is sized
      from your visit volume — the number we're asking for above. Add backup
      space on separate hardware.
- [ ] 🟡 **Where it runs — and the catch** — *Hospital.* Google Cloud opened a
      **Bangkok region (`asia-southeast3`) on 2026-01-21** with three
      availability zones, so in-country hosting is now genuinely available for
      the dashboard and the database. **But Bangkok currently lists no GPUs** —
      the nearest GPU zones are Singapore (`asia-southeast1`, which has L4/G2,
      A2, A3 and A4). That splits the decision: keep patient data in Thailand and
      the AI tier goes **on-prem in your rack**, or it crosses a border, which
      PDPA's transfer rules govern and for which the PDPC has still not published
      an adequacy list. Our recommendation is an on-prem GPU box.
      (Build `linux/amd64`; keep `max-instances=1` either way.)
- [ ] 🟢 **Rehearsal on the real hardware** — *Ours.* Both test suites re-run on
      the machines you give us, not just on our laptops, before anyone codes a
      real patient. 65 automated checks (46 + 19), hitting real endpoints and a
      real database.

---

## Not in the two minutes · Before the first real patient

> This section is the leave-behind, not the pitch. Sections 1–3 get the system
> **stood up**; this section is what makes it **production**. None of it is
> optional once real patient records are flowing.

- [ ] 🟡 **Backup and recovery, with numbers on it** — *Both.* A nightly dump is
      not a recovery plan until a restore has been timed. Agree how much data we
      may lose (RPO) and how long we may be down (RTO), then rehearse a restore
      against those numbers and write down what it actually took.
- [ ] 🟡 **The single-instance question, answered out loud** — *Both.* The API
      cannot be scaled to a second copy — it holds the write lock and cases cache
      in memory. Availability therefore comes from fast restart and health checks,
      not replicas. Agree the maintenance window, the restart procedure, and what
      coders see while it happens.
- [ ] 🟡 **Monitoring and who gets called** — *Both.* Every hospital write is
      already recorded in `imed_write_ops`, but recording is not alerting. Decide
      who is notified when a sync fails or an approval does not reach iMed, and
      where those alerts land.
- [ ] 🟡 **Audit trail retention** — *Hospital.* Who approved which code, when,
      and against which AI suggestion — that record lives in our database with no
      retention rule attached. Your medical-records policy sets the period; we
      implement it.
- [ ] 🟡 **Secrets, and who rotates them** — *Both.* The iMed token, database
      password and IdP certificate belong in a secret store, not an env file on
      the box. Name the owner and the rotation interval for each.
- [ ] 🟡 **Patch cadence** — *Both.* Postgres, the base images and the Java
      runtime. Agree who applies security updates and how quickly, before the
      first CVE rather than during it.
- [ ] 🟡 **Security review before exposure** — *Hospital.* A vulnerability scan
      and, ideally, a penetration test — even for an internal-only deployment.
      Sign-off from your security team is a gate, not a formality.
- [ ] 🟡 **PDPA paperwork** — *Hospital.* Data processing agreement, records of
      processing, and a data protection impact assessment for the AI component.
      Worth doing against the **PDPC's draft healthcare-sector guideline**, which
      went out for public consultation in 2026 — it adds no new legal obligations
      but is the clearest signal yet of how the regulator will supervise
      hospitals, so aligning now is cheaper than retrofitting later.
- [ ] 🟡 **Clinical accuracy sign-off** — *Both.* Before anyone trusts a
      suggestion, run the AI over historic visits your coders have already coded
      and compare. Your coding supervisor signs off on the result. This is the
      one item that decides whether the product is useful, and it cannot be done
      without your historic data.
- [ ] 🟡 **Rollout and training** — *Both.* A pilot cohort of coders, a period of
      running alongside the current process rather than replacing it, a rollback
      plan, and someone named to train the team.

---

## The whole ask, in one sentence

Your identity provider's details, one hostname and firewall opening, your
reference ID lists and a starter extract — plus an answer on how coding approval
meets discharge.

Everything else on this page is ours. Give us a staging server and those
answers, and the rehearsal starts the same week.

---

## Checked against current sources — 2026-08-24

The three items above that changed on checking, with what they were checked
against:

- Google Cloud's Bangkok region and its GPU gap —
  [Google Cloud press release, 2026-01-21](https://www.googlecloudpresscorner.com/2026-01-21-Google-Cloud-Launches-New-Cloud-Region-in-Thailand,-Bolstering-its-Commitment-to-Advancing-the-Countrys-AI-Driven-Digital-Economy),
  [GPU regions and zones](https://docs.cloud.google.com/compute/docs/gpus/gpu-regions-zones)
- PostgreSQL 18.6 and the pulled 18.5 —
  [PostgreSQL release notes](https://www.postgresql.org/docs/release/),
  [endoflife.date/postgresql](https://endoflife.date/postgresql)
- SAML still supported, OIDC recommended for new apps —
  [Microsoft Entra SSO protocol decision guide](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/saml-vs-oidc-decision-guide)
- PDPA cross-border transfer and the draft healthcare guideline —
  [PDPC healthcare guideline consultation](https://www.hlc.com/en/publications/thailand-pdpc-consults-on-first-healthcarespecific-data-protection-guideline),
  [Chambers: Data Protection & Privacy 2026, Thailand](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/thailand/trends-and-developments)

One thing worth revisiting separately, not a checklist item: our default
generation model is Eir-8B, a Llama-3.1 derivative. SCB 10X's **Typhoon 2** line
now ships Thai models built on Gemma 3 and Qwen 3 in sizes from 1B to 30B. Worth
a bake-off against your own coding manuals before go-live — the swap is one
environment variable (`OLLAMA_MODEL`), not a rebuild.
