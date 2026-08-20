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
# Title sitting on the same line after the code
_TITLE_RE = re.compile(
    r"^([A-Z]\d{2}(?:\.\d{1,4})?|\d{2}\.\d{1,2})\s+([A-Za-z][^\n]{3,100}?)\s*$",
    re.MULTILINE,
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

    # Ask the index like a coder would — diagnosis + procedure angles.
    query = (
        "Suggest ICD-10 diagnosis codes and ICD-9 procedure codes for this case.\n\n"
        f"{text[:3500]}"
    )
    mode, hits = retrieve_chunks(query, top_k=top_k or 12, mode="plain")
    if not hits:
        mode, hits = retrieve_chunks(query, top_k=top_k or 12, mode="graph")

    # Codes the coder taught NOT to use here. Whatever the references say,
    # this list wins — an excluded code must never reach the suggestions.
    banned = {c["code"] for n in notes for c in n.get("codes", [])
              if c.get("role") == "exclude"}

    # code -> {system, description, confidence, source}
    found: dict[str, dict[str, Any]] = {}
    for h in hits:
        # A coder rule is not a code list: scraping it would harvest the very
        # codes it forbids. Its codes are added deliberately below.
        if (h.get("metadata") or {}).get("kind") == learn.LEARNED_KIND:
            continue
        chunk = h.get("text") or ""
        score = float(h.get("score") or 0.0)
        conf = _score_to_confidence(score)
        source = str(h.get("source") or "knowledge")

        for code, title in _TITLE_RE.findall(chunk):
            _offer(found, code, title, conf, source)

        for code in _ICD10_RE.findall(chunk):
            _offer(found, code, None, conf, source)
        for code in _ICD9_RE.findall(chunk):
            _offer(found, code, None, conf, source)

    # The taught codes themselves, above anything the references suggested:
    # principal first, and never the excluded ones.
    for note in notes:
        for c in note.get("codes", []):
            if c.get("role") == "exclude":
                continue
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
        "hits_used": len(hits),
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
) -> None:
    code = code.strip().upper() if code[:1].isalpha() else code.strip()
    if code in _SKIP or len(code) < 3:
        return
    system = "ICD-10" if code[0].isalpha() else "ICD-9"
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
