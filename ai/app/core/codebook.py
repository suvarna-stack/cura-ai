"""One searchable entry per ICD code (step 1 of the accuracy plan).

The old /suggest searched 800-character slices of the PDF manuals. One slice
held dozens of codes that all shared one score, and one of the three manuals
(S0053, the WHO rules volume) has no code list at all, so its index pages fed
the same unrelated codes (B36.9, I11 ...) into every case.

This module keeps a *codebook* instead: one record per code with its English
title, its Thai title when a source has one, and extra search terms
(inclusion terms from the ICD-9-CM tabular list, common abbreviations).
Each record is searched on its own, so a code is scored by how well ITS
names match a diagnosis, never by the company it keeps on a PDF page.

Search is lexical and needs no model: TF-IDF over English words, character
trigrams (so a typo like "tolsillitis" still lands) and Thai character
bigrams/trigrams (Thai has no spaces between words). An optional dense
score from bge-m3 can be mixed in later; the lexical score alone is what the
tests and the 42-case eval run on.

The codebook is built once by ``scripts/build_codebook.py`` and saved to
``data/codebook/codebook.json``. Rebuild it when a new code table arrives.
"""
from __future__ import annotations

import json
import logging
import math
import re
import threading
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from app.config import get_settings

logger = logging.getLogger(__name__)

ICD10 = "ICD-10"
ICD9 = "ICD-9"

# ICD-10 with or without the dot: J02.9, J029, M79.10, M7910, J00, S76.4
_ICD10_ANY = re.compile(r"^([A-Z])(\d{2})\.?(\d{0,3})$")
_ICD9_ANY = re.compile(r"^(\d{2})\.?(\d{0,2})$")
_THAI = re.compile(r"[฀-๿]")
_THAI_RUN = re.compile(r"[฀-๿]+")
_WORD = re.compile(r"[a-z0-9]+")

# Words that carry no meaning for picking a code. "unspecified" and "other"
# are kept out on purpose: they are in thousands of titles and would make
# every query look like a match.
_STOP = {
    "a", "an", "and", "or", "of", "the", "in", "on", "at", "to", "with",
    "without", "due", "by", "for", "from", "as", "is", "not", "nos", "nec",
    "unspecified", "other", "specified", "site", "type", "classified",
    "elsewhere", "see", "also", "code", "use", "additional", "any", "part",
    # side and severity: in a chart they describe THIS patient, in a title
    # they name a different code ("Right hemiparesis", "mild malnutrition")
    "right", "left", "both", "bilateral", "side", "mild", "moderate", "severe",
}


def normalize_code(raw: str, system: str | None = None) -> str | None:
    """Canonical code text, or None when ``raw`` is not a code of ``system``.

    ICD-10 gets its dot back (J029 -> J02.9). ICD-9-CM procedure codes keep
    the NN.N / NN.NN shape. A bare two-digit ICD-9 category (``51``) is kept
    as is.
    """
    code = (raw or "").strip().upper().rstrip(".")
    code = code.replace(" ", "")
    if system in (None, ICD10):
        m = _ICD10_ANY.match(code)
        if m:
            letter, num, tail = m.groups()
            return f"{letter}{num}.{tail}" if tail else f"{letter}{num}"
    if system in (None, ICD9):
        m = _ICD9_ANY.match(code)
        if m:
            head, tail = m.groups()
            return f"{head}.{tail}" if tail else head
    return None


def system_of(code: str) -> str:
    return ICD10 if code[:1].isalpha() else ICD9


# --------------------------------------------------------------- records

@dataclass
class Entry:
    code: str
    system: str
    title_en: str = ""
    title_th: str = ""
    terms: list[str] = field(default_factory=list)   # synonyms / inclusion terms
    sources: list[str] = field(default_factory=list)

    @property
    def title(self) -> str:
        return self.title_en or self.title_th or self.code

    def names(self) -> list[tuple[str, float]]:
        """Every searchable name with its weight. The main titles count in
        full; inclusion terms a little less, so "Acute pharyngitis" beats a
        code that only lists it as one of many examples."""
        out: list[tuple[str, float]] = []
        if self.title_en:
            out.append((self.title_en, 1.0))
        if self.title_th:
            out.append((self.title_th, 1.0))
        out.extend((t, 0.9) for t in self.terms if t)
        return out

    def to_json(self) -> dict[str, Any]:
        d = {"code": self.code, "system": self.system,
             "title_en": self.title_en, "title_th": self.title_th}
        if self.terms:
            d["terms"] = self.terms
        if self.sources:
            d["sources"] = self.sources
        return d

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "Entry":
        return cls(code=d["code"], system=d["system"],
                   title_en=d.get("title_en", ""), title_th=d.get("title_th", ""),
                   terms=list(d.get("terms", [])),
                   sources=list(d.get("sources", [])))


