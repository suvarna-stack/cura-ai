# What it takes to run MedCode AI for real

*Production checklist · for the 2-minute pitch · 24 Aug 2026*

## TLDR

The app is finished. To run it in a real hospital we still need three things:

1. **Your login system** — so staff sign in with their hospital account, not ours.
2. **Your data** — your ID lists, your code books, and answers to 3 questions.
3. **Machines** — 2 normal servers, plus 1 graphics card that stays in your building.

**3 questions block everything.** Until the hospital answers them, we cannot test
on real patients. Our own work takes days. The waiting takes weeks.

**28 things to do. 23 of them need the hospital. 5 are ours.**

Key: 🟢 we do it · 🟡 we need your answer · 🔴 blocks everything

---

## The 5 steps to the first real patient

| Step | What happens | Done when |
|---|---|---|
| 1 | **Access** | We can reach a server and your test iMed. |
| 2 | **Staging** | A coder signs in with their hospital account and opens a case. |
| 3 | **Testing** | We approve a code and you can see it inside iMed. |
| 4 | **Checking** | Your head coder and your security team both say yes. |
| 5 | **Pilot** | One full week of real work with no problems. |

Steps 3 and 4 cannot start until the 3 red questions are answered. So the slow
part is not our code. It is waiting for answers and hardware.

---

## Block 1 (0:00–0:40) · Logging in, network, and test copies

> **Say:** "Nobody shares a login in a real hospital. So we use your sign-in
> system, your certificates, and three copies of the app instead of one."

Right now people sign in with an email and a password. The passwords are stored
safely and logins are limited, so it is fine for a demo. But it is not how a
hospital should work. With your login system, a nurse or coder who leaves the
hospital loses access the same hour. Nobody has to remember to tell us.

- [ ] 🟡 **Your login system** — *Hospital.* Which one do you use: Entra ID,
      AD FS, Google Workspace, or Keycloak? We need its setup file and its
      certificate. Also ask them: **SAML or OIDC?** Both work. Microsoft now
      suggests OIDC for new apps but still fully supports SAML, so we may get
      either one. Asking takes a minute. Building the wrong one takes a week.
- [ ] 🟡 **Job titles, and the coder's staff ID** — *Both.* Your system must tell
      us who is a coder and who is an admin. The same message can also carry the
      staff ID that iMed uses. One answer solves two problems: who is allowed to
      approve, and whose name goes into your records.
- [ ] 🟡 **Who renews the certificate, and a spare key** — *Both.* Login
      certificates expire. When one does, every coder is locked out at the same
      time. So we need a named person to renew it, and one local admin account
      that still works when sign-in is down.
- [ ] 🟡 **Web address and security certificate** — *Hospital.* The address
      coders will type. It also controls which websites are allowed to talk to
      our system. The demo version allows everything, which is fine on a laptop
      and wrong in a hospital.
- [ ] 🟡 **Firewall openings** — *Hospital.* Two holes: our server out to iMed,
      and staff browsers in to our app. If the network has no internet at all,
      we must put the AI models inside the install file instead of downloading
      them. We need to know this before we build, not after.
- [ ] 🟢 **Three copies, not one** — *Ours.* One to build on, one to test on, one
      real one. Separate databases, separate logins, separate addresses. Test
      tools stay on in the test copy and off in the real one. Every default
      password gets changed. Without a test copy, there is nowhere safe to
      practise an update.
- [ ] 🟡 **Passwords and keys kept properly** — *Both.* The iMed token, the
      database password and the login certificate should live in a proper key
      store, not in a text file on the server. Each one needs an owner and a
      date to change it.
- [ ] 🟡 **Security check before anyone can reach it** — *Hospital.* A security
      scan, and ideally a real security test, even if only hospital staff can
      reach it. Your security team saying yes is a step in the plan, not a form
      to sign at the end.

---

## Block 2 (0:40–1:20) · Getting ready to touch real patient records

> **Say:** "Connecting to your real iMed is one address and one token. Everything
> else here is what must be true before we are allowed to use it on a real
> patient."

