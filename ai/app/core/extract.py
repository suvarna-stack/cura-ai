"""Read the note and pull out what should be coded (step 2 of the plan).

The old /suggest searched the manuals with the WHOLE note. A note is mostly
symptoms, vitals and drug orders, so the search drifted to whatever page
shared the most words. Coders do it the other way round: find the doctor's
diagnosis and the procedures done, then look each one up.

``extract_terms`` returns short terms, each with the line it came from:

* diagnoses — from the Assessment / Diagnosis / Impression part of the
  chart, first one = principal. When a chart has no diagnosis written, the
  chief complaint and present illness are used instead, at lower weight.
* procedures — from Plan / Procedure / Operation, minus drug orders and
  follow-up advice.

Two ways to get them, merged:

1. Rules (always on, no model). Section labels, splitting, dropping
   "rule out ..." and negated findings, and expanding abbreviations
   (DM, HT, CXR, I&D ...).
2. The local LLM (optional, ``suggest_llm_extract``). It reads the note and
   answers in JSON. It catches diagnoses written in Thai or buried in free
   text. Its terms are only search terms: every code still has to be found
   in the codebook, so the model cannot invent a code.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Term:
    text: str             # what to search for
    kind: str             # "diagnosis" | "procedure" | "symptom"
    evidence: str         # the line it was read from
    weight: float = 1.0   # 1.0 = doctor's diagnosis; lower for symptoms
    rank: int = 0         # order in the chart (0 = principal)
    origin: str = "rules" # "rules" | "llm" | "example"


@dataclass
class Extraction:
    diagnoses: list[Term] = field(default_factory=list)
    procedures: list[Term] = field(default_factory=list)
    symptoms: list[Term] = field(default_factory=list)
    sections: dict[str, str] = field(default_factory=dict)

    def all(self) -> list[Term]:
        return self.diagnoses + self.procedures + self.symptoms


# ------------------------------------------------------------- sections

_LABELS: dict[str, tuple[str, ...]] = {
    "diagnosis": ("final diagnosis", "principal diagnosis", "discharge diagnosis",
                  "diagnosis", "diagnoses", "assessment", "impression", "dx",
                  "provisional diagnosis", "การวินิจฉัยโรค", "การวินิจฉัย",
                  "วินิจฉัย", "ผลการวินิจฉัย"),
    "procedure": ("procedure", "procedures", "operation", "operations",
                  "treatment procedure", "หัตถการ", "การผ่าตัด"),
    "plan": ("plan", "management", "management/suggestion", "treatment",
             "การรักษา", "แผนการรักษา"),
    "complaint": ("chief complaint", "cc", "อาการสำคัญ"),
    "history": ("present illness", "history of present illness", "pi", "hpi",
                "ประวัติปัจจุบัน", "progression"),
    "exam": ("physical examination", "pe", "physical exam", "ตรวจร่างกาย"),
}
_LABEL_TO_KIND = {lab: kind for kind, labs in _LABELS.items() for lab in labs}
_LABEL_RE = re.compile(
    r"^\s*(?:[-*•]\s*)?(" + "|".join(sorted((re.escape(l) for l in _LABEL_TO_KIND),
                                             key=len, reverse=True)) + r")\s*[:：\-]\s*",
    re.IGNORECASE,
)


def split_sections(text: str) -> dict[str, str]:
    """Group the note's lines under the section they belong to.

    Works on "Label: value" lines as the backend writes them, keeps
    continuation lines with the last label, and also splits an inline
    "... Plan: ..." inside an Assessment line (the hospital writes them as
    one field).
    """
    text = text.replace("\\r\\n", "\n").replace("\r\n", "\n").replace("\\n", "\n")
    out: dict[str, list[str]] = {}
    current = "other"
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        bare = line.strip("[]*#: ").lower()
        if bare in _LABEL_TO_KIND:          # a label on its own line
            current = _LABEL_TO_KIND[bare]
            continue
        m = _LABEL_RE.match(line.lstrip("[*# "))
        if m:
            line = line.lstrip("[*# ")
            current = _LABEL_TO_KIND[m.group(1).lower()]
            line = line[m.end():].strip()
            if not line:
                continue
        # "Common cold Plan: symptomatic treatment" inside one field
        inline = re.split(r"\b(?:plan|management)\s*:\s*", line, maxsplit=1, flags=re.I)
        out.setdefault(current, []).append(inline[0].strip())
        if len(inline) > 1 and inline[1].strip():
            out.setdefault("plan", []).append(inline[1].strip())
    return {k: "\n".join(v) for k, v in out.items() if any(v)}


# ------------------------------------------------------------- abbreviations
# General clinical shorthand seen in Thai hospital charts. These expand a
# term before it is searched; they never map to a code directly.

ABBREVIATIONS: dict[str, str] = {
    "dm": "diabetes mellitus", "t2dm": "type 2 diabetes mellitus",
    "t1dm": "type 1 diabetes mellitus", "ht": "hypertension",
    "htn": "hypertension", "dlp": "dyslipidemia",
    "uri": "upper respiratory infection", "urti": "upper respiratory infection",
    "uti": "urinary tract infection", "age": "acute gastroenteritis",
    "cap": "community acquired pneumonia", "gerd": "gastroesophageal reflux disease",
    "bph": "benign prostatic hyperplasia", "oa": "osteoarthritis",
    "ckd": "chronic kidney disease", "aki": "acute kidney injury",
    "copd": "chronic obstructive pulmonary disease", "chf": "congestive heart failure",
    "mi": "myocardial infarction", "stemi": "st elevation myocardial infarction",
    "cva": "cerebrovascular accident stroke", "tia": "transient ischemic attack",
    "af": "atrial fibrillation", "ihd": "ischemic heart disease",
    "cad": "coronary artery disease", "ida": "iron deficiency anemia",
    "bppv": "benign paroxysmal positional vertigo", "lbp": "low back pain",
    "ca": "carcinoma", "fx": "fracture", "sle": "systemic lupus erythematosus",
    "tb": "tuberculosis", "dhf": "dengue hemorrhagic fever", "df": "dengue fever",
    "ugib": "upper gastrointestinal bleeding", "pud": "peptic ulcer disease",
    "ra": "rheumatoid arthritis", "ckd5": "chronic kidney disease stage 5",
    "esrd": "end stage renal disease", "uc": "ulcerative colitis",
    "ards": "acute respiratory distress syndrome", "dvt": "deep vein thrombosis",
    "pe": "pulmonary embolism", "ae": "acute exacerbation",
    # procedures
    "cxr": "chest x-ray", "ekg": "electrocardiogram ekg", "ecg": "electrocardiogram ekg",
    "i&d": "incision and drainage", "i/d": "incision and drainage",
    "u/s": "ultrasound", "us": "ultrasound", "ct": "computerized tomography ct",
    "mri": "magnetic resonance imaging", "phaco": "phacoemulsification of cataract",
    "iol": "insertion of intraocular lens", "turp": "transurethral prostatectomy",
    "lap chole": "laparoscopic cholecystectomy", "egd": "esophagogastroduodenoscopy",
    "ercp": "endoscopic retrograde cholangiopancreatography",
    "orif": "open reduction internal fixation", "c/s": "cesarean section",
    "nb": "nebulizer", "neb": "nebulizer", "echo": "echocardiogram",
    "ivp": "intravenous pyelogram", "bx": "biopsy", "et": "endotracheal intubation",
    "ett": "endotracheal intubation", "foley": "urinary catheter",
}

_ABBR_RE = re.compile(
    r"(?<![\w&/])(" + "|".join(sorted((re.escape(k) for k in ABBREVIATIONS), key=len,
                                       reverse=True)) + r")(?![\w&/])",
    re.IGNORECASE,
)


def expand(term: str) -> str:
    """"Type 2 DM" -> "Type 2 DM diabetes mellitus". The original stays so an
    exact title match ("DM Type 2") still wins."""
    extra = []
    for m in _ABBR_RE.finditer(term):
        word = m.group(1)
        # Short ones only when written as shorthand: "AGE" yes, "age" no.
        if len(word) <= 4 and word.isalpha() and not word.isupper() \
                and word.lower() not in ("phaco", "neb", "echo", "foley", "fx", "bx"):
            continue
        extra.append(ABBREVIATIONS[word.lower()])
    return term if not extra else f"{term} {' '.join(dict.fromkeys(extra))}"


# ------------------------------------------------------------- rules

# Not coded as a diagnosis in outpatient coding: suspicion, exclusion,
# negated findings, and the doctor's notes about control or plan.
_RULE_OUT = re.compile(r"^\s*(?:r/o|rule out|ruled out|to rule out|suspected|"
                       r"suspect|possible|probable|ddx|differential)\b", re.I)
_NEGATION = re.compile(r"^\s*(?:no|without|not|negative for|ไม่มี|ไม่พบ)\b", re.I)
_QUALIFIER = re.compile(
    r"^\s*(?:mild|moderate|severe|right|left|bilateral|both sides?)\s*$|"
    r"^\s*(?:fair|good|poor|suboptimal|optimal|well|un)?\s*(?:control(?:led)?|"
    r"stable|improved|on \w+|clinically \w+|failed conservative treatment|"
    r"kellgren[- ]lawrence.*|grade \w+|from \w+.*)\s*$", re.I)
_SPLIT = re.compile(r"\s*(?:[;\n]|,(?!\d)|\band\b(?=\s+(?:[A-Z]|r/o))|\s\+\s|\d+\)\s)\s*")

_SITE_ONLY = re.compile(r"^\s*(?:right|left|bilateral|both|upper|lower|at|on|of)\b", re.I)

# Plan items that are not procedures
_NOT_PROC = re.compile(
    r"\b(?:f/u|follow[- ]?up|advice|advise|continue|diet|lifestyle|rest|observe|"
    r"observation|precaution|hydration|control|avoid|exercise|education|"
    r"medication|antibiotic|analgesic|nsaids?|ppi|antihistamine(?! injection)|"
    r"supplement|statin|mucolytic|bronchodilator|steroid|antifungal|"
    r"symptomatic|treatment|refer|consult|npo|tetanus|vaccine|weight|"
    r"\d+\s*(?:days?|wks?|weeks?|mo|months?)|prn|tab|cap|mg)\b", re.I)
_PROC_HINT = re.compile(
    r"(?:ectomy|otomy|ostomy|plasty|scopy|graphy|centesis|biopsy|excision|"
    r"incision|drainage|suture|repair|release|injection|irrigation|"
    r"debridement|x-?ray|cxr|ekg|ecg|ct\b|mri|ultrasound|u/s|echo|nebuli[sz]|"
    r"phaco|iol|i&d|therapy|reduction|removal|insertion|transfusion|"
    r"dressing|catheter|intubation|dialysis|lobectomy|manoeuvre|maneuver|"
    r"ผ่าตัด|เจาะ|เย็บ|ส่องกล้อง|ฉีด|ล้าง)", re.I)


def _pieces(text: str) -> list[str]:
    parts = []
    for p in _SPLIT.split(text):
        p = p.strip(" .:-")
        if len(p) >= 3:
            parts.append(p)
    return parts


def rules_extract(text: str) -> Extraction:
    sec = split_sections(text)
    ex = Extraction(sections=sec)

    for i, piece in enumerate(_pieces(sec.get("diagnosis", ""))):
        if _RULE_OUT.match(piece) or _NEGATION.match(piece) or _QUALIFIER.match(piece):
            continue
        # "Solitary thyroid nodule, right lobe": the site belongs to the
        # diagnosis before it, it is not a second diagnosis.
        if ex.diagnoses and _SITE_ONLY.match(piece):
            prev = ex.diagnoses[-1]
            prev.evidence = f"{prev.evidence}, {piece}"
            prev.text = expand(prev.evidence)
            continue
        ex.diagnoses.append(Term(expand(piece), "diagnosis", piece, 1.0, len(ex.diagnoses)))

    proc_text = "\n".join(t for t in (sec.get("procedure", ""), sec.get("plan", "")) if t)
    explicit = set(_pieces(sec.get("procedure", "")))
    for piece in _pieces(proc_text):
        if piece not in explicit:
            if _NOT_PROC.search(piece) and not _PROC_HINT.search(piece):
                continue
            if not _PROC_HINT.search(piece):
                continue
        # "Phaco + IOL right eye" -> strip trailing laterality / timing words
        clean = re.sub(r"\b(?:today|at opd|right|left|both|bilateral|eye|ear)\b", " ",
                       piece, flags=re.I)
        clean = " ".join(clean.split()) or piece
        ex.procedures.append(Term(expand(clean), "procedure", piece, 1.0, len(ex.procedures)))

    # No diagnosis written: fall back to what the patient came with.
    if not ex.diagnoses:
        for kind, w in (("complaint", 0.75), ("history", 0.55)):
            body = sec.get(kind, "")
            if body:
                first = body.split("\n")[0]
                ex.symptoms.append(Term(expand(first[:300]), "symptom", first[:300], w,
                                        len(ex.symptoms)))
    return ex


# ------------------------------------------------------------- LLM

_SYSTEM = (
    "You are a hospital clinical coder in Thailand. Read the chart and list "
    "what must be coded. Diagnoses: the conditions the doctor diagnosed "
    "(principal first), in short English medical terms. Do not list symptoms "
    "when a diagnosis is written. Do not list 'rule out' or negated "
    "conditions. Procedures: procedures and investigations actually done in "
    "this visit (not drugs, not advice). Never write ICD codes. "
    'Answer with JSON only: {"diagnoses": [{"term": "...", "evidence": "..."}], '
    '"procedures": [{"term": "...", "evidence": "..."}]} where evidence is the '
    "exact words from the chart."
)


def llm_extract(text: str, examples: list[dict[str, Any]] | None = None,
                llm=None) -> Extraction | None:
    """Ask the local model for diagnoses / procedures. None on any failure,
    so the caller simply keeps the rule-based terms."""
    try:
        if llm is None:
            from app.core.llm import get_llm
            llm = get_llm()
        messages = [{"role": "system", "content": _SYSTEM}]
        for ex in examples or []:
            messages.append({"role": "user", "content": ex["text"][:1500]})
            messages.append({"role": "assistant", "content": json.dumps(
                ex["answer"], ensure_ascii=False)})
        messages.append({"role": "user", "content": text[:3500]})
        raw = llm.generate(messages, max_new_tokens=400, temperature=0.0)
        data = _parse_json(raw)
        if data is None:
            logger.info("LLM extract: no JSON in answer")
            return None
    except Exception as e:  # model missing, server down, timeout ...
        logger.info("LLM extract unavailable: %s", e)
        return None

    out = Extraction()
    for kind, key in (("diagnosis", "diagnoses"), ("procedure", "procedures")):
        for i, item in enumerate(data.get(key) or []):
            if isinstance(item, str):
                item = {"term": item}
            term = str(item.get("term") or "").strip()
            if not term or re.fullmatch(r"[A-Z]?\d{2}(\.\d+)?", term):
                continue
            ev = str(item.get("evidence") or term)[:300]
            t = Term(expand(term), kind, ev, 0.95, i, "llm")
            (out.diagnoses if kind == "diagnosis" else out.procedures).append(t)
    return out


def _parse_json(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def merge(rules: Extraction, llm: Extraction | None) -> Extraction:
    """Rules first (they quote the chart exactly); LLM terms added when they
    say something the rules did not."""
    if llm is None:
        return rules
    out = Extraction(list(rules.diagnoses), list(rules.procedures),
                     list(rules.symptoms), rules.sections)
    for attr in ("diagnoses", "procedures"):
        have = {t.evidence.lower() for t in getattr(out, attr)} | \
               {t.text.lower() for t in getattr(out, attr)}
        for t in getattr(llm, attr):
            if t.text.lower() in have or t.evidence.lower() in have:
                continue
            if not getattr(rules, attr):
                t.rank = len(getattr(out, attr))
            else:
                t.rank = len(getattr(out, attr))
                t.weight = 0.85
            getattr(out, attr).append(t)
    if out.diagnoses:
        out.symptoms = []      # a written diagnosis beats the complaint
    return out
