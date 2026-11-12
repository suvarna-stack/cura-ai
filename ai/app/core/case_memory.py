"""Past cases a coder approved: examples and a test set (step 3 of the plan).

Every approved case is a chart plus the codes a trained coder chose for it.
That is the best teaching material the system can get, and it is the
hospital's own:

* As a candidate source: a new chart that reads like an approved one is
  likely to need some of the same codes. The codes of the closest past cases
  are offered next to the codebook hits, with the case as evidence.
* As examples for the model: the closest past cases are shown to the LLM
  as worked examples before it reads the new chart (few-shot).
* As the real test set: ``scripts/eval_suggest.py --gold`` scores the
  pipeline on these cases, leaving each case out of its own memory.

File: ``data/cases/approved_cases.jsonl``, one JSON object per line::

    {"id": "...", "sections": {"Chief Complaint": "...", "Assessment": "..."},
     "icd10": ["J18.9", "E11.9"], "icd9": ["87.44"]}

(``text`` may be given instead of ``sections``.) First code = principal.
``backend/scripts/export_approved_cases.sql`` writes this file from the
backend database. It holds patient charts: it stays on the hospital server,
like the database it comes from, and is git-ignored.
"""
from __future__ import annotations

import json
import logging
import math
import threading
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from app.config import get_settings
from app.core.codebook import _features  # same Thai/English features

logger = logging.getLogger(__name__)


def case_text(rec: dict[str, Any]) -> str:
    """Chart text in the same "Label: value" shape the backend sends."""
    if rec.get("text"):
        return str(rec["text"])
    lines = []
    for label, value in (rec.get("sections") or {}).items():
        if isinstance(value, list):
            value = "\n".join(str(v) for v in value)
        if value:
            lines.append(f"{label}: {value}")
    return "\n".join(lines)


@dataclass
class Similar:
    case: dict[str, Any]
    score: float


class CaseMemory:
    def __init__(self, cases: Iterable[dict[str, Any]]):
        self.cases = [c for c in cases if c.get("icd10") or c.get("icd9")]
        df: dict[str, int] = defaultdict(int)
        feats = []
        for c in self.cases:
            f = _features(_core_text(c))
            feats.append(f)
            for k in f:
                df[k] += 1
        n = max(1, len(self.cases))
        self._idf = {k: math.log((n + 1) / (v + 1)) + 1.0 for k, v in df.items()}
        self._vecs = [self._weigh(f) for f in feats]

    def _weigh(self, f) -> dict[str, float]:
        vec = {k: v * self._idf.get(k, 1.0) for k, v in f.items()}
        norm = math.sqrt(sum(x * x for x in vec.values())) or 1.0
        return {k: x / norm for k, x in vec.items()}

    def similar(self, text: str, k: int = 3, min_score: float = 0.3,
                exclude_id: str | None = None) -> list[Similar]:
        if not self.cases:
            return []
        q = self._weigh(_features(_core_text({"text": text})))
        scored = []
        for c, v in zip(self.cases, self._vecs):
            if exclude_id is not None and str(c.get("id")) == str(exclude_id):
                continue
            s = sum(w * v.get(f, 0.0) for f, w in q.items())
            if s >= min_score:
                scored.append(Similar(c, round(s, 4)))
        scored.sort(key=lambda x: -x.score)
        return scored[:k]

    def __len__(self) -> int:
        return len(self.cases)


def _core_text(rec: dict[str, Any]) -> str:
    """Compare charts on what the patient came with and what the doctor
    concluded. Drug lists and vitals look alike across every chart."""
    from app.core.extract import split_sections

    sec = split_sections(case_text(rec))
    parts = [sec.get(k, "") for k in ("complaint", "history", "diagnosis", "procedure")]
    core = "\n".join(p for p in parts if p)
    return core or case_text(rec)[:1500]


def memory_path() -> Path:
    return get_settings().data_dir / "cases" / "approved_cases.jsonl"


def load_cases(path: Path | None = None) -> list[dict[str, Any]]:
    path = path or memory_path()
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                logger.warning("approved_cases: skipped a bad line")
    return out


_memory: CaseMemory | None = None
_lock = threading.Lock()


def get_memory() -> CaseMemory:
    global _memory
    if _memory is None:
        with _lock:
            if _memory is None:
                _memory = CaseMemory(load_cases())
                logger.info("Case memory: %d approved cases", len(_memory))
    return _memory


def set_memory(mem: CaseMemory | None) -> None:
    global _memory
    _memory = mem


def as_example(sim: Similar, codebook_index) -> dict[str, Any]:
    """Turn a past case into a worked example for the LLM: the chart, and the
    diagnoses / procedures written as the TITLES of the approved codes (the
    model is asked for terms, never codes)."""
    def names(codes):
        out = []
        for c in codes:
            e = codebook_index.get(c) if codebook_index else None
            out.append({"term": e.title if e else c, "evidence": ""})
        return out

    return {"text": case_text(sim.case),
            "answer": {"diagnoses": names(sim.case.get("icd10") or []),
                       "procedures": names(sim.case.get("icd9") or [])}}