def merge_entries(entries: Iterable[Entry]) -> dict[str, Entry]:
    """Fold several sources into one record per code.

    The first English and first Thai title seen win (pass the most trusted
    source first); every other title becomes a search term so nothing a
    source knew is lost.
    """
    out: dict[str, Entry] = {}
    for e in entries:
        cur = out.get(e.code)
        if cur is None:
            out[e.code] = Entry(e.code, e.system, e.title_en, e.title_th,
                                list(dict.fromkeys(e.terms)), list(e.sources))
            continue
        for attr in ("title_en", "title_th"):
            new = getattr(e, attr)
            if not new:
                continue
            if not getattr(cur, attr):
                setattr(cur, attr, new)
            elif _key(new) != _key(getattr(cur, attr)) and new not in cur.terms:
                cur.terms.append(new)
        for t in e.terms:
            if t and t not in cur.terms and _key(t) not in (_key(cur.title_en), _key(cur.title_th)):
                cur.terms.append(t)
        for s in e.sources:
            if s not in cur.sources:
                cur.sources.append(s)
    return out


def _key(s: str) -> str:
    return " ".join(s.lower().split())


# --------------------------------------------------------------- features

def _features(text: str) -> Counter:
    """Sparse bag of features for one name or one query."""
    feats: Counter = Counter()
    low = text.lower()
    words = [w for w in _WORD.findall(low) if w not in _STOP]
    for w in words:
        if w.isdigit() and len(w) > 2:
            continue
        feats["w:" + _stem(w)] += 1.0
        padded = f"#{w}#"
        if len(w) >= 4:
            for i in range(len(padded) - 2):
                feats["c:" + padded[i:i + 3]] += 0.25
    for run in _THAI_RUN.findall(text):
        for n in (2, 3):
            for i in range(len(run) - n + 1):
                feats[f"t{n}:" + run[i:i + n]] += 0.5 if n == 2 else 1.0
    return feats


def _stem(w: str) -> str:
    """Tiny English stemmer: enough to join plural / adjective forms that
    show up in notes vs titles (calculi/calculus, hemorrhoids/hemorrhoid)."""
    for suf, rep in (("ies", "y"), ("itis", "itis"), ("ses", "sis"), ("es", "e"),
                     ("s", "")):
        if w.endswith(suf) and len(w) > len(suf) + 3:
            return w[: -len(suf)] + rep
    return w


# --------------------------------------------------------------- the index

@dataclass
class Hit:
    entry: Entry
    score: float          # 0..1 cosine of the best-matching name
    matched: str          # which name matched best


class CodebookIndex:
    """TF-IDF cosine over every name of every code, max over names."""

    def __init__(self, entries: Iterable[Entry]):
        self.entries: list[Entry] = list(entries)
        self.by_code: dict[str, Entry] = {e.code: e for e in self.entries}
        # code -> True when other codes sit under it (J02 has J02.0, J02.9):
        # a category is not what a coder submits when a child exists.
        self.has_children: set[str] = set()
        codes = set(self.by_code)
        for c in codes:
            parent = c.split(".")[0] if "." in c else None
            if parent and parent in codes:
                self.has_children.add(parent)
            if "." in c and len(c.split(".")[1]) == 2:
                p4 = c[:-1]
                if p4 in codes:
                    self.has_children.add(p4)

        self._rows: list[tuple[int, str, float, dict[str, float]]] = []
        df: Counter = Counter()
        raw: list[tuple[int, str, float, Counter]] = []
        from app.core.extract import expand   # "OA left knee" -> + osteoarthritis
        for i, e in enumerate(self.entries):
            for name, weight in e.names():
                f = _features(expand(name))
                if not f:
                    continue
                raw.append((i, name, weight, f))
                df.update(f.keys())
        n = max(1, len(raw))
        self._idf = {k: math.log((n + 1) / (v + 1)) + 1.0 for k, v in df.items()}
        self._postings: dict[str, list[int]] = defaultdict(list)
        for r, (i, name, weight, f) in enumerate(raw):
            vec = self._weigh(f)
            self._rows.append((i, name, weight, vec))
            for k in vec:
                self._postings[k].append(r)

    def _weigh(self, f: Counter) -> dict[str, float]:
        vec = {k: v * self._idf.get(k, 1.0) for k, v in f.items()}
        norm = math.sqrt(sum(x * x for x in vec.values())) or 1.0
        return {k: x / norm for k, x in vec.items()}

    def search(self, query: str, system: str | None = None, k: int = 10,
               min_score: float = 0.0) -> list[Hit]:
        q = self._weigh(_features(query))
        if not q:
            return []
        acc: dict[int, float] = defaultdict(float)
        for feat, w in q.items():
            for r in self._postings.get(feat, ()):
                acc[r] += w * self._rows[r][3][feat]
        best: dict[int, tuple[float, str]] = {}
        for r, s in acc.items():
            i, name, weight, _ = self._rows[r]
            e = self.entries[i]
            if system and e.system != system:
                continue
            s *= weight
            if name.lower().startswith("other "):
                s *= 0.95            # "Other X" = specified elsewhere; plain X wins a tie
            if e.code in self.has_children:
                s *= 0.92            # prefer the billable leaf over its header
            if s > best.get(i, (0.0, ""))[0]:
                best[i] = (s, name)
        ranked = sorted(best.items(), key=lambda kv: (-kv[1][0], self.entries[kv[0]].code))
        return [Hit(self.entries[i], round(s, 4), name)
                for i, (s, name) in ranked[:k] if s >= min_score]

    def get(self, code: str) -> Entry | None:
        return self.by_code.get(code)

    def __len__(self) -> int:
        return len(self.entries)


