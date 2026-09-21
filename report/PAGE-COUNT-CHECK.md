# Page count check — 2026-09-21, updated after appendices assembly

*Method note, not part of the submitted report. Target: 25–40 pages
(deliverable spec, item 4).*

## Method

Word-count-based estimates (~500 words/page) said the report was near the
*low* end of 25–40 pages. That assumption doesn't hold once tables and
bullet lists are laid out on an actual page — both use far more vertical
space per word than flowing prose, and this report is table/list-heavy
(Ch.3 data model, Ch.5 PDPA data inventory, Ch.6 test result tables, the
new Appendix E questionnaire). So each chapter was rendered to a real,
paginated PDF (A4, 2.5cm margins, 12pt serif, pandoc → HTML → Chromium
print) to get an actual count instead of guessing from word count.

## Result

| Chapter | Pages (own page break) |
|---|---|
| 1 — Problem | 3 |
| 2 — Related work | 4 |
| 3 — Design | 6 |
| 4 — Implementation | 6 |
| 5 — Data & PDPA | 6 |
| 6 — Testing & evaluation | 4 |
| 7 — Results | 2 |
| 8 — Conclusion | 4 |
| **Chapters 1–8 total** | **35** (flowing back-to-back) / **44** (each chapter forced to start on a fresh page) |

**Appendices, now all 8 assembled (2026-09-21, later same day)** — each
kept deliberately compact (an index/summary of its source material, not a
verbatim paste — see `appendices-outline.md`'s framing note):

| Appendix | Pages (own page break) |
|---|---|
| A — API reference | 2 |
| B — Architecture & data-flow (2 embedded diagram figures) | 3 |
| C — Database schema | 2 |
| D — Test cases / evidence | 2 |
| E — Questionnaire (bilingual — the single biggest appendix cost) | 8 |
| F — Screenshots index | 2 |
| G — Production-readiness checklist | 2 |
| H — Data provenance | 2 |
| appendices-outline.md (index page) | 1 |
| **Appendices total** | **24** |

**Grand total: 59 pages (chapters flowing) to 68 pages (chapters +
appendices each forced to a fresh page)** — even with every appendix kept
to a compact index rather than a full verbatim embed of its source
document. Embedding the large source docs in full instead (e.g.
`api-contract.md`, `DEPLOYMENT-PREP.md`, as the original outline suggested)
would add well over 20 more pages on top of this.

## What this means

- **The report is now clearly over 40 pages under any reading** — this
  isn't a borderline call the way chapters-only was. Assembling the
  appendices (even compactly) roughly doubled the chapters-only estimate.
- **Whether appendices count against the 25–40 cap is still not stated** in
  the deliverable spec, but at 59–68 total pages this now matters a lot
  more than it did before assembly — worth confirming with whoever set the
  requirement before spending more effort either trimming or polishing.
- Appendix E (questionnaire) is the single biggest appendix cost (8 of 24
  pages) because it carries both the Thai instrument and a full English
  reference table.

## Recommendation

Two honest paths, not mutually exclusive:

1. **Confirm with the assessor/organizer** whether appendices count toward
   25–40 pages, and whether that's a hard cap or a guideline. This is now
   the highest-leverage open question — it decides whether anything below
   is even necessary.
2. **If everything must fit inside 40 pages total**, ranked by pages saved
   per unit of content lost:
   - Don't force a fresh page per chapter/appendix (saves up to ~9 pages
     across chapters 1–8 alone, more across appendices — pure formatting,
     zero content loss).
   - Ship the questionnaire (Appendix E) as Thai-only, footnoting the
     English item table instead of a full duplicate (saves ~4 pages).
   - Cut Appendix F's screenshot index table (the images themselves stay
     embedded/linked in the Thai user guide either way) — saves ~2 pages.
   - If still over, the appendices as a whole are the easiest place to cut
     further, since they're already summaries of material that stays fully
     available in the repository regardless of what's in the PDF.

## Reproduce

```bash
cd medcode-stack/report
pandoc <chapter>.md -f markdown -t html5 --standalone --css=report-print.css -o <chapter>.html
# then print <chapter>.html to PDF at A4, 2.5cm margins (Chromium/Playwright
# page.pdf(), or any browser's print-to-PDF) and check page count with
# `pdfinfo <chapter>.pdf`
```
