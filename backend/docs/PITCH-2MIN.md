# The 2-minute script

*MedCode AI · what to actually say · 24 Aug 2026*

## TLDR

`DEPLOYMENT-PREP.md` is the **handout**, not the script. It is 2,300 words —
about 18 minutes if read aloud. This file is the ~250 words you actually speak.

**Room:** hospital management, investors or judges, and hospital IT.
**Goal:** show this is production-ready, not a demo.

The 28-item checklist is the **proof**, not the problem. Most demos in the room
will have no checklist at all. Say the number, do not read the list.

**Ask at the end, not at the start.** Opening with "we need three answers from
you" puts the hospital on the defensive in front of outside guests. Closing with
it sounds like rigour.

---

## The script

Roughly 250 words. At a calm speaking pace that is about 115 seconds, which
leaves a few seconds of air. Do not speed up to add more.

### 0:00 – 0:25 · What already exists

> MedCode AI is built and running today.
>
> It takes a patient visit out of the hospital system, suggests the diagnosis
> and procedure codes, a human coder checks them and approves, and the approved
> codes go straight back into the hospital's own records.
>
> This is not a mock-up. Sixty-five automatic tests run against real databases
> every time we change anything.

### 0:25 – 0:55 · What production adds

> To run it in a real hospital, three more things are needed. None of them are
> code.
>
> **One — staff sign in with their hospital account.** So when someone leaves,
> their access ends the same hour, and nobody has to remember to tell us.
>
> **Two — the hospital's own code books and ID lists.** So we write real
> records, not test ones.
>
> **Three — two ordinary servers and one graphics card.** The card stays inside
> the hospital, because patient data should not leave the building.

### 0:55 – 1:30 · The path

> From there it is five steps.
>
> Get access. Set up a practice copy. Then the step that matters most: we
> approve one code, and the hospital sees it appear inside their own system.
>
> After that, their head coder checks the AI against work their team already
> did. Then a small pilot — one team, one week, running beside their normal
> process.
>
> Every step has a clear finish line. No step is a guess.

### 1:30 – 2:00 · The close

> Our production checklist has twenty-eight items on it.
>
> Twenty-five have a clear owner and a clear answer. Three do not — they are
> decisions only the hospital can make, and we have written them down and asked.
>
> We would rather show you a checklist with three open items than a demo with
> none. That is the difference between a prototype and something a hospital can
> actually run.

---

## One line to decide on the day

The script says "the hospital" in the third person, which is right when you are
presenting *about* the project to a room.

**If the hospital's own team is sitting in the front row**, change the last
section only — say "three decisions we need from you" and look at them. Leave
the rest in the third person. Do not switch back and forth.

---

## Do not say

- **Any product or version name.** Not SAML. Not PostgreSQL 18.6. Not NVIDIA L4.
  Not Entra ID. These are correct and they belong in the handout. Spoken, they
  lose half the room and gain nothing.
- **Do not read the checklist.** Say twenty-eight. Point at the handout.
- **Do not apologise for the three open questions.** They are evidence you know
  what production means. Say them flatly.
- **Do not give a go-live date.** You do not have one, because it depends on
  their answers. Saying so is stronger than guessing.
- **Do not say "hackathon", "POC", or "prototype"** about your own work — except
  in the final sentence, where the contrast is the point.

---

## If asked

Short answers. Do not expand unless they push.

**"Is the AI accurate?"**
> We do not claim a number yet, on purpose. Accuracy gets measured against the
> hospital's own past coding before anyone is asked to trust it. That is step
> four in the plan, not a promise in a slide.

**"What if the AI gets a code wrong?"**
> A human coder approves every single code. The AI never writes to the hospital
> by itself. It suggests; a person decides.

**"How long until it goes live?"**
> Our own work is days per step. The calendar depends on the hardware and the
> three answers. We would rather not invent a date we cannot control.

**"What does it cost to run?"**
> Two ordinary servers and one graphics card. About ten gigabytes of storage
> that does not grow. No fee per code to anyone.

**"Does it need the internet, or a cloud account?"**
> No. It can run entirely inside the hospital. There is now a Google data centre
> in Bangkok if they prefer cloud for the app, but we recommend the AI card
> stays on site so patient data never leaves Thailand.

**"What happens if the AI part breaks?"**
> Everything else keeps working. You lose the suggestions and the assistant.
> Loading visits, editing codes and approving them back into the hospital system
> all continue. That was a deliberate design choice, not luck.

**"Why are three questions still open?"**
> Because they are the hospital's to answer, and guessing would mean writing
> wrong records into a patient file. We would rather wait than guess.

---

## If you have one slide

Use the five steps and their finish lines. Nothing else. No architecture
diagram, no logos, no checklist.

| Step | Finish line |
|---|---|
| Access | We can reach a server and the test system. |
| Practice copy | A coder signs in and opens a case. |
| **Real test** | **A code we approve appears inside iMed.** |
| Checking | Head coder and security team both say yes. |
| Pilot | One team, one week, no problems. |

Bold the third row. It is the only row that proves the system is real.

---

The full checklist is `DEPLOYMENT-PREP.md`. Print it, bring it, hand it to
whoever asks the most technical question. That is what it is for.
