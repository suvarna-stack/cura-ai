"""Suggest ICD-9 / ICD-10 codes for a clinical narrative via RAG retrieval.

The tiny local LLM is unreliable at structured JSON, so suggestions are built
from retrieved guideline chunks: extract code tokens, attach nearby titles,
and map retrieval scores to confidence. Fast and deterministic for demos.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.core import learn
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

    # code -> {system, description, confidence, source}
    found: dict[str, dict[str, Any]] = {}
    modes: list[str] = []
    hit_ids: set[str] = set()

    for system, box, ask in _BOXES:
        query = f"{ask}\n\n{text[:3500]}"
        mode, hits = retrieve_chunks(query, top_k=top_k or 12, mode="plain",
                                     code_system=box)
        if not hits:
            mode, hits = retrieve_chunks(query, top_k=top_k or 12,
                                         mode="graph", code_system=box)
        modes.append(mode)

        for h in hits:
            hit_ids.add(str(h.get("id")))
            meta = h.get("metadata") or {}
            # A coder rule is not a code list: scraping it would harvest the
            # very codes it forbids. Its codes are added deliberately below.
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
                   f"coder note ({note.get('created_by') or 'coder'})")

    for code in banned:
        found.pop(code, None)

    # Taught codes first (the hospital's own instruction outranks a guess),
    # then codes whose titles we actually saw, then by confidence.
    ranked = sorted(
        found.values(),
        key=lambda c: (
            0 if str(c.get("source", "")).startswith("coder note") else 1,
            0 if c["description"] and c["description"] != c["code"] else 1,
            -c["confidence"],
            c["code"],
        ),
    )

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
) -> None:
    """Record one candidate.

    ``system`` is the box the code was READ FROM. Pass it for anything scraped
    out of a document: the code must then also LOOK like that system's code or
    it is dropped, so the two columns can never swap contents. Leave it None
    for a code a coder typed — that one is trusted as typed.
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
        }
        return
    # Keep the stronger score; fill a blank title if we just found one.
    if confidence > cur["confidence"]:
        cur["confidence"] = confidence
        cur["source"] = source
    if desc and (cur["description"] == cur["code"] or len(desc) > len(cur["description"])):
        cur["description"] = desc


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
