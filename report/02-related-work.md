# Chapter 2 — Related Work

*Status: draft skeleton. Word count ~2,300 (≈4.5 pages). All citations below are
real, web-verified sources (retrieved 2026-09-18) — no invented references.
Expand the comparison table with a primary source once the team can access one
(most CAC vendor claims below are marketing material, flagged as such).*

## 2.1 Computer-assisted coding (CAC): the incumbent approach

Large hospital systems, especially in the US market, already run
**computer-assisted coding (CAC)** software: rule- and NLP-based engines that
scan a chart and suggest codes for a human coder to accept or reject. Two
well-known commercial examples:

- **Solventum (formerly 3M) 360 Encompass** — an integrated CAC + clinical
  documentation improvement (CDI) + coding/auditing platform. It combines
  "3M CRS" (a computer-assisted coding decision-support engine) with
  professional coding and revenue-integrity workflows, auto-suggesting codes
  from patient documentation for a coder to review and complete.
  — *3M/Solventum, "360 Encompass Computer-Assisted Coding (CAC)"*, product
  literature, accessed 2026-09-18.
  [https://www.solventum.com/en-us/home/health-information-technology/solutions/360-encompass-cac/](https://www.solventum.com/en-us/home/health-information-technology/solutions/360-encompass-cac/)
- **Nuance (Microsoft) Clinical Documentation Excellence (CDE)** — a
  cloud-based AI documentation platform (the M*Modal CDI Engage line,
  integrated with 3M's CAC/CDI workflow in some deployments) that helps
  physicians capture structured documentation as they write, reducing the
  ambiguity a downstream coder has to resolve.
  — *3M/M*Modal, "3M and M*Modal launch new AI-powered CDI tool"*,
  Healthcare IT News, accessed 2026-09-18.
  [https://www.healthcareitnews.com/news/3m-and-mmodal-launch-new-ai-powered-cdi-tool](https://www.healthcareitnews.com/news/3m-and-mmodal-launch-new-ai-powered-cdi-tool)

These products are mature, enterprise-grade, and — critically for the
architecture question in §2.3 — built around **US coding systems (ICD-10-CM,
CPT)**, **cloud or large on-prem enterprise deployments**, and **per-seat /
per-facility commercial licensing**. None of the public material found
mentions ICD-10-TM (Thailand's national modification), Thai-language clinical
notes, or the Thai national coverage-scheme vocabulary this project's
`medical-glossary.md` documents (UCS/CSMBS/SSS). They are the closest
production analogue to "AI-assisted coding with a human approval step," which
is also this project's core design decision (Chapter 1, §1.4) — but they are
not a drop-in fit for a Thai hospital's vocabulary, language mix, or
on-premise/data-residency constraints (§2.3).

## 2.2 RAG for automated / assisted ICD coding: the recent academic literature

Retrieval-augmented generation (RAG) — retrieving relevant reference text
before asking a language model to answer — has an active, recent research
line specifically applied to ICD coding, which is directly relevant to this
project's own architecture (Chapter 4):

- Deppe et al., **"Retrieval-Augmented Generation for ICD-10 Coding in
  German Clinical Texts – A Technical Case Report"** (2025). Designs and
  evaluates a semi-automated pipeline that assigns ICD-10 codes from
  unstructured German clinical text by combining retrieval over a coding
  reference corpus with generative reasoning — architecturally the closest
  published system to this project's RAG service (retrieve reference
  passages → LLM answers only from retrieved context).
  [https://journals.sagepub.com/doi/10.3233/SHTI251397](https://journals.sagepub.com/doi/10.3233/SHTI251397)
- Klang et al., **"Assessing Retrieval-Augmented Large Language Model
  Performance in Emergency Department ICD-10-CM Coding Compared to Human
  Coders"** (2024), PMC / SSRN. Compared RAG-enhanced LLM coding against
  provider-assigned ICD-10-CM codes on real emergency-department records;
  human reviewers preferred the AI-assisted codes over the providers' own
  codes in a majority of the compared instances (447 vs. 277, p < 0.001).
  This is the strongest published evidence found that RAG-assisted coding
  can match or exceed baseline human coding quality on real clinical data —
  and exactly the kind of head-to-head comparison against a hospital's own
  historical coding that this project's own team has flagged as the one
  measurement still missing before deployment (`DEPLOYMENT-PREP.md`, §2,
  "Proving the AI is accurate enough" — see Chapter 8).
  [https://pmc.ncbi.nlm.nih.gov/articles/PMC11527068/](https://pmc.ncbi.nlm.nih.gov/articles/PMC11527068/)
- **"Retrieval-Augmented Generation in Biomedicine: A Survey of
  Technologies, Datasets, and Clinical Applications"** (2025), arXiv. A
  broad survey positioning RAG's core value proposition for clinical use —
  grounding generation in retrieved, verifiable source text rather than
  relying on a model's parametric memory — as specifically suited to
  high-stakes, audit-sensitive clinical tasks. This is the general
  architectural justification this project's own RAG service implements
  directly: `RAG/app/core/rag.py`'s system prompt instructs the model to
  "Answer ONLY using the provided context... If the context does not
  contain the answer, say you don't know," and a separate grounding check
  (`_verify_codes`) flags any code the model's answer mentions that does
  not appear in the retrieved chunks as `unverified_codes` before it ever
  reaches a coder.
  [https://arxiv.org/pdf/2505.01146](https://arxiv.org/pdf/2505.01146)
- **"To RAG, or Not to RAG? A Comparative Evaluation of Retrieval-Augmented
  Generation for ICD Coding of German Tumor Diagnoses"** (2026), medRxiv.
  Evaluated RAG-prompted open-weight LLMs (Llama 3.1 8B, Llama 3.3 70B)
  against base (non-RAG) LLMs for ICD-10 / ICD-O-3 coding, finding RAG
  prompting substantially improved base-model performance — direct evidence
  for this project's choice of a small local model (Qwen2.5-0.5B by
  default, an 8B Llama variant optionally via Ollama; see Chapter 4)
  *plus* retrieval, rather than a larger model alone.
  [https://www.medrxiv.org/content/10.64898/2026.05.27.26353695v1.full](https://www.medrxiv.org/content/10.64898/2026.05.27.26353695v1.full)
- **RuCCoD: "Towards Automated ICD Coding in Russian"** (2025), arXiv.
  Another non-English-language ICD-coding system combining retrieval over
  a structured code database with an LLM reranking step — evidence that
  the RAG-for-ICD-coding pattern generalizes beyond English/German to
  other national coding variants, which is the same generalization this
  project is attempting for Thai/ICD-10-TM.
  [https://arxiv.org/pdf/2502.21263](https://arxiv.org/pdf/2502.21263)

Across these five sources, the published pattern is consistent: **RAG
outperforms a bare LLM on ICD coding, and RAG-assisted coding can approach
or exceed human-coder baselines on some cohorts** — but every study
evaluates against a *specific* health system's language, coding variant,
and data, and none of the sources found evaluate Thai or ICD-10-TM data.
That gap is exactly what this project's demo dataset and RAG index (ICD-10,
ICD-9, and an ICD-10-TM-for-PCU reference PDF — see `RAG/data/documents.json`)
are built to start closing, but no comparable accuracy figure exists yet
for this system (flagged again in Chapter 6/7 stubs and Chapter 8).

## 2.3 Why a local RAG stack instead of a cloud LLM API

The team chose a **fully local** pipeline — `BAAI/bge-m3` embeddings,
a persistent on-disk Chroma vector store, and a small local LLM
(`Qwen/Qwen2.5-0.5B-Instruct` via `transformers`, or an 8B model via a
host-native Ollama server) — over calling a cloud LLM API (OpenAI, Anthropic,
Google, etc.). This is a real architecture decision with three grounded
reasons, not an assumption:

**1. Data residency and Thai law.** Patient chart text — chief complaints,
present-illness narratives, lab results — is exactly the kind of "sensitive
personal data" Thailand's PDPA regulates most strictly (Chapter 5 covers this
in depth). The team's own production checklist already investigated this
question directly and found that Thailand's data regulator (the PDPC) is
actively drafting healthcare-specific guidance and that sending data to
servers outside Thailand is legally constrained; the same document notes
that Google Cloud opened a Bangkok region in January 2026 for compute, but
**that region has no GPUs**, so any GPU-accelerated cloud LLM call for this
workload would by construction leave Thailand
(`medcode-api/docs/DEPLOYMENT-PREP.md`, §3, "Where it runs — and the
catch," citing the Google Cloud Bangkok launch announcement and a PDPC
cross-border-transfer consultation — both re-verified as real sources in
Chapter 5). A local model sidesteps this question entirely: nothing leaves
the hospital's network.
**2. Cost shape.** A cloud LLM API bills per token, per request, indefinitely.
A local model, once downloaded (~3 GB total for the default stack —
`RAG/README.md`), costs nothing per suggestion — the team's own pitch
material states this as a deliberate design property: *"No fee per code. No
fee per user. No cloud bill if it runs inside the hospital... The cost does
not grow as the hospital codes more"* (`DEPLOYMENT-PREP.md`, "What it
costs"). For a public hospital operating under NHSO-funded budgets (Chapter
1, §1.1), a workload whose AI cost scales with patient volume is a much
harder sell than a fixed one-time GPU purchase.
**3. Availability and vendor independence.** RAG is explicitly built as an
**optional** service in this architecture — the rest of the system keeps
working with it switched off (Chapter 4, §4.3) — but a cloud API dependency
would add an external network/vendor-uptime failure mode to a workflow the
team wants to degrade gracefully, not fail hard, if AI assistance is
unavailable.

The trade-off the team is making, explicitly, is **retrieval quality and
model capability for data control and cost predictability**. A 0.5B–8B
locally-hosted model is materially weaker than a frontier cloud model; the
mitigation the codebase applies is to lean harder on retrieval grounding
(the `unverified_codes` check, the system prompt's "answer only from
context" instruction, and the coder-taught "Suggest & Learn" rules layer —
all detailed in Chapter 4) rather than model scale, which is consistent with
the "RAG prompting substantially improved base LLM performance" finding
above (the German tumor-diagnosis comparative study).

## 2.4 What the reviewed related work does *not* cover — the gap this project targets

Synthesizing §2.1–2.3, three gaps in the reviewed prior art are what this
project is positioned against:

1. **No Thai-language, ICD-10-TM-aware assisted-coding product or published
   study was found.** Every CAC product and every RAG-for-ICD paper located
   targets English, German, or Russian coding systems.
2. **Commercial CAC (§2.1) is cloud/enterprise-first**; the local,
   offline-capable, single-GPU-or-less deployment model this project targets
   (Chapter 3) is a different operating point, aimed at a resource-constrained
   public hospital rather than a large private health system.
3. **Published RAG-for-coding studies (§2.2) measure retrospectively against
   already-coded records** (e.g., the ED ICD-10-CM comparison); none of them
   are deployed as a live, human-in-the-loop coder tool with a reversible
   write-back to a real hospital information system — which is what Chapter 4
   describes this project as having built (approve/reopen, audit journal,
   diff-based write-back). **[TODO]**: once available, a head-to-head accuracy
   comparison of this system's suggestions against the partner hospital's own
   historical coding (the same methodology as the Klang et al. ED study
   above) would be the strongest possible addition to this chapter and to
   Chapter 7 — it does not exist yet and must not be fabricated here.
