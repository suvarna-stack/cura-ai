# Appendix F — Production-readiness checklist

Supporting material for Chapter 8. The full 28-item checklist is
`medcode-api/docs/DEPLOYMENT-PREP.md` (24 August 2026, about 3,100 words),
written for a non-engineering audience. Each item carries two markers:

| Marker | Meaning |
|---|---|
| 🟢 / 🟡 / 🔴 | Who acts: 🟢 the team does it · 🟡 needs the hospital's answer · 🔴 blocks everything until answered |
| `[say]` / `[ask]` / `[IT]` | Audience: `[say]` for the spoken pitch · `[ask]` hospital decisions, raised as a group · `[IT]` technical handout detail |

Its own summary, quoted as written on 24 August 2026 (the test count has
since grown to 192 across the three services, Chapter 6):

> **The app is finished and tested.** It pulls a visit out of the hospital
> system, suggests the codes, a coder checks and approves, and the approved
> codes land back in the hospital's own records. 65 automatic tests cover
> that path.
>
> To run it in a real hospital, three more things are needed, none of them
> code: **1)** the hospital's own login system, **2)** the hospital's data
> (ID lists, code books, answers to 3 questions), **3)** machines (2 normal
> servers + 1 GPU that stays in the hospital building — sized in
> `HARDWARE_SPEC.md`).
>
> **28 things to do. 23 need the hospital. 5 are ours. 3 of the 28 need a
> decision only the hospital can make** — until those come back, real-patient
> testing can't start. Our own remaining work takes days; the waiting takes
> weeks.

## Section index (`DEPLOYMENT-PREP.md`)

| Section | Covers |
|---|---|
| What works today | The tested, working path as of the checklist date |
| Safety, and what the hospital gains | Why this is safe to pilot |
| What it costs | Ties into `HARDWARE_SPEC.md` |
| The 5 steps to the first real patient | The critical path |
| 1 · Logging in, network, and test copies | Auth + staging |
| 2 · Getting ready to touch real patient records | PDPA-adjacent readiness |
| 3 · The machines, and keeping them running | Ops |
| The whole ask, in one sentence | Single-sentence summary for a decision-maker |
| Sources checked on 24 Aug 2026 | Citation trail for every factual claim in the doc |

## The 2-minute pitch script

`medcode-api/docs/PITCH-2MIN.md` (1,106 words) is the condensed spoken
version of the same material — useful if the assessment includes an oral
defense/pitch component. Sections: the script itself, "one line to decide
on the day," "do not say," "if asked" (anticipated questions), "if you have
one slide."
