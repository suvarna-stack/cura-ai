# Page count check — 2026-09-21

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
| Appendices-outline.md | 3 |
| Appendix E — questionnaire | 8 |
| **Appendices so far** | **11** (and appendices A–D, G, H aren't written yet — currently only bullet-point pointers in `appendices-outline.md`, not assembled content) |

## What this means

- **Chapters 1–8 alone are already at or slightly past the 40-page cap**,
  depending only on the formatting choice of whether each chapter starts on
  a fresh page (a normal, common choice for a formal report). This is with
  *zero* appendix content assembled yet.
- **Appendices are still growing.** Appendix E (this session's new
  questionnaire) alone adds 8 pages — mostly from being bilingual (Thai
  instrument + English reference table) plus the PDPA consent notice.
  Appendices A–D, G, H are not written yet; assembling them (the next task)
  will add more pages on top of the 11 already counted.
- **Whether appendices count against the 25–40 cap is not stated** in the
  deliverable spec (item 4 lists chapters 1–8 by name with a page range,
  then "Appendices" as a separate bullet with no page guidance) — this is
  worth confirming with whoever set the requirement rather than assuming
  either way.

## Recommendation

Two honest paths, not mutually exclusive:

1. **Confirm with the assessor/organizer** whether appendices count toward
   25–40 pages. If they don't, the current chapter count (35–44) is
   close enough to on-target that no trimming is urgent.
2. **If everything must fit inside 40 pages**, the two easiest trims,
   ranked by how much page they cost without losing content:
   - Don't force a fresh page per chapter (saves ~9 pages across
     chapters 1–8 for zero content loss — a formatting choice, not a
     content cut).
   - Ship the questionnaire (Appendix E) as Thai-only, with the English
     reference table moved to a footnote/citation instead of a full
     duplicate table (cuts roughly half of its 8 pages).

## Reproduce

```bash
cd medcode-stack/report
pandoc <chapter>.md -f markdown -t html5 --standalone --css=report-print.css -o <chapter>.html
# then print <chapter>.html to PDF at A4, 2.5cm margins (Chromium/Playwright
# page.pdf(), or any browser's print-to-PDF) and check page count with
# `pdfinfo <chapter>.pdf`
```