We already agreed how the two systems talk: 6 ways we read visits, 4 ways we
write codes back. We built a copy of your hospital system that follows those
rules exactly, including where it says no to us. So switching to the real iMed
really is one setting. What is missing is your data, and 3 answers.

- [ ] 🟡 **iMed address and token** — *Hospital.* Test system first, real system
      second. On our side it is one setting plus a token. No new code, no new
      release.
- [ ] 🔴 **Who gives us the visit data in the real system** — *Hospital.* The
      document you gave us explains how to write codes back. It does not explain
      how to read visits out. We read 11 kinds of data: diagnoses, procedures,
      lab results, drugs, vital signs and more. Something has to send us that
      every day. Right now nothing does.
- [ ] 🔴 **Your ID lists** — *Hospital.* The real ID numbers for visit type,
      diagnosis type, operation type, and discharge status. We use safe
      placeholders today. They are easy to swap. But they must be correct before
      one real code is saved, because a wrong ID saves a wrong record quietly.
- [ ] 🔴 **How approving a code fits with discharge** — *Hospital.* Your document
      says every write must include discharge information. But coding is approved
      *after* the patient goes home. Does our write change that record, repeat it,
      or get rejected? This is the biggest unknown in the whole project.
- [ ] 🟡 **How coders are named in iMed** — *Both.* Does each coder get their own
      staff ID on their approvals, or does everything save under one system
      account? This decides whether your records can show who coded what. It is
      an audit question, not a technical one.
- [ ] 🟡 **Starting data and code books** — *Hospital.* A set of visits with names
      removed, so we can practise. We use 110 visits today: 100 outpatient, 10
      inpatient. Plus your ICD-10 and ICD-9 code books marked by version, and your
      coding manuals as PDFs, so the AI answers from your rules and not from
      generic ones.
- [ ] 🟡 **How much, how old, how long** — *Both.* Visits per day. How far back we
      load old ones. Where patient data is allowed to sit. The daily number also
      sets how big the database must be, and how big each request can be — the
      agreed limits are 20 visits or 31 days per request, and we follow them.
- [ ] 🟡 **How long we keep the record of approvals** — *Hospital.* Who approved
      which code, when, and what the AI had suggested. We store this, but no rule
      says how long to keep it. Your medical records policy decides. We follow it.
- [ ] 🟡 **Data protection paperwork** — *Hospital.* A processing agreement, a
      record of what data we handle, and an impact check for the AI part.
      Thailand's data regulator published a draft guide for hospitals this year.
      It does not add new rules, but it shows how hospitals will be checked. Doing
      it now is cheaper than fixing it later.
- [ ] 🟡 **Proving the AI is accurate enough** — *Both.* Before anyone trusts a
      suggestion, we run the AI over visits your coders already coded, and compare.
      Your head coder decides if it is good enough. This is the one item that
      decides if the product is actually useful — and we cannot do it without your
      old data.

The full list of questions for the hospital is in `imed-integration.md`.

---

## Block 3 (1:20–2:00) · The machines, and keeping them running

> **Say:** "Two normal servers and one graphics card. The hard part is not buying
> them. It is having a backup you have actually restored, and a person who gets
> called when something fails."

The AI part is optional on purpose. Nothing else needs it. If it is off, you lose
code suggestions, the chat assistant and the training page. Loading visits,
editing codes and approving them back into iMed all keep working. So a late
graphics card never delays the launch.

- [ ] 🟢 **App server — 4 cores, 8 GB** — *Ours to spec.* Runs the dashboard, the
      API, and the link to iMed. One copy only, never two. It keeps a lock and a
      cache in its own memory, so a second copy would damage approvals instead of
      sharing the work.
- [ ] 🟡 **Database — PostgreSQL 18.6 or newer** — *Hospital.* Version 18
      exactly; 15, 16 and 17 fail halfway through loading our data. Install
      **18.6** (released 13 Aug 2026), not the 18.4 our files came from. 18.4
      fixed 11 security problems, and 18.6 is newer still. Running an old version
      in a hospital will be flagged in any audit. Note: 18.5 was cancelled and
      never released. Two databases on one server: ours, and the copy of yours.
