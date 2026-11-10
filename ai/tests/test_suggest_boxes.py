"""Each column is built from its OWN upload box.

The ICD-10 column may only contain ICD-10 codes read out of ICD-10 documents,
and the ICD-9 column only ICD-9 procedure codes read out of ICD-9 documents.
Before the two-pass split, one "suggest ICD-10 and ICD-9 codes" search always
resolved to "mixed" — which switched the box filter off — and then scraped
both code shapes out of every chunk, so a page reference like "10.2" printed
in an ICD-10 PDF arrived in the ICD-9 column as a confident procedure code.
"""
import pytest

from app.core import learn, suggest

NARRATIVE = (
    "Chief Complaint:\nRight lower quadrant abdominal pain for 1 day.\n\n"
    "Present Illness:\nPain began periumbilical, migrated to RLQ, worse over "
    "time, low grade fever, anorexia and nausea. Appendectomy performed."
)

# An ICD-10 reference page. Note "10.2" and "35.8" — a section number and a
# table reference, both exactly ICD-9-procedure-shaped.
ICD10_CHUNK = {
    "id": "icd10:p12-c0",
    "source": "icd10-2019.pdf",
    "score": 0.72,
    "text": "See section 10.2, table 35.8\n"
            "K35.80 Unspecified acute appendicitis\n"
            "K37 Unspecified appendicitis",
    "metadata": {"page": 12, "doc_type": "icd10"},
}

# An ICD-9-CM Vol.3 procedure page.
ICD9_CHUNK = {
    "id": "icd9:p4-c0",
    "source": "icd9cm-vol3.pdf",
    "score": 0.68,
    "text": "47.09 Other appendectomy\n47.01 Laparoscopic appendectomy",
    "metadata": {"page": 4, "doc_type": "icd9cm"},
}


@pytest.fixture
def boxes(monkeypatch):
    """Retrieval that honours code_system, the way the real index does."""
    def fake_retrieve(question, top_k=None, mode=None, code_system="auto"):
        if code_system == "icd9cm":
            return "plain", [ICD9_CHUNK]
        if code_system == "icd10":
            return "plain", [ICD10_CHUNK]
        return "plain", [ICD10_CHUNK, ICD9_CHUNK]

    monkeypatch.setattr(suggest, "retrieve_chunks", fake_retrieve)
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [])
    monkeypatch.setattr(learn, "bump_hits", lambda ids: None)


def systems(out):
    return {c["code"]: c["system"] for c in out["codes"]}


def test_each_box_is_searched_on_its_own(boxes):
    out = suggest.suggest_codes(NARRATIVE)
    assert systems(out)["K35.80"] == "ICD-10"
    assert systems(out)["47.09"] == "ICD-9"


def test_a_page_number_in_an_icd10_pdf_is_not_a_procedure_code(boxes):
    out = suggest.suggest_codes(NARRATIVE)
    codes = systems(out)
    assert "10.2" not in codes          # a section number
    assert "35.8" not in codes          # a table reference


def test_an_untagged_chunk_needs_a_title_to_offer_a_procedure(monkeypatch):
    """Legacy uploads (no doc_type) still answer, but a BARE NN.NN number in
    one is not evidence of anything — only a code with its title is."""
    untagged = {
        "id": "legacy:p1-c0",
        "source": "legacy.pdf",
        "score": 0.6,
        "text": "Reviewed 12.5 percent of charts.\n47.09 Other appendectomy",
        "metadata": {"page": 1},
    }
    monkeypatch.setattr(suggest, "retrieve_chunks",
                        lambda *a, **k: ("plain", [untagged]))
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [])
    monkeypatch.setattr(learn, "bump_hits", lambda ids: None)

    codes = systems(suggest.suggest_codes(NARRATIVE))
    assert codes["47.09"] == "ICD-9"    # titled: a real catalogue entry
    assert "12.5" not in codes          # bare: a percentage, not a code


def test_a_taught_code_keeps_the_shape_the_coder_typed(monkeypatch):
    """A coder-taught code is trusted as typed — it is bucketed by shape but
    never shape-CHECKED, so local code systems survive."""
    note = {
        "id": "ln_1", "scenario": "s", "rule": "r", "created_by": "Ouzdim",
        "created_at": "2026-08-24T00:00:00+00:00", "match": 0.9,
        "codes": [{"code": "K35.80", "system": "ICD-10", "description": "",
                   "role": "principal"}],
    }
    monkeypatch.setattr(suggest, "retrieve_chunks",
                        lambda *a, **k: ("plain", []))
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [note])
    monkeypatch.setattr(learn, "bump_hits", lambda ids: None)

    out = suggest.suggest_codes(NARRATIVE)
    assert out["codes"][0]["code"] == "K35.80"
    assert out["codes"][0]["confidence"] == 99