# --------------------------------------------------------------- storage

def codebook_path() -> Path:
    return get_settings().data_dir / "codebook" / "codebook.json"


def save(entries: Iterable[Entry], path: Path | None = None) -> Path:
    path = path or codebook_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted((e.to_json() for e in entries), key=lambda d: (d["system"], d["code"]))
    path.write_text(json.dumps({"version": 1, "entries": rows}, ensure_ascii=False,
                               indent=0), encoding="utf-8")
    return path


def load_entries(path: Path | None = None) -> list[Entry]:
    path = path or codebook_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [Entry.from_json(d) for d in data.get("entries", [])]


_index: CodebookIndex | None = None
_lock = threading.Lock()


def get_index() -> CodebookIndex:
    """The process-wide index, built lazily from the saved codebook."""
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                entries = load_entries()
                if not entries:
                    logger.warning("Codebook is empty (%s missing). Run "
                                   "scripts/build_codebook.py.", codebook_path())
                _index = CodebookIndex(entries)
                logger.info("Codebook ready: %d codes", len(_index))
    return _index


def set_index(index: CodebookIndex | None) -> None:
    """Swap the index (tests, or after a rebuild)."""
    global _index
    _index = index


# --------------------------------------------------------------- parsers
# Used by scripts/build_codebook.py. Each returns a list of Entry.

_PAGE_NOISE = (
    "มาตรฐานเวชระเบียน", "และแนวทางการบันทึก", "ICD 10 TM For PCU",
    "ICD-10-TM for PCU", "การวินิฉัยโรค", "การวินิจฉัยโรค", "ศัพท์ทางการแพทย์",
)


def parse_bilingual_pages(pages: Iterable[str], source: str) -> list[Entry]:
    """The ICD-10-TM for PCU quick-reference tables: a code on its own line,
    then the Thai name, then the English name, possibly wrapped.

    A Thai line that comes AFTER the English name is a section heading
    ("โรคระบบกล้ามเนื้อ"), not part of the entry, and is dropped.
    """
    out: list[Entry] = []
    for text in pages:
        cur: dict[str, Any] | None = None
        for line in text.splitlines():
            s = line.strip()
            if not s or s.isdigit() or any(n in s for n in _PAGE_NOISE) or s == "ICD-10":
                continue
            code = normalize_code(s, ICD10) if " " not in s else None
            if code:
                if cur:
                    out.append(_finish(cur, source))
                cur = {"code": code, "th": [], "en": []}
                continue
            if cur is None:
                continue
            if _THAI.search(s):
                if cur["en"]:
                    continue          # heading after the entry
                cur["th"].append(s)
            else:
                cur["en"].append(s)
        if cur:
            out.append(_finish(cur, source))
    return [e for e in out if e.title_en or e.title_th]


def _finish(cur: dict[str, Any], source: str) -> Entry:
    th = _clean(" ".join(cur["th"]))
    en = _clean(" ".join(cur["en"]))
    # "+รหัสสาเหตุ" = "add the external-cause code": an instruction, not a name
    th = re.sub(r"\s*\+\s*รหัสสาเหตุ", "", th).strip()
    return Entry(cur["code"], ICD10, en, th, [], [source])