- [ ] 🟡 **Graphics card — 24 GB, kept in your building** — *Both.* Runs a Thai
      medical AI model plus the search model. The model itself needs about 4–6 GB,
      plus roughly a quarter more while it works. So 24 GB is room for several
      coders at once, not a minimum. An NVIDIA L4 is the right size. Bigger cards
      exist but are too much for this. 16 GB also works. Without any card it still
      runs, just slowly enough that coders will complain.
- [ ] 🟢 **Storage — about 10 GB fixed, plus your data** — *Ours to spec.* The AI
      models and program files are about 10 GB and do not grow. The search index
      and uploaded manuals start under 100 MB. The database size comes from your
      visit numbers. Backups go on different hardware, or they are not backups.
- [ ] 🟡 **Where it runs — and the catch** — *Hospital.* Google Cloud opened a
      **Bangkok data centre in January 2026**, so keeping everything inside
      Thailand is now possible for the app and the database. **But Bangkok has no
      graphics cards.** The nearest ones are in Singapore. Using those would send
      patient data out of Thailand, which Thai law controls, and the regulator has
      not yet published a list of approved countries. So: app and database can go
      either place, but the graphics card should stay on site.
- [ ] 🟡 **Backups you have actually restored** — *Both.* Copying every night is
      not a plan until someone has restored one and timed it. Agree two numbers:
      how much data may be lost, and how long we may be down. Then practise, and
      write down how long it really took.
- [ ] 🟡 **Alerts, and who answers the phone** — *Both.* We already record every
      write to the hospital. But recording is not the same as telling someone.
      Decide who gets the message when a sync fails or an approval does not reach
      iMed — including at night.
- [ ] 🟡 **Who installs updates, and how fast** — *Both.* Database, base images,
      Java. Agree this before the first security problem, not during it.
- [ ] 🟢 **Staying up without a second server** — *Ours.* Since the app cannot run
      twice, uptime comes from restarting fast and checking health, not from
      adding servers. Agree the maintenance time, the restart steps, and what a
      coder sees on screen while it happens.
- [ ] 🟢 **Practise on your machines, then a small pilot** — *Ours.* We re-run all
      65 automatic tests on the real machines, not our laptops. Then a small group
      of coders works with it beside their normal process, with a way to go back,
      and one named person to train them.

---

## The whole ask, in one sentence

Your login system, one web address and two firewall holes, your ID lists and a
starter set of data — plus 3 answers only your team can give.

The app is built and the connection is already agreed, so the switch itself is
one setting. Everything left on the calendar is hardware, approvals, and those
3 answers. That is why we are asking now and not at the end.

---

## Sources checked on 24 Aug 2026

- Google Cloud Bangkok, and no graphics cards there —
  [launch, 21 Jan 2026](https://www.googlecloudpresscorner.com/2026-01-21-Google-Cloud-Launches-New-Cloud-Region-in-Thailand,-Bolstering-its-Commitment-to-Advancing-the-Countrys-AI-Driven-Digital-Economy),
  [GPU regions and zones](https://docs.cloud.google.com/compute/docs/gpus/gpu-regions-zones)
- PostgreSQL 18.6, and 18.5 being cancelled —
  [release notes](https://www.postgresql.org/docs/release/),
  [endoflife.date](https://endoflife.date/postgresql)
- SAML still supported, OIDC suggested for new apps —
  [Microsoft guide](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/saml-vs-oidc-decision-guide)
- Thai data law on sending data abroad, and the draft hospital guide —
  [PDPC consultation](https://www.hlc.com/en/publications/thailand-pdpc-consults-on-first-healthcarespecific-data-protection-guideline),
  [Chambers Thailand 2026](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/thailand/trends-and-developments)

One thing to look at separately, not on the checklist: our AI model is Eir-8B,
built on Llama 3.1. SCB 10X now ships **Typhoon 2** Thai models built on Gemma 3
and Qwen 3, from 1B to 30B. Worth testing both against your own coding manuals
before launch. Swapping is one setting, not a rebuild.
