"""Case suggestions must obey the coder's taught rules.

Retrieval and the note store are both stubbed, so these tests are about one
thing only: what a taught rule does to the suggestion list.
"""
import pytest

from app.core import learn, suggest

NARRATIVE = (
    "65F, known type 2 diabetes mellitus, admitted with acute kidney injury "
    "and dehydration. Creatinine 3.1, treated with IV fluids."
)

NOTE = {
    "id": "ln_test_1",
    "scenario": "Diabetic patient with acute kidney injury",
    "rule": "code E11.22 as principal; add N17.9; do not code N18.9",
    "reason": "",
    "raw_text": "",
    "created_by": "Frank",
    "created_at": "2026-08-21T00:00:00+00:00",
    "match": 0.8,
    "codes": [
        {"code": "E11.22", "system": "ICD-10", "description": "", "role": "principal"},
        {"code": "N17.9", "system": "ICD-10", "description": "", "role": "secondary"},
        {"code": "N18.9", "system": "ICD-10", "description": "", "role": "exclude"},
    ],
}

# What the reference PDFs would hand back on their own — N18.9 included.
REFERENCE_HITS = [
    {
        "id": "icd10:p10-c0",
        "source": "icd10.pdf",
        "score": 0.7,
        "text": "N17.9 Acute kidney failure, unspecified\n"
                "N18.9 Chronic kidney disease, unspecified\n"
                "E11.22 Type 2 diabetes mellitus with diabetic chronic kidney disease",
        "metadata": {"page": 10},
    },
]


@pytest.fixture
def index(monkeypatch):
    """Reference hits + one matching coder rule, with hit counting stubbed."""
    monkeypatch.setattr(suggest, "retrieve_chunks",
                        lambda *a, **k: ("plain", REFERENCE_HITS))
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [NOTE])
    monkeypatch.setattr(learn, "bump_hits", lambda ids: None)


def test_excluded_code_never_reaches_the_suggestions(index):
    out = suggest.suggest_codes(NARRATIVE)
    codes = [c["code"] for c in out["codes"]]
    assert "N18.9" not in codes          # the references offered it; the rule wins
    assert "E11.22" in codes and "N17.9" in codes


def test_taught_codes_lead_the_list_and_name_their_author(index):
    out = suggest.suggest_codes(NARRATIVE)
    top = out["codes"][0]
    assert top["code"] == "E11.22"                 # principal, taught
    assert top["confidence"] == 99
    assert "Frank" in top["source"]


def test_the_rule_rides_along_for_the_callout(index):
    out = suggest.suggest_codes(NARRATIVE)
    assert [n["id"] for n in out["notes"]] == ["ln_test_1"]
    assert "E11.22" in out["notes"][0]["summary"]
    assert out["notes"][0]["created_by"] == "Frank"


def test_without_a_matching_rule_nothing_changes(monkeypatch):
    monkeypatch.setattr(suggest, "retrieve_chunks",
                        lambda *a, **k: ("plain", REFERENCE_HITS))
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [])
    out = suggest.suggest_codes(NARRATIVE)
    assert "N18.9" in [c["code"] for c in out["codes"]]
    assert out["notes"] == []