def _clean(s: str) -> str:
    s = " ".join(s.replace("\u0000", "").split())
    # catalog titles that repeat their own code ("Urticaria U78.422")
    s = re.sub(r"\s+[A-Z]\d{2}\.\d{1,3}$", "", s)
    s = s.replace("�", "").replace("ส าอาง", "สำอาง")
    return s.strip(" ;,.:")


_ICD9_LINE = re.compile(r"^(\d{2}(?:\.\d{1,2})?)\s+(\S.{2,})$")
_ICD9_NOISE = re.compile(r"(New code|Revised code|4th digit required|^OPERATIONS ON|^PROCEDURES AND INTERVENTIONS)")


_OPEN_END = re.compile(r"(:|\b(?:of|by|with|for|to|and|or|in|on|from|the|using))\s*$", re.I)


def parse_icd9_tabular(pages: Iterable[str], source: str) -> list[Entry]:
    """ICD-9-CM Volume 3 tabular list: "NN.NN Title" lines. Plain lines under
    a code, before any Excludes/Code also note, are its inclusion terms
    ("Rhinoseptoplasty" under 21.84) and become search terms."""
    out: list[Entry] = []
    for text in pages:
        cur: Entry | None = None
        mode = "terms"
        prefix = ""   # "Repair of aneurysm by:" waiting for its list items
        for line in text.splitlines():
            s = " ".join(line.split())
            if not s or _ICD9_NOISE.search(s):
                continue
            m = _ICD9_LINE.match(s)
            if m and not re.match(r"^\d{2}\.\d{1,2}\s*[-–]", s):
                code = normalize_code(m.group(1), ICD9)
                title = _clean(m.group(2))
                if code and len(title) >= 3 and not title[0].isdigit():
                    if cur:
                        out.append(cur)
                    cur = Entry(code, ICD9, title, "", [], [source])
                    mode = "terms"
                    prefix = ""
                    continue
            if cur is None:
                continue
            low = s.lower()
            if low.startswith(("excludes", "code also", "note", "includes", "omit code",
                               "that with", "use additional")):
                mode = "skip" if not low.startswith("includes") else "terms"
                continue
            if mode != "terms" or s[0].isdigit() or s.startswith(("[", "(", "•")):
                continue
            if re.search(r"\d{2}\.\d", s):
                continue          # a cross-reference ("tranquilizer 99.26"), not a name
            s = s.replace("®", "").strip()
            if not (3 <= len(s) <= 80 and s[0].isalpha()):
                continue
            # The tabular list breaks one name over lines and lists
            # alternatives under a stem: "Repair of aneurysm by:" then
            # "coagulation", "suture" ... Rebuild the full names; a bare
            # "suture" would otherwise match any chart that says suture.
            if _OPEN_END.search(s):
                prefix = (prefix + " " if prefix and s[0].islower() else "") + s.rstrip(":")
                continue
            if s[0].islower():
                if not prefix:
                    continue
                s = f"{prefix} {s}"
            else:
                prefix = ""
            term = _clean(s.rstrip(":"))
            if term and term not in cur.terms:
                cur.terms.append(term)
        if cur:
            out.append(cur)
    return out


def parse_catalog_csv(rows: Iterable[dict[str, str]], source: str) -> list[Entry]:
    """Rows with code, system, title_en, title_th, terms ("a | b | c").
    The format of ``data/codebook/*.csv`` — the place for the hospital's own
    code table (e.g. the full ICD-10-TM with Thai names) when it arrives."""
    out: list[Entry] = []
    for r in rows:
        system = (r.get("system") or "").strip().upper().replace("ICD9", "ICD-9").replace("ICD10", "ICD-10")
        raw = r.get("code") or ""
        system = system if system in (ICD10, ICD9) else system_of(raw.strip())
        code = normalize_code(raw, system)
        if not code and re.fullmatch(r"[0-9A-Z.]{3,10}", raw.strip().upper()):
            # A hospital table is trusted as written: Thai extension codes
            # (dental / TTM procedures like 2G01811) have their own shapes.
            code = raw.strip().upper()
        if not code:
            continue
        terms =[t.strip() for t in (r.get("terms") or "").split("|") if t.strip()]
        out.append(Entry(code, system, _clean(r.get("title_en") or ""),
                         _clean(r.get("title_th") or ""), terms, [source]))
    return out
