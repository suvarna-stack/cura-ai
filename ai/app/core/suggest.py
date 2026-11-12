"""Suggest ICD-10 / ICD-9 codes for a chart.

How it works now (2026-11, accuracy plan steps 1-3):

1. Read the chart (``extract``): the doctor's written diagnoses, the
   procedures done, and only when no diagnosis is written, the complaint.
   Rules always run; the local LLM adds terms when it is switched on.
2. Look each term up in the codebook (``codebook``): one entry per ICD code
   with English and Thai names. A code is scored by how well ITS names match
   the term, and is shown with the chart words it came from.
3. Past approved cases that read like this chart (``case_memory``) add their
   codes, and confirm codebook hits that agree with them.
4. Optionally the local LLM puts the candidates in order. It can only reorder
   codes already found; it cannot add one.
5. Coder-taught rules (Suggest & Learn) still go first, and their excluded
   codes are still removed last.

The old method (search the PDF manuals with the whole note, scrape every
code-shaped token from the top pages) is kept as a fallback for a column the
codebook could not fill, ranked after the codebook's answers. It is what
scored 0/42 on the September test, so it is never the first choice.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.config import get_settings
from app.core import case_memory, codebook, extract, learn
from app.core.rag import retrieve_chunks

logger = logging.getLogger(__name__)

# Diagnosis: letter + 2 digits, optional decimal  ->  S82.6, E11.9, M23.8
_ICD10_RE = re.compile(r"\b([A-Z]\d{2}(?:\.\d{1,4})?)\b")
# Procedure (ICD-9-CM Vol.3 style): NN.N / NN.NN  ->  93.27, 81.51
_ICD9_RE = re.compile(r"\b(\d{2}\.\d{1,2})\b")
_SHAPE = {"ICD-10": _ICD10_RE, "ICD-9": _ICD9_RE}

# Title sitting on the same line after the code — one per system, so a
# procedure line can never be read out of a diagnosis pass and vice versa.
_TITLE_RE = {
    "ICD-10": re.compile(
        r"^([A-Z]\d{2}(?:\.\d{1,4})?)\s+([A-Za-z][^\n]{3,100}?)\s*$",
        re.MULTILINE,
    ),
    "ICD-9": re.compile(
        r"^(\d{2}\.\d{1,2})\s+([A-Za-z][^\n]{3,100}?)\s*$",
        re.MULTILINE,
    ),
}

# One pass per upload box. Each box is searched on its OWN, with its own
# question and its own doc_type filter, and only its own code shape is read
# out of what comes back: the ICD-10 column is built from the ICD-10 library
# and ICD-10 codes, the ICD-9 column from the ICD-9 library and ICD-9 codes.
# The single "suggest ICD-10 and ICD-9 codes" search this replaced always
# resolved to "mixed", which switched the box filter OFF and then scraped
# both shapes out of every chunk — that is how a page number in an ICD-10
# PDF ended up in the ICD-9 column as an 83%-confident procedure.
_BOXES = (
    ("ICD-10", "icd10",
     "Which ICD-10 diagnosis codes fit this patient's chief complaint and "
     "present illness?"),
    ("ICD-9", "icd9cm",
     "Which ICD-9-CM procedure codes fit the procedures performed in this "
     "case?"),
)

# Noise codes that show up in every guideline TOC / running head
_SKIP = {
    "ICD", "WHO", "PDF", "CT", "MRI", "HIV", "AIDS",  # not codes; defensive
}


def suggest_codes(
    clinical_text: str,
    *,
    top_k: int | None = None,
    max_per_system: int = 8,
) -> dict[str, Any]:
    """Return structured ICD suggestions grounded in the knowledge index."""
    text = (clinical_text or "").strip()
    if len(text) < 20:
        return {"codes": [], "mode": "none", "hits_used": 0, "notes": []}

    # Suggest & Learn: rules this hospital's coder taught for this scenario.
    # They ride along with the suggestions so the case page can point them out
    # ("Learned note applies") above the machine's own guesses.
    notes = learn.match_notes(text, limit=3)

    # Codes the coder taught NOT to use here. Whatever the references say,
    # this list wins — an excluded code must never reach the suggestions.
    banned = {c["code"] for n in notes for c in n.get("codes", [])
              if c.get("role") == "exclude"}

    settings = get_settings()
    # code -> {system, description, confidence, source, tier, order}
    # tier: 0 coder rule · 1 written diagnosis/procedure · 2 past case or
    # complaint only · 3 old PDF scraping. Lower tier is shown first.
    found: dict[str, dict[str, Any]] = {}
    hit_ids: set[str] = set()
    mode = "codebook"

    strong: dict[str, bool] = {"ICD-10": False, "ICD-9": False}
    if settings.suggest_engine != "rag":
        strong = _codebook_pass(text, found)

    # The old method, only for a column the codebook left empty of anything
    # the chart actually states (or everywhere when suggest_engine="rag").
    modes: list[str] = []
    for system, box, ask in _BOXES:
        if settings.suggest_engine != "rag" and (
                strong[system] or settings.suggest_rag_fallback is False):
            continue
        modes.append(_rag_pass(system, box, ask, text, top_k, found, hit_ids))
    if settings.suggest_engine == "rag" or (modes and not any(strong.values())):
        mode = modes[0] if modes else "plain"

    # The taught codes themselves, above anything the references suggested:
    # principal first, and never the excluded ones.
    for note in notes:
        for c in note.get("codes", []):
            if c.get("role") == "exclude":
                continue
            # No system= here on purpose: a code the hospital's coder typed
            # is trusted as typed, including shapes neither regex knows (Thai
            # TTM procedure codes, say). Only SCRAPED codes are shape-checked.
            _offer(found, c["code"], c.get("description") or None,
                   99 if c.get("role") == "principal" else 96,
                   f"coder note ({note.get('created_by') or 'coder'})",
                   tier=0, order=0 if c.get("role") == "principal" else 1)

    for code in banned:
        found.pop(code, None)

    # Taught codes first (the hospital's own instruction outranks a guess),
    # then what the chart states, in chart order (principal first), then
    # past cases / complaint-only guesses, then the old PDF scraping.
    ranked = sorted(
        found.values(),
        key=lambda c: (
            c.get("tier", 3),
            c.get("order", 99),
            0 if c["description"] and c["description"] != c["code"] else 1,
            -c["confidence"],
            c["code"],
        ),
    )
    ranked = [{k: v for k, v in c.items() if k not in ("tier", "order")}
              for c in ranked]

    icd10: list[dict[str, Any]] = []
    icd9: list[dict[str, Any]] = []
    for row in ranked:
        bucket = icd9 if row["system"] == "ICD-9" else icd10
        if len(bucket) >= max_per_system:
            continue
        bucket.append(row)

    learn.bump_hits([n["id"] for n in notes])
    return {
        "codes": icd10 + icd9,
        "mode": mode,
        "hits_used": len(hit_ids),
        "notes": [
            {
                "id": n["id"],
                "summary": learn.note_summary(n),
                "scenario": n.get("scenario", ""),
                "rule": n.get("rule", ""),
                "codes": n.get("codes", []),
                "created_by": n.get("created_by", ""),
                "created_at": n.get("created_at", ""),
                "via": f"learned note ({int(n.get('match', 0) * 100)}% match)",
            }
            for n in notes
        ],
    }


def _offer(
    found: dict[str, dict[str, Any]],
    code: str,
    title: str | None,
    confidence: int,
    source: str,
    system: str | None = None,
    *,
    tier: int = 3,
    order: int = 99,
) -> None:
    """Record one candidate.

    ``system`` is the box the code was READ FROM. Pass it for anything scraped
    out of a document: the code must then also LOOK like that system's code or
    it is dropped, so the two columns can never swap contents. Leave it None
    for a code a coder typed — that one is trusted as typed.

    ``tier`` / ``order`` decide the display order (see suggest_codes); a code
    found twice keeps its best tier and order.
    """
    code = code.strip().upper() if code[:1].isalpha() else code.strip()
    if code in _SKIP or len(code) < 3:
        return
    shape = "ICD-10" if code[0].isalpha() else "ICD-9"
    if system is None:
        system = shape
    elif shape != system or not _SHAPE[system].fullmatch(code):
        return
    desc = _clean_title(title) if title else None

    cur = found.get(code)
    if cur is None:
        found[code] = {
            "code": code,
            "system": system,
            "description": desc or code,
            "confidence": confidence,
            "source": source,
            "tier": tier,
            "order": order,
        }
        return
    better_place = (tier, order) < (cur.get("tier", 3), cur.get("order", 99))
    same_tier_stronger = tier == cur.get("tier", 3) and confidence > cur["confidence"]
    if better_place:
        cur["tier"], cur["order"] = tier, order
    if better_place or same_tier_stronger:
        cur["source"] = source
    # Keep the stronger score; fill a blank title if we just found one.
    cur["confidence"] = max(cur["confidence"], confidence)
    if desc and (cur["description"] == cur["code"] or len(desc) > len(cur["description"])):
        cur["description"] = desc


# ------------------------------------------------------------------ codebook

# ICD-10-TM U50-U79 are Thai traditional medicine diagnoses: right for a TTM
# clinic, wrong for an OPD chart that never mentions it.
_TTM_CODE = re.compile(r"^U[5-7]\d")
_TTM_WORDS = re.compile(r"(แพทย์แผนไทย|แผนไทย|traditional medicine|ttm)", re.I)


def _codebook_pass(text: str, found: dict[str, dict[str, Any]]) -> dict[str, bool]:
    """Steps 1-4 of the new pipeline. Returns, per system, whether the chart
    itself (a written diagnosis / procedure) produced a candidate."""
    settings = get_settings()
    index = codebook.get_index()
    strong = {"ICD-10": False, "ICD-9": False}
    if not len(index):
        return strong

    memory = case_memory.get_memory()
    similar = memory.similar(text, k=3, min_score=settings.suggest_case_min_score) \
        if len(memory) else []

    ex = extract.rules_extract(text)
    if _llm_on(settings.suggest_llm_extract):
        examples = [case_memory.as_example(s, index) for s in similar[:2]]
        ex = extract.merge(ex, extract.llm_extract(text, examples))

    allow_ttm = bool(_TTM_WORDS.search(text))
    per_term = settings.suggest_per_term
    # Round-robin over terms: the best code of term 1, of term 2, ... then
    # the runner-up of each. Principal first, every written diagnosis seen.
    groups: list[tuple[extract.Term, str, list[codebook.Hit]]] = []
    for term in ex.all():
        system = codebook.ICD9 if term.kind == "procedure" else codebook.ICD10
        hits = _search(index, term, system, per_term + 4)
        hits = [h for h in hits if allow_ttm or not _TTM_CODE.match(h.entry.code)]
        if not hits:
            continue
        top = hits[0].score
        # A procedure name is short and generic ("therapy", "drainage"), so
        # it needs a closer match than a diagnosis to be believed.
        floor = settings.suggest_min_score + (0.1 if term.kind == "procedure" else 0.0)
        keep = [h for h in hits if h.score >= floor and h.score >= top * 0.6]
        if keep:
            groups.append((term, system, keep[:per_term]))
    # Diagnoses keep chart order (the first is the principal). Procedures
    # have no such order; the plainest match goes first.
    groups.sort(key=lambda g: (0 if g[0].kind != "procedure" else 1,
                               0 if g[0].kind != "procedure" else -g[2][0].score))

    for depth in range(per_term):
        for gi, (term, system, hits) in enumerate(groups):
            if depth >= len(hits):
                continue
            h = hits[depth]
            written = term.kind in ("diagnosis", "procedure")
            score = h.score * term.weight
            tier = 1 if written else 2
            _offer(found, h.entry.code, h.entry.title, _to_conf(score),
                   _evidence(term, h), system, tier=tier,
                   order=depth * 100 + _term_order(term, gi))
            if written:
                strong[system] = True

    # Past approved cases: confirm what agrees, add what is missing.
    for rank, sim in enumerate(similar):
        for system, key in ((codebook.ICD10, "icd10"), (codebook.ICD9, "icd9")):
            for pos, code in enumerate(sim.case.get(key) or []):
                code = codebook.normalize_code(code, system) or code
                entry = index.get(code)
                cid = sim.case.get("id", "?")
                if code in found and found[code].get("tier") in (1, 2):
                    found[code]["confidence"] = min(98, found[code]["confidence"] + 4)
                    found[code]["source"] += f" · same as approved case {cid}"
                    continue
                _offer(found, code, entry.title if entry else None,
                       _to_conf(sim.score * 0.9),
                       f"approved case {cid} ({int(sim.score * 100)}% similar)",
                       system, tier=2, order=rank * 10 + pos)

    if _llm_on(settings.suggest_llm_rerank):
        _llm_rerank(text, found)
    return strong


_WITH = re.compile(r"\s+(?:with|due to|secondary to|from|caused by|ร่วมกับ)\s+", re.I)


def _search(index: codebook.CodebookIndex, term: extract.Term, system: str,
            k: int) -> list[codebook.Hit]:
    """Search the whole term, and for "X with Y" also X alone, keeping each
    code's better score. The whole phrase finds combination codes ("COPD
    with acute exacerbation"); the head finds the condition itself when Y is
    only detail ("BPH with lower urinary tract symptoms")."""
    best: dict[str, codebook.Hit] = {}
    queries = [term.text]
    parts = _WITH.split(term.evidence, maxsplit=1)
    if len(parts) == 2 and len(parts[0]) >= 4:
        queries.append(extract.expand(parts[0]))
    for q in queries:
        for h in index.search(q, system=system, k=k):
            if h.entry.code not in best or h.score > best[h.entry.code].score:
                best[h.entry.code] = h
    sides = _sides(term.evidence)
    if sides:
        for code, h in list(best.items()):
            named = _sides(h.matched)
            if named and named != sides:          # "OA knee, bilateral" for a left knee
                best[code] = codebook.Hit(h.entry, round(h.score * 0.9, 4), h.matched)
            elif named == sides:
                best[code] = codebook.Hit(h.entry, round(min(1.0, h.score * 1.05), 4), h.matched)
    return sorted(best.values(), key=lambda h: (-h.score, h.entry.code))[:k]


_SIDE_RE = re.compile(r"\b(right|left|bilateral|both)\b|(ขวา|ซ้าย|ทั้งสองข้าง)", re.I)


def _sides(text: str) -> frozenset[str]:
    norm = {"ขวา": "right", "ซ้าย": "left", "ทั้งสองข้าง": "bilateral", "both": "bilateral"}
    out = set()
    for m in _SIDE_RE.finditer(text or ""):
        w = (m.group(1) or m.group(2)).lower()
        out.add(norm.get(w, w))
    return frozenset(out)


def _term_order(term: extract.Term, group_index: int) -> int:
    # diagnoses before symptoms; within a kind, chart order
    return {"diagnosis": 0, "procedure": 0, "symptom": 40}.get(term.kind, 50) + group_index


def _evidence(term: extract.Term, hit: codebook.Hit) -> str:
    where = {"diagnosis": "diagnosis", "procedure": "procedure",
             "symptom": "complaint"}.get(term.kind, term.kind)
    by = " (AI read)" if term.origin == "llm" else ""
    quote = term.evidence if len(term.evidence) <= 80 else term.evidence[:77] + "..."
    return f'codebook · {where}{by}: "{quote}" ~ {hit.matched}'


def _to_conf(score: float) -> int:
    return max(55, min(98, int(round(55 + 43 * max(0.0, min(1.0, score))))))


def _llm_on(flag: str | bool) -> bool:
    if isinstance(flag, bool):
        return flag
    flag = str(flag).lower()
    if flag in ("1", "true", "on", "yes"):
        return True
    if flag == "auto":
        # The in-process 0.5B model cannot be trusted with JSON; a real
        # local model behind Ollama can.
        return get_settings().llm_backend == "ollama"
    return False


_RERANK_SYSTEM = (
    "You are a hospital clinical coder. Given a chart and candidate ICD codes, "
    "order the candidates from most to least correct for this chart. The "
    "principal diagnosis comes first. Drop a candidate only if the chart "
    'clearly does not support it. Answer JSON only: {"icd10": ["code", ...], '
    '"icd9": ["code", ...]}. Use only codes from the candidate list.'
)


def _llm_rerank(text: str, found: dict[str, dict[str, Any]], llm=None) -> bool:
    """Let the model order the machine-found candidates (tiers 1-2). Codes it
    does not mention keep their place after the ones it ordered; codes it
    invents are ignored. Coder rules (tier 0) are never touched."""
    cands = [c for c in found.values() if c.get("tier") in (1, 2)]
    if len(cands) < 2:
        return False
    listing = "\n".join(f'{c["system"]} {c["code"]}: {c["description"]}' for c in cands[:30])
    try:
        if llm is None:
            from app.core.llm import get_llm
            llm = get_llm()
        raw = llm.generate([
            {"role": "system", "content": _RERANK_SYSTEM},
            {"role": "user", "content": f"Chart:\n{text[:3000]}\n\nCandidates:\n{listing}"},
        ], max_new_tokens=300, temperature=0.0)
        data = extract._parse_json(raw)
    except Exception as e:
        logger.info("LLM rerank unavailable: %s", e)
        return False
    if not data:
        return False
    changed = False
    for key in ("icd10", "icd9"):
        for pos, code in enumerate(data.get(key) or []):
            c = found.get(str(code).strip().upper() if str(code)[:1].isalpha() else str(code).strip())
            if c is None or c.get("tier") not in (1, 2):
                continue
            c["tier"], c["order"] = 1, pos      # model-confirmed, in its order
            c["source"] += " · ordered by AI"
            changed = True
    if changed:
        for c in cands:
            if "ordered by AI" not in c["source"]:
                c["order"] = c.get("order", 99) + 1000
    return changed


# ------------------------------------------------------------------ old RAG

def _rag_pass(system: str, box: str, ask: str, text: str, top_k: int | None,
              found: dict[str, dict[str, Any]], hit_ids: set[str]) -> str:
    """The pre-2026-11 method: search one upload box with the whole note,
    read code + title lines out of the pages that come back."""
    query = f"{ask}\n\n{text[:3500]}"
    mode, hits = retrieve_chunks(query, top_k=top_k or 12, mode="plain",
                                 code_system=box)
    if not hits:
        mode, hits = retrieve_chunks(query, top_k=top_k or 12,
                                     mode="graph", code_system=box)
    for h in hits:
        hit_ids.add(str(h.get("id")))
        meta = h.get("metadata") or {}
        # A coder rule is not a code list: scraping it would harvest the
        # very codes it forbids. Its codes are added deliberately elsewhere.
        if meta.get("kind") == learn.LEARNED_KIND:
            continue
        chunk = h.get("text") or ""
        conf = _score_to_confidence(float(h.get("score") or 0.0))
        source = str(h.get("source") or "knowledge")

        # A code with its title on the line is a real catalogue entry.
        for code, title in _TITLE_RE[system].findall(chunk):
            _offer(found, code, title, conf, source, system)

        # A BARE ICD-9 token is only "two digits, a dot, one or two more"
        # — the same shape as a page reference, a table number, a dose or
        # a lab value. Believe one only when the chunk actually came from
        # the ICD-9 box; an untagged legacy upload has to show a title
        # next to the code (above) to be counted at all.
        if system == "ICD-9" and meta.get("doc_type") != "icd9cm":
            continue
        for code in _SHAPE[system].findall(chunk):
            _offer(found, code, None, conf, source, system)
    return mode


def _clean_title(raw: str) -> str | None:
    title = " ".join(raw.split()).rstrip(";,.:")
    for tail in (" or", " and"):
        if title.lower().endswith(tail):
            title = title[: -len(tail)].rstrip(";,.:")
    if len(title) < 4:
        return None
    if _ICD10_RE.match(title.split()[0]) or _ICD9_RE.match(title.split()[0]):
        return None
    return title


def _score_to_confidence(score: float) -> int:
    """Map cosine / graph scores into a readable 55–98% band."""
    # Chroma distances often arrive already as similarity-ish floats in [0,1]
    # or as raw scores > 1 from graph expansion — clamp either way.
    if score > 1.5:
        score = 1.0 / (1.0 + score)  # distance-like → similarity-ish
    pct = int(round(55 + max(0.0, min(1.0, score)) * 43))
    return max(55, min(98, pct))
