"""Suggest & Learn — the coder-taught knowledge layer on top of the references.

A coder types a rule in plain language (Thai or English) in the Agent chat:

    "ผู้ป่วยเบาหวานที่มี AKI ให้ลง E11.22 เป็นหลัก ตามด้วย N17.9 ไม่ต้องลง N18.9"
    "Post-op fever after appendectomy: use T81.4, not R50.9, when the op note
     says wound infection."

This module turns that sentence into a structured note (scenario, codes with
roles, rule, reason), stores it, and indexes it into the SAME vector store the
uploaded PDFs live in — so it is retrieved, cited and pointed out like any
other source. Learning happens at retrieval time, not in model weights: a note
is visible, editable and deletable, which is the only version of "the AI
learned it" a hospital can audit.

Extraction is LLM-first with a deterministic fallback. The default local model
is 0.5B and unreliable at JSON (see suggest.py), so every LLM-proposed code is
verified against the raw text before it survives, and if the JSON never parses
the regex path alone still produces a usable draft.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.core import registry
from app.core.vectorstore import get_store

logger = logging.getLogger(__name__)

# Chunk metadata marker + source prefix. rag.py's filtering and pinning key
# off these, so keep the two files in sync.
LEARNED_KIND = "learned"
LEARNED_PREFIX = "learned:"

_ICD10_RE = re.compile(r"\b[A-Z]\d{2}(?:\.\d{1,4})?\b")
_ICD9_RE = re.compile(r"\b\d{2,3}\.\d{1,2}\b")
# Title sitting on the same line after a code, inside a retrieved reference
# chunk — how a taught code gets its official description.
_TITLE_RE = re.compile(
    r"^\s*([A-Z]\d{2}(?:\.\d{1,4})?|\d{2,3}\.\d{1,2})\s+([^\n]{4,90}?)\s*$",
    re.MULTILINE,
)

# Language cues, EN + TH. Deliberately explicit rather than model-decided:
# classification has to be instant and predictable, and a 0.5B model deciding
# "is the coder asking or teaching?" is neither.
_TEACH_CUES = (
    "always code", "always use", "never code", "never use", "do not code",
    "don't code", "do not use", "don't use", "should be coded", "must be coded",
    "remember that", "note that", "rule:", "our hospital", "we code", "we use",
    "learn this", "learn that", "from now on", "instead of", "code first",
    "avoid coding",
    "ให้ลง", "ต้องลง", "ไม่ต้องลง", "ห้ามลง", "ให้ใช้", "ต้องใช้", "ไม่ต้องใช้",
    "ห้ามใช้", "จำไว้", "จดจำ", "กฎ", "ที่โรงพยาบาล", "เราลง", "เราใช้",
    "ตามด้วย", "เป็นหลัก", "แทนที่จะ", "สอน",
)
_ASK_CUES = (
    "?", "what ", "which ", "how ", "why ", "when should", "can i", "should i",
    "explain", "difference between", "อะไร", "ไหม", "หรือไม่", "อย่างไร",
    "ทำไม", "คืออะไร",
)

_PRINCIPAL_CUES = ("principal", "primary", "pdx", "code first", "main diagnosis",
                   "เป็นหลัก", "โรคหลัก", "การวินิจฉัยหลัก", "ลงหลัก")
_EXCLUDE_CUES = ("do not code", "don't code", "do not use", "don't use",
                 "never code", "never use", "avoid", "instead of", "rather than",
                 "not ", "ไม่ต้องลง", "ห้ามลง", "ไม่ต้องใช้", "ห้ามใช้", "ไม่ใช้",
                 "แทนที่จะ", "ไม่ควรลง")
_SEQUENCE_CUES = ("then", "followed by", "before", "after", "sequence",
                  "ตามด้วย", "ก่อน", "หลังจาก", "ลำดับ", "แล้วค่อย")

_VALID_ROLES = ("principal", "secondary", "exclude")


# --------------------------- store ---------------------------
_lock = threading.Lock()


def _path():
    return get_settings().data_dir / "learned_notes.json"


def _load() -> dict[str, dict[str, Any]]:
    path = _path()
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            logger.warning("learned_notes.json unreadable — starting empty")
    return {}


def _save(data: dict[str, dict[str, Any]]) -> None:
    _path().write_text(json.dumps(data, indent=2, ensure_ascii=False),
                       encoding="utf-8")


def all_notes(include_inactive: bool = True) -> list[dict[str, Any]]:
    """Every stored note, newest first."""
    with _lock:
        notes = list(_load().values())
    if not include_inactive:
        notes = [n for n in notes if n.get("active", True)]
    return sorted(notes, key=lambda n: n.get("created_at", ""), reverse=True)


def get_note(note_id: str) -> dict[str, Any] | None:
    with _lock:
        return _load().get(note_id)


def save_note(draft: dict[str, Any], created_by: str = "",
              created_by_id: int | None = None) -> dict[str, Any]:
    """Persist a (possibly coder-edited) draft and index it for retrieval.

    `created_by_id` is the author's stable key. This module never enforces
    anything with it — it has no idea who is calling — it only records it, so
    the caller that DOES hold the identity (medcode-api, which reads it off
    the token) can refuse an edit or a delete from anyone but the author. On
    an edit the original author is kept: editing does not transfer ownership.
    """
    note = _normalize(draft)
    note_id = note.get("id") or _new_id()
    existing = get_note(note_id) or {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    note.update({
        "id": note_id,
        "created_by": existing.get("created_by") or created_by or "coder",
        "created_by_id": existing.get("created_by_id", created_by_id),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
        "hits": existing.get("hits", 0),
    })

    with _lock:
        data = _load()
        data[note_id] = note
        _save(data)

    _index(note)
    export_reference_csvs()
    logger.info("Learned note %s saved (%d codes, doc_type=%s).",
                note_id, len(note["codes"]), note.get("doc_type"))
    return note


def set_active(note_id: str, active: bool) -> dict[str, Any] | None:
    """Mute a note without losing it — retrieval skips inactive notes."""
    with _lock:
        data = _load()
        note = data.get(note_id)
        if note is None:
            return None
        note["active"] = active
        note["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        _save(data)
    _index(note)
    export_reference_csvs()
    return note


def delete_note(note_id: str) -> bool:
    with _lock:
        data = _load()
        if note_id not in data:
            return False
        del data[note_id]
        _save(data)
    get_store().delete_by_source(LEARNED_PREFIX + note_id)
    export_reference_csvs()
    return True


def bump_hits(note_ids: list[str]) -> None:
    """Count how often a note actually fired — the review list sorts by it."""
    if not note_ids:
        return
    with _lock:
        data = _load()
        touched = False
        for nid in note_ids:
            if nid in data:
                data[nid]["hits"] = int(data[nid].get("hits", 0)) + 1
                touched = True
        if touched:
            _save(data)


def _new_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"ln_{stamp}_{uuid.uuid4().hex[:6]}"


# --------------------------- admin-page CSV export ---------------------------
# What the AI learned must be visible where the admin already looks: every
# change to the taught rules regenerates one CSV per code system in the
# uploads folder and registers it in the document registry under the matching
# upload box, so "Learned rules ICD-10.csv" sits in the ICD-10 box of the
# AI Training page next to the uploaded references. The file is a generated
# VIEW of learned_notes.json — never the source of truth, always safe to
# delete (it comes back on the next taught rule). Because it is a real
# registered upload, "Train AI" re-ingests it and "Sync codes to system DB"
# reads taught codes like any other reference.

_EXPORT_HEADER = ("code", "description", "role", "scenario", "rule", "reason",
                  "taught_by", "taught_on")
_EXPORTS = {
    "ICD-10": {"doc_type": "icd10", "source": "Learned rules ICD-10",
               "filename": "Learned rules ICD-10.csv"},
    "ICD-9": {"doc_type": "icd9cm", "source": "Learned rules ICD-9",
              "filename": "Learned rules ICD-9.csv"},
}
_EXPORT_ROWS_PER_PAGE = 50   # keep in sync with documents._CSV_ROWS_PER_PAGE


def export_reference_csvs() -> None:
    """Regenerate the per-system learned-rules CSVs. Never raises — a failed
    export must not break saving the note itself (the JSON store already has
    it, and the next save retries the export)."""
    try:
        _export_reference_csvs()
    except Exception:
        logger.exception("Learned-rules CSV export failed (notes are safe)")


def _export_reference_csvs() -> None:
    notes = all_notes(include_inactive=False)
    for system, spec in _EXPORTS.items():
        rows: list[list[str]] = []
        # oldest first: a reference file grows at the bottom, like a logbook
        for note in reversed(notes):
            for c in note.get("codes", []):
                if c.get("system") != system:
                    continue
                rows.append([
                    c.get("code", ""),
                    c.get("description", ""),
                    c.get("role", "secondary"),
                    note.get("scenario", ""),
                    note.get("rule", ""),
                    note.get("reason", ""),
                    note.get("created_by", ""),
                    (note.get("created_at") or "")[:10],
                ])
        _write_export(spec, rows)


def _write_export(spec: dict[str, str], rows: list[list[str]]) -> None:
    source = spec["source"]
    path = get_settings().upload_dir / spec["filename"]

    if not rows:
        # last rule of this system gone -> the generated file goes with it
        if registry.get(source) is not None:
            registry.remove(source)
        if path.exists():
            path.unlink()
        try:                     # chunks only exist if a rebuild ingested it
            get_store().delete_by_source(source)
        except Exception:
            pass
        return

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(_EXPORT_HEADER)
    writer.writerows(rows)
    raw = buf.getvalue().encode("utf-8-sig")   # BOM: Excel opens Thai correctly
    path.write_bytes(raw)

    entry = registry.get(source) or {}
    fields: dict[str, Any] = {
        "filename": spec["filename"],
        "ext": ".csv",
        "size_bytes": len(raw),
        "pages": (len(rows) + _EXPORT_ROWS_PER_PAGE - 1) // _EXPORT_ROWS_PER_PAGE,
        "chunks": len(rows),
        "status": "indexed",     # each note is embedded individually on save
        "progress": 100,
        "error": None,
        "doc_type": spec["doc_type"],
    }
    if not entry.get("rank"):    # newcomer reads last in its box
        peers = [d.get("rank") or 0 for d in registry.all_documents()
                 if d.get("doc_type") == spec["doc_type"] and d["source"] != source]
        fields["rank"] = (max(peers) + 1) if peers else 1
    registry.upsert(source, **fields)


def _index(note: dict[str, Any]) -> None:
    """(Re)embed the note as a one-chunk document in the shared vector store."""
    source = LEARNED_PREFIX + note["id"]
    try:
        _index_now(note, source)
    except Exception as exc:                 # Chroma down / embedder missing
        logger.warning("Note %s stored but not embedded (%s) — it still "
                       "matches by scenario, only semantic recall is lost.",
                       note["id"], exc)


def _index_now(note: dict[str, Any], source: str) -> None:
    store = get_store()
    store.delete_by_source(source)          # re-save = replace, never duplicate
    if not note.get("active", True):
        return
    store.add(
        chunks=[note_to_text(note)],
        source=source,
        metadata={
            "kind": LEARNED_KIND,
            "note_id": note["id"],
            "doc_type": note.get("doc_type") or "",
            "created_by": note.get("created_by", ""),
        },
        ids=[f"{source}:c0"],
        per_chunk_meta=[{"page": 0}],
    )


# --------------------------- rendering ---------------------------

def note_to_text(note: dict[str, Any]) -> str:
    """The note as the LLM reads it — a compact, unambiguous rule block."""
    lines = [f"CODER RULE (taught by {note.get('created_by') or 'coder'} "
             f"on {(note.get('created_at') or '')[:10]})"]
    if note.get("scenario"):
        lines.append(f"WHEN: {note['scenario']}")
    for c in note.get("codes", []):
        role = {"principal": "principal diagnosis",
                "secondary": "secondary code",
                "exclude": "DO NOT code"}.get(c.get("role", "secondary"), "code")
        desc = f" — {c['description']}" if c.get("description") else ""
        lines.append(f"CODE: {c['code']} ({c.get('system', 'ICD-10')}, {role}){desc}")
    if note.get("rule"):
        lines.append(f"RULE: {note['rule']}")
    if note.get("reason"):
        lines.append(f"REASON: {note['reason']}")
    if note.get("raw_text"):
        lines.append(f"ORIGINAL: {note['raw_text']}")
    return "\n".join(lines)


def note_summary(note: dict[str, Any]) -> str:
    """One-line form for the "note applies" callout in chat and on a case."""
    use = ", ".join(c["code"] for c in note.get("codes", [])
                    if c.get("role") != "exclude")
    avoid = ", ".join(c["code"] for c in note.get("codes", [])
                      if c.get("role") == "exclude")
    bits: list[str] = []
    if note.get("scenario"):
        bits.append(note["scenario"])
    if use:
        bits.append(f"→ {use}")
    if avoid:
        bits.append(f"(not {avoid})")
    if note.get("rule") and note["rule"] not in " ".join(bits):
        bits.append(f"· {note['rule']}")
    return " ".join(bits) or (note.get("raw_text") or "")[:160]


# --------------------------- normalization ---------------------------

def _normalize(draft: dict[str, Any]) -> dict[str, Any]:
    """Coerce an LLM draft or a coder-edited payload into the stored shape."""
    raw = str(draft.get("raw_text") or "").strip()
    codes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in draft.get("codes") or []:
        if isinstance(c, str):
            c = {"code": c}
        if not isinstance(c, dict):
            continue
        code = str(c.get("code") or "").strip().upper()
        if not code or code in seen:
            continue
        if not (_ICD10_RE.fullmatch(code) or _ICD9_RE.fullmatch(code)):
            continue
        seen.add(code)
        role = str(c.get("role") or "secondary").lower()
        codes.append({
            "code": code,
            "system": "ICD-10" if code[0].isalpha() else "ICD-9",
            "description": str(c.get("description") or "").strip(),
            "role": role if role in _VALID_ROLES else "secondary",
        })

    systems = {c["system"] for c in codes}
    doc_type = None
    if systems == {"ICD-10"}:
        doc_type = "icd10"
    elif systems == {"ICD-9"}:
        doc_type = "icd9cm"

    return {
        "id": str(draft.get("id") or "").strip() or None,
        "scenario": _trim(draft.get("scenario"), 240),
        "codes": codes,
        "rule": _trim(draft.get("rule"), 240),
        "reason": _trim(draft.get("reason"), 400),
        "raw_text": raw[:2000],
        "language": "th" if _is_thai(raw or str(draft.get("scenario") or "")) else "en",
        "doc_type": doc_type,
        "active": bool(draft.get("active", True)),
        "extraction": str(draft.get("extraction") or ""),
    }


def _trim(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def _is_thai(text: str) -> bool:
    return any("฀" <= ch <= "๿" for ch in text)


# --------------------------- intent ---------------------------

# An instruction verb aimed directly at a code is teaching even without a
# global cue word — "post-op wound infection: use T81.4, not R50.9". So is a
# declarative fact ("the code for game addiction is F63.8"). Lowercase
# because classify_intent matches on the lowercased text.
_CODE_SHAPE = r"(?:[a-z]\d{2}(?:\.\d{1,4})?|\d{2,3}\.\d{1,2})"
_INSTRUCT_CODE_RE = re.compile(rf"\b(?:use|code|add|ลง|ใช้)\s+{_CODE_SHAPE}")
_NOT_CODE_RE = re.compile(rf"\b(?:not|ไม่ใช่)\s+{_CODE_SHAPE}")
_IS_CODE_RE = re.compile(rf"\b(?:is|=|คือ)\s*{_CODE_SHAPE}")


def classify_intent(text: str) -> dict[str, Any]:
    """Is the coder ASKING a question or TEACHING a rule?

    Deterministic on purpose (see the cue lists above). The UI uses this for
    the "looks like you're teaching me" nudge while the explicit Teach button
    stays the reliable path — a wrong guess only offers, it never saves.
    """
    low = (text or "").lower().strip()
    if not low:
        return {"intent": "ask", "confidence": 0}

    teach = sum(1 for cue in _TEACH_CUES if cue in low)
    teach += sum(1 for pat in (_INSTRUCT_CODE_RE, _NOT_CODE_RE, _IS_CODE_RE)
                 if pat.search(low))
    ask = sum(1 for cue in _ASK_CUES if cue in low)
    has_code = bool(_ICD10_RE.search(text) or _ICD9_RE.search(text))

    score = teach * 2 + (1 if has_code else 0) - ask * 2
    # A trailing question mark is decisive — "always code E11.9?" is a question.
    if low.endswith("?"):
        score -= 2
    intent = "teach" if score >= 2 else "ask"
    confidence = max(0, min(99, 50 + score * 12)) if intent == "teach" else 0
    return {"intent": intent, "confidence": confidence}


# --------------------------- extraction ---------------------------

_EXTRACT_PROMPT = (
    "You extract medical-coding rules into JSON. The coder writes a rule in "
    "English or Thai. Reply with ONE JSON object and nothing else:\n"
    '{"scenario": "when this rule applies, short", '
    '"codes": [{"code": "E11.22", "role": "principal|secondary|exclude"}], '
    '"rule": "what to do, one sentence", "reason": "why, or empty"}\n'
    'Use role "exclude" for codes the coder says NOT to use. Copy codes '
    "exactly as written. Keep scenario and rule in the coder's own language."
)


def extract_note(text: str, created_by: str = "",
                 created_by_id: int | None = None) -> dict[str, Any]:
    """Free-text rule -> unsaved draft note, ready for the confirm card."""
    raw = (text or "").strip()
    if not raw:
        return _normalize({"raw_text": ""})

    base = _regex_extract(raw)
    llm = _llm_extract(raw)
    if llm:
        # Trust the model for prose, never for codes: keep only codes the coder
        # actually typed, and let it re-label the roles of those codes.
        typed = {c["code"] for c in base["codes"]}
        roles = {str(c.get("code", "")).strip().upper(): c.get("role")
                 for c in llm.get("codes") or [] if isinstance(c, dict)}
        for c in base["codes"]:
            role = str(roles.get(c["code"]) or "").lower()
            if role in _VALID_ROLES:
                c["role"] = role
        dropped = [c for c in (llm.get("codes") or [])
                   if isinstance(c, dict)
                   and str(c.get("code", "")).strip().upper() not in typed]
        if dropped:
            logger.info("Dropped %d hallucinated code(s) from extraction.",
                        len(dropped))
        # A grounded model sentence describes the situation better than the
        # clause-splitting heuristic does; an ungrounded one is discarded and
        # the deterministic scenario stands.
        base["scenario"] = _grounded(llm.get("scenario"), raw, 240) or base["scenario"]
        # The rule line is built from the confirmed codes and their roles, so
        # it is strictly more complete than the model's summary — the model
        # only speaks when the sentence named no codes at all.
        base["rule"] = base["rule"] or _grounded(llm.get("rule"), raw, 240)

    # Reason is only ever the coder's: a small model asked "why?" invents a
    # rationale every time, and an invented rationale in a coding rule is
    # worse than none.
    base["reason"] = _because(raw)

    for c in base["codes"]:
        if not c["description"]:
            c["description"] = _describe(c["code"])

    draft = _normalize({**base, "raw_text": raw})
    draft["created_by"] = created_by
    draft["created_by_id"] = created_by_id
    draft["extraction"] = "llm" if llm else "rules"
    return draft


def _grounded(value: Any, raw: str, limit: int) -> str:
    """Keep an LLM sentence only when it came from the coder's sentence.

    A 0.5B model asked for JSON happily returns the schema's own example text
    ("when this rule applies, short"), and a slightly larger one paraphrases
    things the coder never said. Requiring shared words with the original is
    a cheap, language-agnostic way to throw both away.
    """
    text = _trim(value, limit)
    if len(text) < 6:
        return ""
    low = text.lower()
    if any(ghost in low for ghost in _PROMPT_GHOSTS):
        return ""
    shared = _tokens(text) & _tokens(raw)
    return text if shared else ""


# Fragments of the extraction prompt itself — if they come back, the model is
# echoing the schema rather than reading the coder.
_PROMPT_GHOSTS = (
    "when this rule applies", "what to do, one sentence", "why, or empty",
    "principal|secondary|exclude",
)

# "because" in both languages: the only licence to record a reason.
_REASON_CUES = ("because", "since ", "as per", "the reason", "guideline says",
                "เพราะ", "เนื่องจาก", "ตามกฎ", "ตามแนวทาง")


def _because(raw: str) -> str:
    """The coder's own justification, or nothing. Never the model's."""
    low = raw.lower()
    for cue in _REASON_CUES:
        pos = low.find(cue)
        if pos != -1:
            return _trim(raw[pos:], 400)
    return ""


def _llm_extract(text: str) -> dict[str, Any] | None:
    """Ask the local LLM for structured JSON. None when it fails — the regex
    draft is already usable, so extraction must never hard-fail on the model."""
    try:
        from app.core.llm import get_llm
        out = get_llm().generate(
            [{"role": "system", "content": _EXTRACT_PROMPT},
             {"role": "user", "content": text}],
            max_new_tokens=256,
            temperature=0.0,
        )
    except Exception as exc:                      # model missing / OOM / offline
        logger.warning("LLM extraction unavailable (%s) — using rules only", exc)
        return None

    start, end = out.find("{"), out.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(out[start:end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _regex_extract(text: str) -> dict[str, Any]:
    """Deterministic draft: codes by shape, roles by the cue words around them.

    This is the floor the feature stands on — it works with no LLM at all.
    """
    spans: list[tuple[str, int, int]] = []
    for pattern in (_ICD10_RE, _ICD9_RE):
        for m in pattern.finditer(text):
            spans.append((m.group(0).upper(), m.start(), m.end()))
    spans.sort(key=lambda s: s[1])

    roles = _assign_roles(text, spans)
    codes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for code, _, _ in spans:
        if code in seen:
            continue
        seen.add(code)
        codes.append({"code": code,
                      "system": "ICD-10" if code[0].isalpha() else "ICD-9",
                      "description": "",
                      "role": roles.get(code, "secondary")})
    # "the code for X is Y": a single declared code is the principal answer
    if len(codes) == 1 and codes[0]["role"] == "secondary" \
            and _IS_CODE_RE.search(text.lower()):
        codes[0]["role"] = "principal"

    # Codes keep the order they were typed in; the coder's order IS the
    # sequencing instruction ("E11.22 then N17.9").
    return {
        "scenario": _scenario_of(text),
        "codes": codes,
        "rule": _rule_of(text, codes),
        "reason": "",
        "raw_text": text,
    }


def _assign_roles(text: str, spans: list[tuple[str, int, int]],
                  ) -> dict[str, str]:
    """Attach each cue word to the code it is actually talking about.

    Direction matters, and a window around the code is not enough: in
    "code E11.22 as principal, add N17.9, do not code N18.9" every code sits
    within a few words of both cues. So:

      exclusions read FORWARD  — "do not code X", "ไม่ต้องลง X", "not X"
      principal reads EITHER WAY to the nearest code — "code X as principal",
                                  "ให้ลง X เป็นหลัก", "principal dx is X"

    First cue to claim a code wins; everything unclaimed is a secondary code.
    """
    low = text.lower()
    roles: dict[str, str] = {}

    for cue in _EXCLUDE_CUES:
        # A bare "not" is only trustworthy right next to the code
        # ("use T81.4, not R50.9") — anything further away is prose.
        limit = 15 if cue.strip() == "not" else 40
        for pos in _occurrences(low, cue):
            end = pos + len(cue)
            target = next((s for s in spans
                           if s[1] >= pos and s[1] - end <= limit), None)
            if target and target[0] not in roles:
                roles[target[0]] = "exclude"

    for cue in _PRINCIPAL_CUES:
        for pos in _occurrences(low, cue):
            end = pos + len(cue)
            target = min(
                (s for s in spans
                 if min(abs(s[1] - end), abs(pos - s[2])) <= 40),
                key=lambda s: min(abs(s[1] - end), abs(pos - s[2])),
                default=None,
            )
            if target and target[0] not in roles:
                roles[target[0]] = "principal"

    return roles


def _occurrences(haystack: str, needle: str) -> list[int]:
    out: list[int] = []
    start = haystack.find(needle)
    while start != -1:
        out.append(start)
        start = haystack.find(needle, start + 1)
    return out


# Verbs that start the instruction half of a sentence. Only used to find
# where the scenario ends — "code"/"ลง" is an action, not a condition.
_INSTRUCTION_CUES = ("code ", "add ", "use ", "ลง ", "ใช้ ")


# "…code for <condition> is <CODE>" — the condition sits between the two.
_FACT_SCENARIO_RE = re.compile(
    r"(?:\bfor|ของ|สำหรับ)\s*(.+?)\s*(?:\bis\b|คือ|=)", re.IGNORECASE)


def _scenario_of(text: str) -> str:
    """The clinical half of the sentence — everything before the instruction.

    Coders write "situation: what to do", in both languages, so a colon wins
    outright; otherwise the first instruction word marks the boundary.
    """
    # Declarative fact — "icd 10 code for game addiction is F63.8": the
    # scenario is the condition, not the boilerplate around it.
    m = _FACT_SCENARIO_RE.search(text)
    if m:
        head = _trim(_ICD10_RE.sub("", _ICD9_RE.sub("", m.group(1))), 240)
        if len(head) >= 3:
            return head

    colon = text.find(":")
    if 8 <= colon <= 160:
        return _trim(_ICD10_RE.sub("", _ICD9_RE.sub("", text[:colon])), 240)

    low = text.lower()
    cut = len(text)
    for cue in (*_TEACH_CUES, *_SEQUENCE_CUES, *_INSTRUCTION_CUES):
        pos = low.find(cue)
        if 0 < pos < cut:
            cut = pos
    head = text[:cut].strip(" ,.:;—-")
    if len(head) < 8:                       # instruction-first phrasing
        head = re.split(r"[.\n]", text)[0]
    # Codes belong in the codes list, not in the WHEN line.
    head = _ICD10_RE.sub("", _ICD9_RE.sub("", head))
    return _trim(head, 240)


def _rule_of(text: str, codes: list[dict[str, Any]]) -> str:
    """A short imperative summary, built from what the cues actually said."""
    low = text.lower()
    parts: list[str] = []
    principal = [c["code"] for c in codes if c["role"] == "principal"]
    secondary = [c["code"] for c in codes if c["role"] == "secondary"]
    exclude = [c["code"] for c in codes if c["role"] == "exclude"]
    if principal:
        parts.append(f"code {', '.join(principal)} as principal")
    if secondary:
        parts.append(f"add {', '.join(secondary)}")
    if exclude:
        parts.append(f"do not code {', '.join(exclude)}")
    if any(cue in low for cue in _SEQUENCE_CUES) and len(codes) > 1:
        order = " → ".join(c["code"] for c in codes if c["role"] != "exclude")
        if order:
            parts.append(f"sequence {order}")
    return "; ".join(parts)


def _describe(code: str) -> str:
    """Official title for a taught code, pulled from the indexed references."""
    try:
        hits = get_store().find_text(code, limit=2)
    except Exception:                              # index not ready yet
        return ""
    for h in hits:
        for found, title in _TITLE_RE.findall(h.get("text") or ""):
            if found.upper() == code:
                title = title.strip(" .;,:")
                if 4 <= len(title) <= 90:
                    return title
    return ""


# --------------------------- matching ---------------------------
# "Point out when that scenario appears": given a question or a case
# narrative, which taught rules apply? Lexical rather than embedded — a
# handful of notes competing against thousands of guideline chunks would
# lose every vector race, and this way a note fires the moment it is saved
# with no re-embedding and no threshold tuning per language.

_MATCH_THRESHOLD = 0.16
_STOP = {
    "the", "and", "for", "with", "has", "have", "was", "were", "that", "this",
    "patient", "case", "code", "codes", "icd", "icd10", "icd9", "diagnosis",
    "ผู้ป่วย", "รหัส", "การ", "ของ", "และ", "ที่", "ให้",
}


def _tokens(text: str) -> set[str]:
    """Latin words + Thai character 3-grams (Thai does not space its words)."""
    low = (text or "").lower()
    words = {w for w in re.findall(r"[a-z][a-z0-9]{2,}", low) if w not in _STOP}
    thai = "".join(re.findall(r"[฀-๿]+", low))
    grams = {thai[i:i + 3] for i in range(len(thai) - 2)}
    return words | grams


def _codes_in(text: str) -> set[str]:
    return {c.upper() for c in
            (*_ICD10_RE.findall(text or ""), *_ICD9_RE.findall(text or ""))}


def match_notes(text: str, limit: int = 3,
                threshold: float = _MATCH_THRESHOLD) -> list[dict[str, Any]]:
    """Active notes whose scenario matches this text, best first.

    Each result is the stored note plus a 0-1 `match` score. An exact code
    overlap is decisive on its own: if the coder taught a rule about N17.9
    and N17.9 is on the case, that rule applies regardless of wording.
    """
    notes = all_notes(include_inactive=False)
    if not notes:
        return []

    q_tokens = _tokens(text)
    q_codes = _codes_in(text)
    if not q_tokens and not q_codes:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for note in notes:
        n_text = " ".join([
            note.get("scenario", ""),
            note.get("rule", ""),
            note.get("reason", ""),
            note.get("raw_text", ""),
            *(c.get("description", "") for c in note.get("codes", [])),
        ])
        n_tokens = _tokens(n_text)
        overlap = len(q_tokens & n_tokens)
        denom = max(4, min(len(q_tokens), len(n_tokens)))
        score = overlap / denom if denom else 0.0

        n_codes = {c["code"] for c in note.get("codes", [])}
        shared = q_codes & n_codes
        if shared:
            score = max(score, 0.55) + 0.15 * (len(shared) - 1)

        score = min(1.0, score)
        if score >= threshold:
            scored.append((score, note))

    scored.sort(key=lambda pair: (-pair[0], pair[1].get("created_at", "")))
    return [{**note, "match": round(score, 3)} for score, note in scored[:limit]]


def matching_chunks(text: str, limit: int = 2) -> list[dict[str, Any]]:
    """Matched notes in retrieval-hit shape, ready to be pinned into context.

    Score 1.0 on purpose: a rule the hospital's own coder taught outranks
    whatever the reference PDFs happen to say around it.
    """
    hits: list[dict[str, Any]] = []
    for note in match_notes(text, limit=limit):
        source = LEARNED_PREFIX + note["id"]
        hits.append({
            "id": f"{source}:c0",
            "text": note_to_text(note),
            "source": source,
            "display_name": f"Coder note — {note.get('created_by') or 'coder'}",
            "score": 1.0,
            "via": f"learned note ({int(note['match'] * 100)}% match)",
            "metadata": {
                "source": source,
                "kind": LEARNED_KIND,
                "note_id": note["id"],
                "doc_type": note.get("doc_type") or "",
            },
        })
    return hits
